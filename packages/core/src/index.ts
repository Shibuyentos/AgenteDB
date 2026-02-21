// ─── Core exports ───
// Auth
export { OpenAIAuth } from './auth/oauth.js';
export type { TokenData, IAuthProvider } from './auth/oauth.js';
export { AnthropicAuth } from './auth/anthropic-oauth.js';
export type { AnthropicTokenData } from './auth/anthropic-oauth.js';

// Database
export { DatabaseConnector } from './db/connector.js';
export type { ConnectionInfo, QueryResultData } from './db/connector.js';

export { SchemaEngine } from './db/schema-engine.js';
export type {
  ColumnInfo,
  ForeignKey,
  IndexInfo,
  TableInfo,
  SchemaMap,
} from './db/schema-engine.js';

// Agent
export { ContextBuilder } from './agent/context.js';

export { LLMClient } from './agent/llm.js';
export type { LLMMessage, LLMResponse } from './agent/llm.js';

export { QueryExecutor } from './agent/executor.js';
export type { ExecutionResult } from './agent/executor.js';

// Utils
export {
  loadConfig,
  saveConfig,
  getDefaultConnection,
  addConnection,
  removeConnection,
  setDefaultConnection,
  getConnections,
  getAuth,
  saveAuth,
} from './utils/config.js';
export type {
  ConnectionConfig,
  AuthConfig,
  ConfigData,
} from './utils/config.js';

export { log } from './utils/logger.js';
