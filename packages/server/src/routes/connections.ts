import { Router, type Request, type Response, type NextFunction } from 'express';
import { DatabaseConnector, SchemaEngine, addConnection, removeConnection, getConnections } from '@agentdb/core';
import { createApiError } from '../middleware/error-handler.js';
import type { ServerState } from '../index.js';

export function createConnectionRoutes(state: ServerState): Router {
  const router = Router();

  // GET /api/connections
  router.get('/', (_req: Request, res: Response) => {
    const connections = getConnections();
    res.json(connections.map(c => ({
      name: c.name,
      url: c.url.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'),
      isDefault: c.isDefault,
      connected: state.activeConnection?.getConnectionUrl() === c.url,
    })));
  });

  // POST /api/connections
  router.post('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, url } = req.body as { name: string; url: string };
      if (!name || !url) {
        throw createApiError('Nome e URL são obrigatórios', 400, 'VALIDATION_ERROR');
      }
      addConnection(name, url);
      res.status(201).json({ name, url: url.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@') });
    } catch (error) {
      next(error);
    }
  });

  // DELETE /api/connections/:name
  router.delete('/:name', (req: Request, res: Response) => {
    const rawName = req.params.name;
    const name = Array.isArray(rawName) ? rawName[0] : rawName;
    if (!name) {
      throw createApiError('Nome da conexão é obrigatório', 400, 'VALIDATION_ERROR');
    }
    removeConnection(name);
    res.json({ success: true });
  });

  // POST /api/connections/:name/connect
  router.post('/:name/connect', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawName = req.params.name;
      const name = Array.isArray(rawName) ? rawName[0] : rawName;
      if (!name) {
        throw createApiError('Nome da conexão é obrigatório', 400, 'VALIDATION_ERROR');
      }
      const connections = getConnections();
      const conn = connections.find(c => c.name === name);

      if (!conn) {
        throw createApiError(`Conexão "${name}" não encontrada`, 404, 'NOT_FOUND');
      }

      // Desconectar se já tem uma ativa
      if (state.activeConnection) {
        try {
          await state.activeConnection.disconnect();
        } catch {
          // ignore
        }
      }

      const db = new DatabaseConnector(conn.url);
      const info = await db.connect();

      state.activeConnection = db;
      state.schemaEngine = new SchemaEngine(db);
      // Resetar LLM e executor para que sejam re-inicializados com o novo schema
      state.llmClient = null;
      state.executor = null;

      const schema = await state.schemaEngine.mapDatabase();

      res.json({
        database: info.database,
        version: info.version,
        schemas: info.schemas,
        tableCount: schema.tables.length,
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/connections/:name/disconnect
  router.post('/:name/disconnect', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      if (state.activeConnection) {
        await state.activeConnection.disconnect();
        state.activeConnection = null;
        state.schemaEngine = null;
        state.llmClient = null;
        state.executor = null;
      }
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/connections/test
  router.post('/test', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url } = req.body as { url: string };
      if (!url) {
        throw createApiError('URL é obrigatória', 400, 'VALIDATION_ERROR');
      }
      const testDb = new DatabaseConnector(url);
      const info = await testDb.connect();
      await testDb.disconnect();
      res.json({ success: true, database: info.database, version: info.version });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
