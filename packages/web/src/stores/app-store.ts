import { create } from 'zustand';
import type { Connection, SchemaMap, TableInfo } from '../types';

export type SidebarTab = 'connections' | 'schema' | 'history';
export type ActivePage = 'chat' | 'query-editor' | 'table-detail';
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface AppState {
  // Auth
  isAuthenticated: boolean;
  accountId: string | null;
  provider: 'openai' | 'anthropic' | null;
  model: string | null;

  // Connection
  connections: Connection[];
  activeConnection: Connection | null;
  connectionStatus: ConnectionStatus;
  dbInfo: { database: string; version: string; tableCount: number } | null;

  // Schema
  schemaMap: SchemaMap | null;
  isLoadingSchema: boolean;

  // UI
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  activePage: ActivePage;
  selectedTable: { schema: string; name: string } | null;
  readOnlyMode: boolean;

  // Actions
  setModel: (model: string | null) => void;
  setAuthenticated: (status: boolean, accountId?: string, provider?: 'openai' | 'anthropic' | null) => void;
  setConnections: (conns: Connection[]) => void;
  addConnection: (conn: Connection) => void;
  removeConnection: (name: string) => void;
  setActiveConnection: (conn: Connection | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setDbInfo: (info: { database: string; version: string; tableCount: number } | null) => void;
  setSchemaMap: (schema: SchemaMap | null) => void;
  setIsLoadingSchema: (loading: boolean) => void;
  setActivePage: (page: ActivePage) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  selectTable: (schema: string, name: string) => void;
  toggleSidebar: () => void;
  toggleReadOnly: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Auth
  isAuthenticated: false,
  accountId: null,
  provider: null,
  model: null,

  // Connection
  connections: [],
  activeConnection: null,
  connectionStatus: 'disconnected',
  dbInfo: null,

  // Schema
  schemaMap: null,
  isLoadingSchema: false,

  // UI
  sidebarOpen: true,
  sidebarTab: 'connections',
  activePage: 'chat',
  selectedTable: null,
  readOnlyMode: true,

  // Actions
  setModel: (model) => set({ model }),
  setAuthenticated: (status, accountId, provider) =>
    set({ isAuthenticated: status, accountId: accountId || null, provider: provider ?? null }),

  setConnections: (conns) => set({ connections: conns }),

  addConnection: (conn) =>
    set((s) => ({ connections: [...s.connections, conn] })),

  removeConnection: (name) =>
    set((s) => ({
      connections: s.connections.filter((c) => c.name !== name),
    })),

  setActiveConnection: (conn) => set({ activeConnection: conn }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setDbInfo: (info) => set({ dbInfo: info }),
  setSchemaMap: (schema) => set({ schemaMap: schema }),
  setIsLoadingSchema: (loading) => set({ isLoadingSchema: loading }),
  setActivePage: (page) => set({ activePage: page }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  selectTable: (schema, name) =>
    set({
      selectedTable: { schema, name },
      activePage: 'table-detail',
    }),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleReadOnly: () => set((s) => ({ readOnlyMode: !s.readOnlyMode })),
}));
