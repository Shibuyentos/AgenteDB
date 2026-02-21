import { Router, type Request, type Response, type NextFunction } from 'express';
import { loadConfig, saveConfig, type ScriptConfig } from '@agentdb/core';
import { createApiError } from '../middleware/error-handler.js';

function getConfigWithScripts() {
  const config = loadConfig() as any;
  if (!Array.isArray(config.scripts)) {
    config.scripts = [];
  }
  return config;
}

export function createScriptRoutes(): Router {
  const router = Router();

  // GET /api/scripts
  router.get('/', (_req: Request, res: Response) => {
    const config = getConfigWithScripts();
    res.json(config.scripts);
  });

  // POST /api/scripts
  router.post('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, sql } = req.body as { name?: string; sql?: string };
      const config = getConfigWithScripts();
      const now = new Date().toISOString();

      const script: ScriptConfig = {
        id: crypto.randomUUID(),
        name: name || 'Script sem título',
        sql: sql || '',
        createdAt: now,
        updatedAt: now,
      };

      config.scripts.push(script);
      saveConfig(config);
      res.status(201).json(script);
    } catch (error) {
      next(error);
    }
  });

  // PUT /api/scripts/:id
  router.put('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { name, sql } = req.body as { name?: string; sql?: string };
      const config = getConfigWithScripts();

      const index = config.scripts.findIndex((s: ScriptConfig) => s.id === id);
      if (index === -1) {
        throw createApiError('Script não encontrado', 404, 'NOT_FOUND');
      }

      if (name !== undefined) config.scripts[index].name = name;
      if (sql !== undefined) config.scripts[index].sql = sql;
      config.scripts[index].updatedAt = new Date().toISOString();

      saveConfig(config);
      res.json(config.scripts[index]);
    } catch (error) {
      next(error);
    }
  });

  // DELETE /api/scripts/:id
  router.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const config = getConfigWithScripts();

      const index = config.scripts.findIndex((s: ScriptConfig) => s.id === id);
      if (index === -1) {
        throw createApiError('Script não encontrado', 404, 'NOT_FOUND');
      }

      config.scripts.splice(index, 1);
      saveConfig(config);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
