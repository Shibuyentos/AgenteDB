// ─── Shared Types ───

export interface Connection {
  name: string;
  url: string;
  isDefault?: boolean;
  connected?: boolean;
}

export interface SchemaMap {
  database: string;
  version: string;
  schemas: string[];
  tables: TableInfo[];
  mappedAt: string;
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

export interface TableSummary {
  schema: string;
  name: string;
  type: 'table' | 'view';
  columnCount: number;
  rowCount: number;
  relationCount: number;
}

export interface RelationGraph {
  nodes: RelationNode[];
  edges: RelationEdge[];
}

export interface RelationNode {
  id: string;
  label: string;
  schema: string;
  type: 'table' | 'view';
  columnCount: number;
  rowCount: number;
}

export interface RelationEdge {
  from: string;
  to: string;
  label: string;
  fromColumn: string;
  toColumn: string;
}

export interface SqlScript {
  id: string;
  name: string;
  sql: string;
  createdAt: string;
  updatedAt: string;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  duration: number;
  columns: string[];
}

export interface QueryHistoryEntry {
  sql: string;
  rowCount: number;
  duration: number;
  error?: string;
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'thinking' | 'text' | 'sql' | 'executing' | 'result' | 'summary' | 'error';
  content?: string;
  data?: QueryResult;
  timestamp: Date;
}
