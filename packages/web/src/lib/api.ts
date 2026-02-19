const API_URL = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return res.json();
}

function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

export const api = {
  auth: {
    status: () => get<{ authenticated: boolean; accountId?: string }>('/auth/status'),
    login: () => post<{ authUrl: string }>('/auth/login'),
    logout: () => post<{ success: boolean }>('/auth/logout'),
    setApiKey: (key: string) => post<{ success: boolean }>('/auth/apikey', { key }),
  },
  connections: {
    list: () => get<any[]>('/connections'),
    create: (data: { name: string; url: string }) => post<any>('/connections', data),
    remove: (name: string) => del<{ success: boolean }>(`/connections/${name}`),
    connect: (name: string) => post<{ database: string; version: string; schemas: string[]; tableCount: number }>(`/connections/${name}/connect`),
    disconnect: (name: string) => post<{ success: boolean }>(`/connections/${name}/disconnect`),
    test: (url: string) => post<{ success: boolean; database: string; version: string }>('/connections/test', { url }),
  },
  schema: {
    full: () => get<any>('/schema'),
    tables: () => get<any[]>('/schema/tables'),
    table: (schema: string, name: string) => get<any>(`/schema/tables/${schema}/${name}`),
    relations: () => get<any>('/schema/relations'),
  },
  query: {
    execute: (sql: string) => post<{ rows: any[]; rowCount: number; duration: number; columns: string[] }>('/query/execute', { sql }),
    history: () => get<any[]>('/query/history'),
    clearHistory: () => del<{ success: boolean }>('/query/history'),
  },
};
