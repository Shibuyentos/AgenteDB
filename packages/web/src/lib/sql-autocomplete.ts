import type { SchemaMap } from '../types';

export type SuggestionKind = 'schema' | 'table' | 'column' | 'keyword';

export interface Suggestion {
  label: string;
  kind: SuggestionKind;
  detail?: string; // e.g. column type "varchar", table schema "public"
  insertText: string;
}

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN',
  'FULL JOIN', 'CROSS JOIN', 'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS',
  'BETWEEN', 'LIKE', 'ILIKE', 'IS NULL', 'IS NOT NULL',
  'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET',
  'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
  'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE',
  'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'UNION', 'UNION ALL', 'WITH', 'COALESCE', 'CAST',
  'ASC', 'DESC', 'NULLS FIRST', 'NULLS LAST',
  'TRUE', 'FALSE', 'NULL',
];

// Keywords that expect a table name after them
const TABLE_CONTEXT_KEYWORDS = [
  'FROM', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN',
  'FULL JOIN', 'CROSS JOIN', 'INTO', 'UPDATE', 'TABLE',
];

// Keywords that expect a column/expression after them
const COLUMN_CONTEXT_KEYWORDS = [
  'SELECT', 'WHERE', 'ON', 'AND', 'OR', 'BY', 'SET', 'HAVING',
];

interface ParsedContext {
  /** The word fragment being typed (used for filtering) */
  currentWord: string;
  /** Start position of the current word in the SQL string */
  wordStart: number;
  /** What kind of suggestions to show */
  contextType: 'table' | 'column' | 'dot-schema' | 'dot-table' | 'keyword' | 'mixed';
  /** For dot contexts, the prefix before the dot */
  dotPrefix?: string;
  /** Tables referenced in FROM/JOIN clauses */
  referencedTables: { schema: string; name: string; alias?: string }[];
}

/**
 * Parse SQL text up to cursor position to determine autocomplete context.
 */
function parseContext(sql: string, cursorPos: number): ParsedContext {
  const textBeforeCursor = sql.substring(0, cursorPos);

  // Find current word (from last whitespace, comma, or paren to cursor)
  const wordMatch = textBeforeCursor.match(/([a-zA-Z0-9_."]+)$/);
  const currentWord = wordMatch ? wordMatch[1] : '';
  const wordStart = cursorPos - currentWord.length;

  // Check for dot context: "something."
  if (currentWord.includes('.')) {
    const parts = currentWord.split('.');
    const prefix = parts[0].replace(/"/g, '');
    const partial = parts.slice(1).join('.');

    return {
      currentWord: partial,
      wordStart: wordStart + parts[0].length + 1,
      contextType: 'dot-schema', // will be resolved in getSuggestions
      dotPrefix: prefix,
      referencedTables: extractReferencedTables(textBeforeCursor),
    };
  }

  // Find the previous meaningful keyword
  const prevKeyword = findPreviousKeyword(textBeforeCursor, wordStart);

  // Extract referenced tables
  const referencedTables = extractReferencedTables(textBeforeCursor);

  if (prevKeyword && TABLE_CONTEXT_KEYWORDS.includes(prevKeyword)) {
    return { currentWord, wordStart, contextType: 'table', referencedTables };
  }

  if (prevKeyword && COLUMN_CONTEXT_KEYWORDS.includes(prevKeyword)) {
    return { currentWord, wordStart, contextType: 'column', referencedTables };
  }

  // After a comma in SELECT or other list context
  const commaContext = findCommaContext(textBeforeCursor);
  if (commaContext === 'select') {
    return { currentWord, wordStart, contextType: 'column', referencedTables };
  }

  return { currentWord, wordStart, contextType: 'mixed', referencedTables };
}

/**
 * Find the previous SQL keyword before the current word.
 */
function findPreviousKeyword(text: string, wordStart: number): string | null {
  const before = text.substring(0, wordStart).trimEnd().toUpperCase();

  // Check multi-word keywords first
  const multiWordPatterns = [
    'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN', 'CROSS JOIN',
    'ORDER BY', 'GROUP BY', 'INSERT INTO', 'DELETE FROM',
    'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE',
  ];
  for (const kw of multiWordPatterns) {
    if (before.endsWith(kw)) return kw;
  }

  // Single word keyword
  const lastWordMatch = before.match(/([A-Z_]+)$/);
  if (lastWordMatch) return lastWordMatch[1];

  return null;
}

/**
 * Check if we're after a comma in a SELECT list or similar.
 */
function findCommaContext(text: string): string | null {
  const trimmed = text.trimEnd();
  if (!trimmed.endsWith(',')) return null;

  // Walk backwards to find the clause keyword
  const upper = trimmed.toUpperCase();
  const selectIdx = upper.lastIndexOf('SELECT');
  const fromIdx = upper.lastIndexOf('FROM');
  const whereIdx = upper.lastIndexOf('WHERE');

  if (selectIdx > -1 && (fromIdx === -1 || selectIdx > fromIdx)) {
    return 'select';
  }

  return null;
}

/**
 * Extract table references from FROM/JOIN clauses.
 */
function extractReferencedTables(sql: string): { schema: string; name: string; alias?: string }[] {
  const results: { schema: string; name: string; alias?: string }[] = [];
  const upper = sql.toUpperCase();

  // Match patterns like: FROM schema.table [AS] alias, FROM table [AS] alias
  const tableRefRegex = /(?:FROM|JOIN)\s+("?[\w]+"?)(?:\.("?[\w]+"?))?\s*(?:AS\s+)?("?[\w]+"?)?/gi;
  let match;

  while ((match = tableRefRegex.exec(sql)) !== null) {
    const part1 = match[1]?.replace(/"/g, '') || '';
    const part2 = match[2]?.replace(/"/g, '') || '';
    const alias = match[3]?.replace(/"/g, '');

    if (part2) {
      // schema.table
      results.push({ schema: part1, name: part2, alias });
    } else {
      // just table name (assume public or any schema)
      results.push({ schema: '', name: part1, alias });
    }
  }

  return results;
}

/**
 * Get autocomplete suggestions based on SQL context and schema.
 */
export function getSuggestions(
  sql: string,
  cursorPos: number,
  schemaMap: SchemaMap | null,
): { suggestions: Suggestion[]; wordStart: number; wordEnd: number } {
  const ctx = parseContext(sql, cursorPos);
  let suggestions: Suggestion[] = [];

  const tables = schemaMap?.tables || [];
  const schemas = schemaMap?.schemas || [];

  switch (ctx.contextType) {
    case 'dot-schema': {
      const prefix = ctx.dotPrefix!.toLowerCase();

      // Check if prefix is a schema name → suggest tables from that schema
      const isSchema = schemas.some(s => s.toLowerCase() === prefix);
      if (isSchema) {
        suggestions = tables
          .filter(t => t.schema.toLowerCase() === prefix)
          .map(t => ({
            label: t.name,
            kind: 'table' as const,
            detail: t.type,
            insertText: t.name,
          }));
        break;
      }

      // Check if prefix is a table name or alias → suggest columns
      const matchedTable = findTableByNameOrAlias(prefix, ctx.referencedTables, tables);
      if (matchedTable) {
        suggestions = matchedTable.columns.map(c => ({
          label: c.name,
          kind: 'column' as const,
          detail: c.type,
          insertText: c.name,
        }));
        break;
      }

      // Fallback: try matching as table name across all schemas
      const anyTable = tables.find(t => t.name.toLowerCase() === prefix);
      if (anyTable) {
        suggestions = anyTable.columns.map(c => ({
          label: c.name,
          kind: 'column' as const,
          detail: c.type,
          insertText: c.name,
        }));
      }
      break;
    }

    case 'table': {
      // Suggest schema.table format
      suggestions = [
        ...schemas.map(s => ({
          label: s,
          kind: 'schema' as const,
          detail: 'schema',
          insertText: s,
        })),
        ...tables.map(t => ({
          label: `${t.schema}.${t.name}`,
          kind: 'table' as const,
          detail: t.type,
          insertText: `${t.schema}.${t.name}`,
        })),
      ];
      break;
    }

    case 'column': {
      // Suggest columns from referenced tables + keywords
      const refTables = resolveReferencedTables(ctx.referencedTables, tables);
      for (const table of refTables) {
        for (const col of table.columns) {
          suggestions.push({
            label: refTables.length > 1 ? `${table.name}.${col.name}` : col.name,
            kind: 'column',
            detail: `${col.type}${col.isPrimaryKey ? ' PK' : ''}`,
            insertText: refTables.length > 1 ? `${table.name}.${col.name}` : col.name,
          });
        }
      }

      // Also suggest keywords
      suggestions.push(...getKeywordSuggestions());
      break;
    }

    case 'mixed':
    default: {
      // Suggest keywords + schemas + tables
      suggestions = [
        ...getKeywordSuggestions(),
        ...schemas.map(s => ({
          label: s,
          kind: 'schema' as const,
          detail: 'schema',
          insertText: s,
        })),
        ...tables.map(t => ({
          label: `${t.schema}.${t.name}`,
          kind: 'table' as const,
          detail: t.type,
          insertText: `${t.schema}.${t.name}`,
        })),
      ];
      break;
    }
  }

  // Filter by current word
  if (ctx.currentWord) {
    const filter = ctx.currentWord.toLowerCase();
    suggestions = suggestions.filter(s =>
      s.label.toLowerCase().includes(filter)
    );
  }

  // Limit results
  suggestions = suggestions.slice(0, 50);

  return {
    suggestions,
    wordStart: ctx.wordStart,
    wordEnd: cursorPos,
  };
}

function getKeywordSuggestions(): Suggestion[] {
  return SQL_KEYWORDS.map(kw => ({
    label: kw,
    kind: 'keyword' as const,
    insertText: kw,
  }));
}

function findTableByNameOrAlias(
  name: string,
  refs: { schema: string; name: string; alias?: string }[],
  tables: import('../types').TableInfo[],
): import('../types').TableInfo | null {
  // Check aliases first
  for (const ref of refs) {
    if (ref.alias?.toLowerCase() === name) {
      const found = tables.find(t =>
        t.name.toLowerCase() === ref.name.toLowerCase() &&
        (!ref.schema || t.schema.toLowerCase() === ref.schema.toLowerCase())
      );
      if (found) return found;
    }
  }

  // Check direct table names
  for (const ref of refs) {
    if (ref.name.toLowerCase() === name) {
      const found = tables.find(t =>
        t.name.toLowerCase() === ref.name.toLowerCase() &&
        (!ref.schema || t.schema.toLowerCase() === ref.schema.toLowerCase())
      );
      if (found) return found;
    }
  }

  return null;
}

function resolveReferencedTables(
  refs: { schema: string; name: string; alias?: string }[],
  tables: import('../types').TableInfo[],
): import('../types').TableInfo[] {
  const resolved: import('../types').TableInfo[] = [];
  for (const ref of refs) {
    const found = tables.find(t =>
      t.name.toLowerCase() === ref.name.toLowerCase() &&
      (!ref.schema || t.schema.toLowerCase() === ref.schema.toLowerCase())
    );
    if (found && !resolved.includes(found)) {
      resolved.push(found);
    }
  }
  return resolved;
}
