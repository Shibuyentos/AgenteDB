import { DatabaseConnector } from '../db/connector.js';

// ─── Interfaces ───

export interface ExecutionResult {
  sql: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  duration: number;
  columns?: string[];
  error?: string;
}

// ─── Classe ───

const DESTRUCTIVE_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'CREATE',
];

export class QueryExecutor {
  private db: DatabaseConnector;
  private readOnlyMode: boolean = true;

  constructor(db: DatabaseConnector) {
    this.db = db;
  }

  extractSQL(llmResponse: string): string | null {
    const sqlBlockRegex = /```sql\s*\n([\s\S]*?)```/i;
    const blockMatch = llmResponse.match(sqlBlockRegex);
    if (blockMatch) {
      const sql = blockMatch[1].trim();
      if (sql.length > 0) return sql;
    }

    const genericBlockRegex = /```\s*\n([\s\S]*?)```/;
    const genericMatch = llmResponse.match(genericBlockRegex);
    if (genericMatch) {
      const content = genericMatch[1].trim();
      if (this.looksLikeSQL(content)) {
        return content;
      }
    }

    const lines = llmResponse.split('\n');
    const sqlLines: string[] = [];
    let inSQL = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!inSQL && this.looksLikeSQL(trimmed)) {
        inSQL = true;
      }
      if (inSQL) {
        if (trimmed.length === 0 && sqlLines.length > 0) {
          sqlLines.push(trimmed);
        } else if (trimmed.length > 0) {
          sqlLines.push(trimmed);
        } else if (sqlLines.length > 0) {
          break;
        }
      }
    }

    if (sqlLines.length > 0) {
      const sql = sqlLines.join('\n').trim();
      if (sql.endsWith(';')) return sql;
      if (this.looksLikeSQL(sql)) return sql;
    }

    return null;
  }

  async execute(sql: string): Promise<ExecutionResult> {
    if (this.isDestructiveQuery(sql) && this.readOnlyMode) {
      return {
        sql,
        rows: [],
        rowCount: 0,
        duration: 0,
        error:
          'Modo somente leitura ativo. Desabilite read-only para executar.',
      };
    }

    try {
      if (!this.isDestructiveQuery(sql)) {
        const result = await this.db.readOnlyQuery(sql);
        return {
          sql,
          rows: result.rows,
          rowCount: result.rowCount,
          duration: result.duration,
          columns: result.columns,
        };
      }

      const result = await this.db.query(sql);
      return {
        sql,
        rows: result.rows,
        rowCount: result.rowCount,
        duration: result.duration,
        columns: result.columns,
      };
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Erro desconhecido na query';
      return {
        sql,
        rows: [],
        rowCount: 0,
        duration: 0,
        error: msg,
      };
    }
  }

  isDestructiveQuery(sql: string): boolean {
    const cleaned = sql
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
      .toUpperCase();

    for (const keyword of DESTRUCTIVE_KEYWORDS) {
      const regex = new RegExp(`(^|;)\\s*${keyword}\\b`);
      if (regex.test(cleaned)) {
        return true;
      }
    }

    return false;
  }

  setReadOnlyMode(enabled: boolean): void {
    this.readOnlyMode = enabled;
  }

  isReadOnly(): boolean {
    return this.readOnlyMode;
  }

  private looksLikeSQL(text: string): boolean {
    const upper = text.toUpperCase().trim();
    const sqlStarters = [
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'CREATE',
      'ALTER',
      'DROP',
      'TRUNCATE',
      'WITH',
      'EXPLAIN',
      'BEGIN',
    ];
    return sqlStarters.some((kw) => upper.startsWith(kw));
  }
}
