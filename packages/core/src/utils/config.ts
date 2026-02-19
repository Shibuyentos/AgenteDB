import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Interfaces ───

export interface ConnectionConfig {
  name: string;
  url: string;
  isDefault?: boolean;
}

export interface AuthConfig {
  provider: 'openai' | 'anthropic' | 'ollama';
  accessToken?: string;
  refreshToken?: string;
  tokenExpires?: string;
  accountId?: string;
  chatgptAccountId?: string;
  model?: string;
}

export interface ConfigData {
  connections: ConnectionConfig[];
  auth: AuthConfig | null;
}

// ─── Constantes ───

const CONFIG_DIR = path.join(os.homedir(), '.agentdb');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// ─── Helpers ───

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function getDefaultConfig(): ConfigData {
  return {
    connections: [],
    auth: null,
  };
}

// ─── Funções exportadas ───

export function loadConfig(): ConfigData {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    const defaultConfig = getDefaultConfig();
    saveConfig(defaultConfig);
    return defaultConfig;
  }

  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as ConfigData;

    if (!Array.isArray(parsed.connections)) {
      parsed.connections = [];
    }

    return parsed;
  } catch {
    const defaultConfig = getDefaultConfig();
    saveConfig(defaultConfig);
    return defaultConfig;
  }
}

export function saveConfig(data: ConfigData): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function getDefaultConnection(): ConnectionConfig | null {
  const config = loadConfig();

  const defaultConn = config.connections.find((c) => c.isDefault);
  if (defaultConn) return defaultConn;

  if (config.connections.length === 1) return config.connections[0];

  return null;
}

export function addConnection(name: string, url: string): void {
  const config = loadConfig();

  const existing = config.connections.findIndex((c) => c.name === name);
  if (existing >= 0) {
    config.connections[existing].url = url;
  } else {
    const isDefault = config.connections.length === 0;
    config.connections.push({ name, url, isDefault });
  }

  saveConfig(config);
}

export function removeConnection(name: string): void {
  const config = loadConfig();
  config.connections = config.connections.filter((c) => c.name !== name);
  saveConfig(config);
}

export function setDefaultConnection(name: string): void {
  const config = loadConfig();

  let found = false;
  for (const conn of config.connections) {
    conn.isDefault = conn.name === name;
    if (conn.name === name) found = true;
  }

  if (!found) {
    throw new Error(`Conexão "${name}" não encontrada.`);
  }

  saveConfig(config);
}

export function getConnections(): ConnectionConfig[] {
  const config = loadConfig();
  return config.connections;
}

export function getAuth(): AuthConfig | null {
  const config = loadConfig();
  return config.auth;
}

export function saveAuth(authData: AuthConfig): void {
  const config = loadConfig();
  config.auth = authData;
  saveConfig(config);
}
