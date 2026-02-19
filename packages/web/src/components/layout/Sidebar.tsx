import { useState, useEffect } from 'react';
import {
  PlugZap, TableProperties, History, ChevronLeft, ChevronRight,
  Plus, Plug, Trash2, Table2, Eye, Search, Play, Copy,
  MoreHorizontal, Loader2,
} from 'lucide-react';
import { useAppStore, type SidebarTab } from '../../stores/app-store';
import { api } from '../../lib/api';
import { Badge, Input } from '../ui';
import { ConnectionModal } from '../modals/ConnectionModal';
import type { QueryHistoryEntry, TableSummary } from '../../types';

const tabs: { id: SidebarTab; icon: React.ReactNode; label: string }[] = [
  { id: 'connections', icon: <PlugZap className="w-5 h-5" />, label: 'Conexões' },
  { id: 'schema', icon: <TableProperties className="w-5 h-5" />, label: 'Schema' },
  { id: 'history', icon: <History className="w-5 h-5" />, label: 'Histórico' },
];

export function Sidebar() {
  const {
    sidebarOpen, sidebarTab, connectionStatus, connections,
    activeConnection, schemaMap, toggleSidebar, setSidebarTab,
    setConnections, addConnection: addConn, removeConnection: removeConn,
    setActiveConnection, setConnectionStatus, setDbInfo,
    setSchemaMap, setIsLoadingSchema, selectTable,
  } = useAppStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [connectingName, setConnectingName] = useState<string | null>(null);
  const [schemaSearch, setSchemaSearch] = useState('');
  const [history, setHistory] = useState<QueryHistoryEntry[]>([]);

  // Load connections on mount
  useEffect(() => {
    api.connections.list().then(setConnections).catch(console.error);
    api.auth.status().then(s => {
      useAppStore.getState().setAuthenticated(s.authenticated, s.accountId);
    }).catch(() => {});
  }, []);

  // Load history when tab opens
  useEffect(() => {
    if (sidebarTab === 'history') {
      api.query.history().then(setHistory).catch(console.error);
    }
  }, [sidebarTab]);

  const handleConnect = async (name: string) => {
    setConnectingName(name);
    setConnectionStatus('connecting');
    try {
      const result = await api.connections.connect(name);
      setConnectionStatus('connected');
      setActiveConnection(connections.find(c => c.name === name) || null);
      setDbInfo({
        database: result.database,
        version: result.version,
        tableCount: result.tableCount,
      });

      // Load schema
      setIsLoadingSchema(true);
      const schema = await api.schema.full();
      setSchemaMap(schema);
      setIsLoadingSchema(false);
      setSidebarTab('schema');
    } catch (error) {
      setConnectionStatus('error');
      console.error('Connect error:', error);
    } finally {
      setConnectingName(null);
    }
  };

  const handleDeleteConnection = async (name: string) => {
    try {
      await api.connections.remove(name);
      removeConn(name);
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  // ─── Schema Tree ───
  const schemaGroups = schemaMap
    ? schemaMap.schemas.map(schema => {
        const schemaTables = schemaMap.tables
          .filter(t => t.schema === schema)
          .filter(t =>
            !schemaSearch || t.name.toLowerCase().includes(schemaSearch.toLowerCase())
          );
        const tablesOnly = schemaTables.filter(t => t.type === 'table');
        const viewsOnly = schemaTables.filter(t => t.type === 'view');
        return { schema, tables: tablesOnly, views: viewsOnly };
      }).filter(g => g.tables.length > 0 || g.views.length > 0)
    : [];

  return (
    <>
      <div
        className={`
          flex shrink-0 bg-bg-card border-r border-border transition-all duration-200 ease-out h-full
          ${sidebarOpen ? 'w-[280px]' : 'w-12'}
        `}
      >
        {/* Tab icons */}
        <div className="flex flex-col items-center w-12 py-2 border-r border-border/50 gap-1 shrink-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                if (!sidebarOpen) toggleSidebar();
                setSidebarTab(tab.id);
              }}
              className={`
                p-2 rounded-lg transition-colors duration-150 cursor-pointer
                ${sidebarTab === tab.id && sidebarOpen
                  ? 'text-brand bg-brand/10'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated'}
              `}
              title={tab.label}
            >
              {tab.icon}
            </button>
          ))}

          <div className="flex-1" />

          <button
            onClick={toggleSidebar}
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors cursor-pointer"
          >
            {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
        </div>

        {/* Content */}
        {sidebarOpen && (
          <div className="flex-1 flex flex-col overflow-hidden animate-fadeIn min-w-0">
            {/* ─── Connections Tab ─── */}
            {sidebarTab === 'connections' && (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Conexões
                  </span>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="p-1 rounded-md text-text-muted hover:text-brand hover:bg-brand/10 transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto py-1">
                  {connections.length === 0 ? (
                    <div className="px-3 py-8 text-center text-text-muted text-xs">
                      Nenhuma conexão salva.
                      <br />
                      Clique em + para adicionar.
                    </div>
                  ) : (
                    connections.map(conn => {
                      const isActive = activeConnection?.name === conn.name;
                      const isConnecting = connectingName === conn.name;
                      return (
                        <div
                          key={conn.name}
                          className={`
                            group flex items-center gap-2 px-3 py-2 mx-1 rounded-md
                            transition-colors duration-100 cursor-pointer
                            ${isActive
                              ? 'bg-brand/5 border-l-2 border-brand'
                              : 'hover:bg-bg-elevated border-l-2 border-transparent'}
                          `}
                        >
                          <Plug className={`w-4 h-4 shrink-0 ${isActive ? 'text-brand' : 'text-text-muted'}`} />
                          <div
                            className="flex-1 min-w-0"
                            onClick={() => !isConnecting && handleConnect(conn.name)}
                          >
                            <div className="text-sm font-medium truncate">{conn.name}</div>
                            {isActive && (
                              <Badge variant="success" size="sm">CONNECTED</Badge>
                            )}
                          </div>
                          {isConnecting ? (
                            <Loader2 className="w-4 h-4 animate-spin text-brand" />
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteConnection(conn.name); }}
                              className="hidden group-hover:block p-1 rounded text-text-muted hover:text-red-400 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ─── Schema Tab ─── */}
            {sidebarTab === 'schema' && (
              <div className="flex flex-col h-full">
                <div className="px-3 py-2.5 border-b border-border/50">
                  <Input
                    placeholder="Buscar tabelas..."
                    icon={<Search className="w-4 h-4" />}
                    value={schemaSearch}
                    onChange={(e) => setSchemaSearch(e.target.value)}
                    className="!py-1.5 !text-xs"
                  />
                </div>

                <div className="flex-1 overflow-y-auto py-1">
                  {connectionStatus !== 'connected' ? (
                    <div className="px-3 py-8 text-center text-text-muted text-xs">
                      Conecte a um banco para ver o schema.
                    </div>
                  ) : (
                    schemaGroups.map(group => (
                      <SchemaGroup
                        key={group.schema}
                        schema={group.schema}
                        tables={group.tables}
                        views={group.views}
                        onSelectTable={selectTable}
                      />
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ─── History Tab ─── */}
            {sidebarTab === 'history' && (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Histórico
                  </span>
                  <button
                    onClick={async () => {
                      await api.query.clearHistory();
                      setHistory([]);
                    }}
                    className="text-xs text-text-muted hover:text-red-400 transition-colors cursor-pointer"
                  >
                    Limpar
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto py-1">
                  {history.length === 0 ? (
                    <div className="px-3 py-8 text-center text-text-muted text-xs">
                      Nenhuma query no histórico.
                    </div>
                  ) : (
                    history.map((item, i) => (
                      <div
                        key={i}
                        className="group px-3 py-2 mx-1 rounded-md hover:bg-bg-elevated transition-colors cursor-pointer"
                      >
                        <div className="font-mono text-xs text-text-primary truncate">
                          {item.sql}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-text-muted">
                          <span>{item.rowCount} rows</span>
                          <span>•</span>
                          <span>{item.duration}ms</span>
                          <span>•</span>
                          <span>{new Date(item.timestamp).toLocaleTimeString('pt-BR')}</span>
                          {item.error && <Badge variant="error" size="sm">ERRO</Badge>}
                        </div>
                        <div className="hidden group-hover:flex gap-1 mt-1">
                          <button
                            onClick={() => navigator.clipboard.writeText(item.sql)}
                            className="p-1 rounded text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                            title="Copiar SQL"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ConnectionModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onConnect={(name, url) => addConn({ name, url })}
      />
    </>
  );
}

// ─── Schema Tree Group ───

function SchemaGroup({
  schema, tables, views, onSelectTable,
}: {
  schema: string;
  tables: any[];
  views: any[];
  onSelectTable: (schema: string, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="px-1 py-0.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full px-2 py-1 text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
      >
        <span className="text-[10px]">{expanded ? '▼' : '▶'}</span>
        📁 {schema}
        <span className="text-text-muted ml-auto">
          {tables.length + views.length}
        </span>
      </button>

      {expanded && (
        <div className="ml-2 animate-fadeIn">
          {tables.length > 0 && (
            <>
              {tables.map(t => (
                <button
                  key={t.name}
                  onClick={() => onSelectTable(schema, t.name)}
                  className="flex items-center gap-2 w-full px-2 py-1 rounded-md text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors cursor-pointer"
                >
                  <Table2 className="w-3.5 h-3.5 text-text-muted shrink-0" />
                  <span className="truncate">{t.name}</span>
                  {t.estimatedRowCount > 0 && (
                    <span className="ml-auto text-[10px] text-text-muted shrink-0">
                      {t.estimatedRowCount > 1000
                        ? `${(t.estimatedRowCount / 1000).toFixed(1)}k`
                        : t.estimatedRowCount}
                    </span>
                  )}
                  {(t.foreignKeys?.length > 0 || t.referencedBy?.length > 0) && (
                    <span className="text-[10px] text-cyan-400">FK</span>
                  )}
                </button>
              ))}
            </>
          )}
          {views.length > 0 && (
            <>
              {views.map(v => (
                <button
                  key={v.name}
                  onClick={() => onSelectTable(schema, v.name)}
                  className="flex items-center gap-2 w-full px-2 py-1 rounded-md text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-text-muted shrink-0" />
                  <span className="truncate">{v.name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
