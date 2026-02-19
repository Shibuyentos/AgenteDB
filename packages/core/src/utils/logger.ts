import chalk from 'chalk';

// ─── SQL Keywords para syntax highlight ───
const SQL_KEYWORDS_PRIMARY = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE'];
const SQL_KEYWORDS_CLAUSE = ['FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'OUTER JOIN', 'FULL JOIN', 'CROSS JOIN', 'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE', 'IS', 'NULL', 'AS'];
const SQL_KEYWORDS_OTHER = ['ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'EXCEPT', 'INTERSECT', 'DISTINCT', 'INTO', 'VALUES', 'SET', 'RETURNING', 'CASCADE', 'RESTRICT', 'DEFAULT', 'REFERENCES', 'FOREIGN KEY', 'PRIMARY KEY', 'CONSTRAINT', 'INDEX', 'TABLE', 'VIEW', 'SCHEMA', 'BEGIN', 'COMMIT', 'ROLLBACK', 'WITH', 'RECURSIVE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE'];

function highlightSQL(sql: string): string {
  let result = sql;

  result = result.replace(/'([^']*)'/g, chalk.yellow("'$1'"));

  for (const kw of SQL_KEYWORDS_PRIMARY) {
    const regex = new RegExp(`\\b(${kw})\\b`, 'gi');
    result = result.replace(regex, chalk.magentaBright.bold('$1'));
  }

  for (const kw of SQL_KEYWORDS_CLAUSE) {
    const regex = new RegExp(`\\b(${kw.replace(/ /g, '\\s+')})\\b`, 'gi');
    result = result.replace(regex, chalk.cyanBright('$1'));
  }

  for (const kw of SQL_KEYWORDS_OTHER) {
    const regex = new RegExp(`\\b(${kw.replace(/ /g, '\\s+')})\\b`, 'gi');
    result = result.replace(regex, chalk.blue('$1'));
  }

  result = result.replace(/\b(\d+)\b/g, chalk.greenBright('$1'));

  return result;
}

function formatTable(data: Record<string, unknown>[]): string {
  if (!data || data.length === 0) {
    return chalk.dim('  (nenhum resultado)');
  }

  const headers = Object.keys(data[0]);

  const colWidths: Record<string, number> = {};
  for (const h of headers) {
    colWidths[h] = h.length;
  }
  for (const row of data) {
    for (const h of headers) {
      const val = String(row[h] ?? 'NULL');
      if (val.length > colWidths[h]) {
        colWidths[h] = Math.min(val.length, 40);
      }
    }
  }

  const pad = (str: string, len: number) => {
    const truncated = str.length > len ? str.slice(0, len - 1) + '…' : str;
    return truncated.padEnd(len);
  };

  const separator = '─';
  const lines: string[] = [];

  const topBorder = '┌' + headers.map(h => separator.repeat(colWidths[h] + 2)).join('┬') + '┐';
  lines.push(chalk.dim(topBorder));

  const headerLine = '│' + headers.map(h => ' ' + chalk.bold.white(pad(h, colWidths[h])) + ' ').join('│') + '│';
  lines.push(chalk.dim('│') + headerLine.slice(1, -1) + chalk.dim('│'));

  const headerSep = '├' + headers.map(h => separator.repeat(colWidths[h] + 2)).join('┼') + '┤';
  lines.push(chalk.dim(headerSep));

  for (const row of data) {
    const rowLine = headers.map(h => {
      const val = row[h] === null || row[h] === undefined ? chalk.dim('NULL') : String(row[h]);
      const displayVal = val.length > colWidths[h] ? val.slice(0, colWidths[h] - 1) + '…' : val;
      const rawLen = row[h] === null || row[h] === undefined ? 4 : String(row[h]).length;
      const paddedLen = Math.min(rawLen, colWidths[h]);
      const padding = ' '.repeat(Math.max(0, colWidths[h] - paddedLen));
      return ' ' + displayVal + padding + ' ';
    }).join(chalk.dim('│'));
    lines.push(chalk.dim('│') + rowLine + chalk.dim('│'));
  }

  const bottomBorder = '└' + headers.map(h => separator.repeat(colWidths[h] + 2)).join('┴') + '┘';
  lines.push(chalk.dim(bottomBorder));

  return '   ' + lines.join('\n   ');
}

export const log = {
  info: (msg: string) => {
    console.log(chalk.blue('ℹ') + ' ' + msg);
  },

  success: (msg: string) => {
    console.log(chalk.green('✓') + ' ' + msg);
  },

  warn: (msg: string) => {
    console.log(chalk.yellow('⚠') + ' ' + chalk.yellow(msg));
  },

  error: (msg: string) => {
    console.log(chalk.red('✗') + ' ' + chalk.red(msg));
  },

  agent: (msg: string) => {
    console.log(chalk.cyan('🤖') + ' ' + msg);
  },

  user: (msg: string) => {
    console.log(chalk.white('▶') + ' ' + msg);
  },

  sql: (query: string) => {
    console.log();
    console.log('   ' + chalk.dim('┌─ SQL ─────────────────────────'));
    const lines = query.trim().split('\n');
    for (const line of lines) {
      console.log('   ' + chalk.dim('│ ') + highlightSQL(line));
    }
    console.log('   ' + chalk.dim('└──────────────────────────────'));
    console.log();
  },

  table: (data: Record<string, unknown>[]) => {
    console.log();
    console.log(formatTable(data));
    console.log();
  },

  blank: () => {
    console.log();
  },

  dim: (msg: string) => {
    console.log(chalk.dim('  ' + msg));
  },

  banner: (text: string) => {
    console.log(chalk.cyan(text));
  },
};
