import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  OpenAIAuth,
  DatabaseConnector,
  SchemaEngine,
  LLMClient,
  QueryExecutor,
} from '@agentdb/core';

import { createAuthRoutes } from './routes/auth.js';
import { createConnectionRoutes } from './routes/connections.js';
import { createSchemaRoutes } from './routes/schema.js';
import { createQueryRoutes } from './routes/query.js';
import { createChatRoutes } from './routes/chat.js';
import { errorHandler } from './middleware/error-handler.js';
import { setupChatSocket } from './ws/chat-socket.js';

// ─── Types ───

export interface QueryHistoryEntry {
  sql: string;
  rowCount: number;
  duration: number;
  error?: string;
  timestamp: string;
}

export interface ServerState {
  auth: OpenAIAuth;
  isAuthenticated: boolean;
  accountId: string | null;
  pendingOAuth: { codeVerifier: string; state: string; redirectUri: string } | null;
  activeConnection: DatabaseConnector | null;
  schemaEngine: SchemaEngine | null;
  llmClient: LLMClient | null;
  executor: QueryExecutor | null;
  queryHistory: QueryHistoryEntry[];
}

// ─── Server Setup ───

const PORT = parseInt(process.env.PORT || '3001', 10);

const app = express();
const server = createServer(app);

// State
const auth = new OpenAIAuth();
auth.loadFromConfig();

const state: ServerState = {
  auth,
  isAuthenticated: auth.isAuthenticated(),
  accountId: auth.isAuthenticated() ? auth.getAccountId() : null,
  pendingOAuth: null,
  activeConnection: null,
  schemaEngine: null,
  llmClient: null,
  executor: null,
  queryHistory: [],
};

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', createAuthRoutes(state));
app.use('/api/connections', createConnectionRoutes(state));
app.use('/api/schema', createSchemaRoutes(state));
app.use('/api/query', createQueryRoutes(state));
app.use('/api/chat', createChatRoutes(state));

// Health
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    authenticated: state.isAuthenticated,
    connected: state.activeConnection !== null,
  });
});

// Production: serve static files
if (process.env.NODE_ENV === 'production') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const webDistPath = path.join(__dirname, '../../web/dist');
  app.use(express.static(webDistPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      res.sendFile(path.join(webDistPath, 'index.html'));
    }
  });
}

// Error handler (must be last)
app.use(errorHandler);

// WebSocket
setupChatSocket(server, state);

// Start
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║       🗄️  AgentDB Server            ║
║                                      ║
║  API:  http://localhost:${PORT}          ║
║  WS:   ws://localhost:${PORT}/ws/chat    ║
║                                      ║
║  Auth: ${state.isAuthenticated ? '✅ Authenticated' : '❌ Not authenticated'}        ║
╚══════════════════════════════════════╝
  `);
});

export { app, server };
