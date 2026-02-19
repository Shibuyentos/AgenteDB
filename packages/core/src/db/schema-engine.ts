import { DatabaseConnector } from './connector.js';

// ─── Interfaces ───

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  comment: string | null;
}

export interface ForeignKey {
  column: string;
  referencedSchema: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
}

export interface TableInfo {
  schema: string;
  name: string;
  type: 'table' | 'view';
  columns: ColumnInfo[];
  foreignKeys: ForeignKey[];
  referencedBy: ForeignKey[];
  indexes: IndexInfo[];
  estimatedRowCount: number;
  comment: string | null;
}

export interface SchemaMap {
  database: string;
  version: string;
  schemas: string[];
  tables: TableInfo[];
  mappedAt: Date;
}

// ─── Row types ───

interface TableRow {
  table_schema: string;
  table_name: string;
  table_type: string;
  comment: string | null;
  estimated_rows: string | null;
}

interface ColumnRow {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  character_maximum_length: number | null;
  is_nullable: string;
  column_default: string | null;
  comment: string | null;
}

interface PKRow {
  table_schema: string;
  table_name: string;
  column_name: string;
}

interface FKRow {
  table_schema: string;
  table_name: string;
  column_name: string;
  referenced_schema: string;
  referenced_table: string;
  referenced_column: string;
}

interface IndexRow {
  schemaname: string;
  tablename: string;
  indexname: string;
  indexdef: string;
}

// ─── Classe ───

export class SchemaEngine {
  private db: DatabaseConnector;
  private schemaMap: SchemaMap | null = null;

  constructor(db: DatabaseConnector) {
    this.db = db;
  }

  async mapDatabase(): Promise<SchemaMap> {
    const connInfo = await this.db.query<{ current_database: string }>(
      'SELECT current_database()'
    );
    const database = connInfo.rows[0].current_database;

    const versionResult = await this.db.query<{ version: string }>(
      'SELECT version()'
    );
    const fullVersion = versionResult.rows[0].version;
    const versionMatch = fullVersion.match(/PostgreSQL\s+([\d.]+)/);
    const version = versionMatch ? `PostgreSQL ${versionMatch[1]}` : fullVersion;

    const tablesResult = await this.db.query<TableRow>(`
      SELECT
        t.table_schema,
        t.table_name,
        t.table_type,
        pg_catalog.obj_description(c.oid) as comment,
        c.reltuples::bigint as estimated_rows
      FROM information_schema.tables t
      LEFT JOIN pg_catalog.pg_class c ON c.relname = t.table_name
      LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
      WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY t.table_schema, t.table_name
    `);

    const columnsResult = await this.db.query<ColumnRow>(`
      SELECT
        c.table_schema,
        c.table_name,
        c.column_name,
        c.data_type,
        c.character_maximum_length,
        c.is_nullable,
        c.column_default,
        pg_catalog.col_description(
          (SELECT oid FROM pg_catalog.pg_class WHERE relname = c.table_name LIMIT 1),
          c.ordinal_position
        ) as comment
      FROM information_schema.columns c
      WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY c.table_schema, c.table_name, c.ordinal_position
    `);

    const pkResult = await this.db.query<PKRow>(`
      SELECT
        tc.table_schema,
        tc.table_name,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
    `);

    const fkResult = await this.db.query<FKRow>(`
      SELECT
        tc.table_schema,
        tc.table_name,
        kcu.column_name,
        ccu.table_schema AS referenced_schema,
        ccu.table_name AS referenced_table,
        ccu.column_name AS referenced_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
    `);

    const indexResult = await this.db.query<IndexRow>(`
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    `);

    // ─── Monta sets de PKs ───
    const pkSet = new Set<string>();
    for (const pk of pkResult.rows) {
      pkSet.add(`${pk.table_schema}.${pk.table_name}.${pk.column_name}`);
    }

    // ─── Monta mapa de FKs ───
    const fkMap = new Map<string, ForeignKey[]>();
    const referencedByMap = new Map<string, ForeignKey[]>();

    for (const fk of fkResult.rows) {
      const key = `${fk.table_schema}.${fk.table_name}`;
      const refKey = `${fk.referenced_schema}.${fk.referenced_table}`;

      const fkInfo: ForeignKey = {
        column: fk.column_name,
        referencedSchema: fk.referenced_schema,
        referencedTable: fk.referenced_table,
        referencedColumn: fk.referenced_column,
      };

      if (!fkMap.has(key)) fkMap.set(key, []);
      fkMap.get(key)!.push(fkInfo);

      const reverseFK: ForeignKey = {
        column: fk.referenced_column,
        referencedSchema: fk.table_schema,
        referencedTable: fk.table_name,
        referencedColumn: fk.column_name,
      };

      if (!referencedByMap.has(refKey)) referencedByMap.set(refKey, []);
      referencedByMap.get(refKey)!.push(reverseFK);
    }

    // ─── Monta mapa de indexes ───
    const indexMap = new Map<string, IndexInfo[]>();

    for (const idx of indexResult.rows) {
      const key = `${idx.schemaname}.${idx.tablename}`;

      const colMatch = idx.indexdef.match(/\(([^)]+)\)/);
      const columns = colMatch
        ? colMatch[1].split(',').map((c: string) => c.trim().replace(/"/g, ''))
        : [];

      const isUnique = idx.indexdef.toUpperCase().includes('UNIQUE');
      const isPrimary = idx.indexname.endsWith('_pkey');

      const indexInfo: IndexInfo = {
        name: idx.indexname,
        columns,
        isUnique: isUnique || isPrimary,
        isPrimary,
      };

      if (!indexMap.has(key)) indexMap.set(key, []);
      indexMap.get(key)!.push(indexInfo);
    }

    // ─── Monta colunas por tabela ───
    const columnMap = new Map<string, ColumnInfo[]>();

    for (const col of columnsResult.rows) {
      const key = `${col.table_schema}.${col.table_name}`;

      let type = col.data_type;
      if (col.character_maximum_length) {
        type = `${col.data_type}(${col.character_maximum_length})`;
      }
      type = type
        .replace('character varying', 'varchar')
        .replace('character', 'char')
        .replace('timestamp without time zone', 'timestamp')
        .replace('timestamp with time zone', 'timestamptz')
        .replace('double precision', 'float8')
        .replace('boolean', 'bool');

      const columnInfo: ColumnInfo = {
        name: col.column_name,
        type,
        nullable: col.is_nullable === 'YES',
        defaultValue: col.column_default,
        isPrimaryKey: pkSet.has(
          `${col.table_schema}.${col.table_name}.${col.column_name}`
        ),
        comment: col.comment,
      };

      if (!columnMap.has(key)) columnMap.set(key, []);
      columnMap.get(key)!.push(columnInfo);
    }

    // ─── Monta tabelas ───
    const schemas = new Set<string>();
    const tables: TableInfo[] = [];

    for (const t of tablesResult.rows) {
      const key = `${t.table_schema}.${t.table_name}`;
      schemas.add(t.table_schema);

      const tableInfo: TableInfo = {
        schema: t.table_schema,
        name: t.table_name,
        type: t.table_type === 'VIEW' ? 'view' : 'table',
        columns: columnMap.get(key) ?? [],
        foreignKeys: fkMap.get(key) ?? [],
        referencedBy: referencedByMap.get(key) ?? [],
        indexes: indexMap.get(key) ?? [],
        estimatedRowCount: t.estimated_rows
          ? Math.max(0, parseInt(t.estimated_rows, 10))
          : 0,
        comment: t.comment,
      };

      tables.push(tableInfo);
    }

    this.schemaMap = {
      database,
      version,
      schemas: Array.from(schemas).sort(),
      tables,
      mappedAt: new Date(),
    };

    return this.schemaMap;
  }

  getSchemaMap(): SchemaMap | null {
    return this.schemaMap;
  }

  findTablesWithColumn(columnName: string): TableInfo[] {
    if (!this.schemaMap) return [];

    const lower = columnName.toLowerCase();
    return this.schemaMap.tables.filter((t) =>
      t.columns.some((c) => c.name.toLowerCase().includes(lower))
    );
  }

  findRelatedTables(
    schemaName: string,
    tableName: string,
    depth: number = 2
  ): TableInfo[] {
    if (!this.schemaMap) return [];

    const startKey = `${schemaName}.${tableName}`;
    const visited = new Set<string>();
    const result: TableInfo[] = [];
    const queue: { key: string; currentDepth: number }[] = [
      { key: startKey, currentDepth: 0 },
    ];

    visited.add(startKey);

    const tableMap = new Map<string, TableInfo>();
    for (const t of this.schemaMap.tables) {
      tableMap.set(`${t.schema}.${t.name}`, t);
    }

    while (queue.length > 0) {
      const item = queue.shift()!;

      if (item.currentDepth > 0) {
        const table = tableMap.get(item.key);
        if (table) result.push(table);
      }

      if (item.currentDepth >= depth) continue;

      const table = tableMap.get(item.key);
      if (!table) continue;

      for (const fk of table.foreignKeys) {
        const refKey = `${fk.referencedSchema}.${fk.referencedTable}`;
        if (!visited.has(refKey)) {
          visited.add(refKey);
          queue.push({ key: refKey, currentDepth: item.currentDepth + 1 });
        }
      }

      for (const ref of table.referencedBy) {
        const refKey = `${ref.referencedSchema}.${ref.referencedTable}`;
        if (!visited.has(refKey)) {
          visited.add(refKey);
          queue.push({ key: refKey, currentDepth: item.currentDepth + 1 });
        }
      }
    }

    return result;
  }

  searchTables(query: string): TableInfo[] {
    if (!this.schemaMap) return [];

    const lower = query.toLowerCase();
    return this.schemaMap.tables.filter(
      (t) =>
        t.name.toLowerCase().includes(lower) ||
        t.schema.toLowerCase().includes(lower) ||
        t.columns.some((c) => c.name.toLowerCase().includes(lower))
    );
  }

  getTable(schemaName: string, tableName: string): TableInfo | undefined {
    if (!this.schemaMap) return undefined;
    return this.schemaMap.tables.find(
      (t) => t.schema === schemaName && t.name === tableName
    );
  }

  generateContextSummary(): string {
    if (!this.schemaMap) return 'Schema não mapeado.';

    const { database, version, schemas, tables } = this.schemaMap;

    const tableCount = tables.filter((t) => t.type === 'table').length;
    const viewCount = tables.filter((t) => t.type === 'view').length;
    const totalRelations = tables.reduce(
      (acc, t) => acc + t.foreignKeys.length,
      0
    );

    const lines: string[] = [];

    lines.push(`Database: ${database} (${version})`);
    lines.push(`Schemas: ${schemas.join(', ')}`);
    lines.push(
      `Tables: ${tableCount} | Views: ${viewCount} | Total Relations: ${totalRelations}`
    );
    lines.push('');

    for (const table of tables) {
      const colParts: string[] = [];
      for (const col of table.columns) {
        let part = col.name;

        if (col.isPrimaryKey) part += ' PK';

        const fk = table.foreignKeys.find((f) => f.column === col.name);
        if (fk) {
          part += ` FK→${fk.referencedTable}.${fk.referencedColumn}`;
        }

        part += ` ${col.type}`;

        if (!col.nullable && !col.isPrimaryKey) part += ' NOT NULL';

        colParts.push(part);
      }

      const typeLabel = table.type === 'view' ? ' [VIEW]' : '';
      const rowLabel =
        table.estimatedRowCount > 0 ? ` [~${table.estimatedRowCount} rows]` : '';

      lines.push(
        `${table.schema}.${table.name} (${colParts.join(', ')})${typeLabel}${rowLabel}`
      );

      for (const ref of table.referencedBy) {
        lines.push(
          `  ← ${ref.referencedSchema}.${ref.referencedTable}.${ref.referencedColumn} FK`
        );
      }

      if (table.referencedBy.length > 0) {
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}
