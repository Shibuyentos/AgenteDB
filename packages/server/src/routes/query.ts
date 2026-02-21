import { Router, type Request, type Response, type NextFunction } from 'express';
import { createApiError } from '../middleware/error-handler.js';
import type { ServerState } from '../index.js';

export function createQueryRoutes(state: ServerState): Router {
  const router = Router();

  // POST /api/query/execute
  router.post('/execute', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!state.activeConnection) {
        throw createApiError('Nenhum banco conectado', 400, 'NO_CONNECTION');
      }
      if (!state.executor) {
        throw createApiError('Executor não inicializado', 500, 'INTERNAL_ERROR');
      }

      const { sql } = req.body as { sql: string };
      if (!sql) {
        throw createApiError('SQL é obrigatório', 400, 'VALIDATION_ERROR');
      }

      const result = await state.executor.execute(sql);

      // Salva no histórico
      state.queryHistory.unshift({
        sql,
        rowCount: result.rowCount,
        duration: result.duration,
        error: result.error,
        timestamp: new Date().toISOString(),
      });

      // Limita a 50
      if (state.queryHistory.length > 50) {
        state.queryHistory.pop();
      }

      if (result.error) {
        res.status(400).json({
          error: result.error,
          sql: result.sql,
        });
      } else {
        res.json({
          rows: result.rows,
          rowCount: result.rowCount,
          duration: result.duration,
          columns: result.columns || Object.keys(result.rows[0] || {}),
        });
      }
    } catch (error) {
      next(error);
    }
  });

  // POST /api/query/read-only
  router.post('/read-only', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { enabled } = req.body as { enabled: boolean };
      if (typeof enabled !== 'boolean') {
        throw createApiError('Campo "enabled" (boolean) é obrigatório', 400, 'VALIDATION_ERROR');
      }
      if (state.executor) {
        state.executor.setReadOnlyMode(enabled);
      }
      res.json({ readOnly: enabled });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/query/history
  router.get('/history', (_req: Request, res: Response) => {
    res.json(state.queryHistory);
  });

  // DELETE /api/query/history
  router.delete('/history', (_req: Request, res: Response) => {
    state.queryHistory = [];
    res.json({ success: true });
  });

  return router;
}
