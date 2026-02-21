import { Pool, PoolClient, QueryResult } from 'pg';

// ─── Interfaces ───

export interface ConnectionInfo {
  database: string;
  version: string;
  schemas: string[];
}

export interface QueryResultData<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
  duration: number; // em ms
  columns?: string[];
}

// ─── Classe ───

export class DatabaseConnector {
  private pool: Pool;
  private connectionUrl: string;
  private connected: boolean = false;

  constructor(connectionUrl: string) {
    this.connectionUrl = connectionUrl;
    this.pool = new Pool({
      connectionString: connectionUrl,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    this.pool.on('error', (err) => {
      console.error('Erro inesperado no pool de conexão:', err.message);
      this.connected = false;
    });
  }

  async connect(): Promise<ConnectionInfo> {
    try {
      const client = await this.pool.connect();

      try {
        const versionResult: QueryResult = await client.query('SELECT version()');
        const fullVersion = versionResult.rows[0].version as string;
        const versionMatch = fullVersion.match(/PostgreSQL\s+([\d.]+)/);
        const version = versionMatch ? `PostgreSQL ${versionMatch[1]}` : fullVersion;

        const dbResult: QueryResult = await client.query('SELECT current_database()');
        const database = dbResult.rows[0].current_database as string;

        const schemasResult: QueryResult = await client.query(
          `SELECT schema_name FROM information_schema.schemata 
           WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
           ORDER BY schema_name`
        );
        const schemas = schemasResult.rows.map(
          (r: { schema_name: string }) => r.schema_name
        );

        this.connected = true;

        return { database, version, schemas };
      } finally {
        client.release();
      }
    } catch (error) {
      this.connected = false;
      const msg =
        error instanceof Error ? error.message : 'Erro desconhecido de conexão';
      throw new Error(`Falha ao conectar ao banco de dados: ${msg}`);
    }
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResultData<T>> {
    const start = performance.now();

    try {
      const result: QueryResult = await this.pool.query(sql, params);
      const duration = Math.round((performance.now() - start) * 100) / 100;
      const columns = result.fields?.map(f => f.name) ?? [];

      return {
        rows: result.rows as T[],
        rowCount: result.rowCount ?? result.rows.length,
        duration,
        columns,
      };
    } catch (error) {
      const duration = Math.round((performance.now() - start) * 100) / 100;
      const msg =
        error instanceof Error ? error.message : 'Erro desconhecido na query';
      throw new Error(`Erro na query (${duration}ms): ${msg}`);
    }
  }

  async readOnlyQuery<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResultData<T>> {
    const start = performance.now();
    let client: PoolClient | null = null;

    try {
      client = await this.pool.connect();

      await client.query('BEGIN READ ONLY');

      const result: QueryResult = await client.query(sql, params);

      await client.query('COMMIT');

      const duration = Math.round((performance.now() - start) * 100) / 100;
      const columns = result.fields?.map(f => f.name) ?? [];

      return {
        rows: result.rows as T[],
        rowCount: result.rowCount ?? result.rows.length,
        duration,
        columns,
      };
    } catch (error) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Ignora erro no rollback
        }
      }

      const duration = Math.round((performance.now() - start) * 100) / 100;
      const msg =
        error instanceof Error ? error.message : 'Erro desconhecido na query';
      throw new Error(`Erro na query read-only (${duration}ms): ${msg}`);
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.pool.end();
      this.connected = false;
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Erro ao desconectar';
      throw new Error(`Falha ao desconectar: ${msg}`);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getConnectionUrl(): string {
    return this.connectionUrl;
  }
}
