import { Router } from 'express';
import type { ServerState } from '../index.js';

export function createChatRoutes(_state: ServerState): Router {
  const router = Router();
  // Chat is handled via WebSocket, this is a placeholder for any REST chat endpoints
  return router;
}
