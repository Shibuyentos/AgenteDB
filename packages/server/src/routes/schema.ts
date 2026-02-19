import { Router, type Request, type Response, type NextFunction } from 'express';
import { createApiError } from '../middleware/error-handler.js';
import type { ServerState } from '../index.js';

export function createSchemaRoutes(state: ServerState): Router {
  const router = Router();

  // GET /api/schema
  router.get('/', (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (!state.schemaEngine) {
        throw createApiError('Nenhum banco conectado', 400, 'NO_CONNECTION');
      }
      const schema = state.schemaEngine.getSchemaMap();
      if (!schema) {
        throw createApiError('Schema não mapeado', 400, 'NO_SCHEMA');
      }
      res.json(schema);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/schema/tables
  router.get('/tables', (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (!state.schemaEngine) {
        throw createApiError('Nenhum banco conectado', 400, 'NO_CONNECTION');
      }
      const schema = state.schemaEngine.getSchemaMap();
      if (!schema) {
        throw createApiError('Schema não mapeado', 400, 'NO_SCHEMA');
      }
      const tables = schema.tables.map(t => ({
        schema: t.schema,
        name: t.name,
        type: t.type,
        columnCount: t.columns.length,
        rowCount: t.estimatedRowCount,
        relationCount: t.foreignKeys.length + t.referencedBy.length,
      }));
      res.json(tables);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/schema/tables/:schema/:table
  router.get('/tables/:schema/:table', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!state.schemaEngine) {
        throw createApiError('Nenhum banco conectado', 400, 'NO_CONNECTION');
      }
      const table = state.schemaEngine.getTable(String(req.params.schema), String(req.params.table));
      if (!table) {
        throw createApiError('Tabela não encontrada', 404, 'NOT_FOUND');
      }
      res.json(table);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/schema/relations
  router.get('/relations', (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (!state.schemaEngine) {
        throw createApiError('Nenhum banco conectado', 400, 'NO_CONNECTION');
      }
      const schema = state.schemaEngine.getSchemaMap();
      if (!schema) {
        throw createApiError('Schema não mapeado', 400, 'NO_SCHEMA');
      }

      const nodes = schema.tables.map(t => ({
        id: `${t.schema}.${t.name}`,
        label: t.name,
        schema: t.schema,
        type: t.type,
        columnCount: t.columns.length,
        rowCount: t.estimatedRowCount,
      }));

      const edges: { from: string; to: string; label: string; fromColumn: string; toColumn: string }[] = [];
      for (const table of schema.tables) {
        for (const fk of table.foreignKeys) {
          edges.push({
            from: `${table.schema}.${table.name}`,
            to: `${fk.referencedSchema}.${fk.referencedTable}`,
            label: `${fk.column} → ${fk.referencedColumn}`,
            fromColumn: fk.column,
            toColumn: fk.referencedColumn,
          });
        }
      }

      res.json({ nodes, edges });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
