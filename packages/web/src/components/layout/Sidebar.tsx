import { useState, useEffect, useMemo } from 'react';
import {
  PlugZap, TableProperties, History, ChevronLeft, ChevronRight,
  Plus, Plug, Trash2, Table2, Eye, Search, Play, Copy,
  MoreHorizontal, Loader2, FileCode2, MessageSquare, FolderOpen,
} from 'lucide-react';
import { useAppStore, type SidebarTab } from '../../stores/app-store';
import { api } from '../../lib/api';
import { ConnectionModal } from '../modals/ConnectionModal';
import type { QueryHistoryEntry, TableSummary, SqlScript } from '../../types';

const tabs: { id: SidebarTab; icon: React.ReactNode; label: string; page?: string }[] = [
  { id: 'connections', icon: <PlugZap className="w-5 h-5" />, label: 'Conexões' },
  { id: 'schema', icon: <TableProperties className="w-5 h-5" />, label: 'Schema' },
  { id: 'history', icon: <History className="w-5 h-5" />, label: 'Histórico' },
  { id: 'scripts', icon: <FileCode2 className="w-5 h-5" />, label: 'Scripts' },
];

export function Sidebar() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const sidebarTab = useAppStore((s) => s.sidebarTab);
  const connectionStatus = useAppStore((s) => s.connectionStatus);
  const connections = useAppStore((s) => s.connections);
  const activeConnection = useAppStore((s) => s.activeConnection);
  const schemaMap = useAppStore((s) => s.schemaMap);
  const activePage = useAppStore((s) => s.activePage);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const setSidebarTab = useAppStore((s) => s.setSidebarTab);
  const setConnections = useAppStore((s) => s.setConnections);
  const addConn = useAppStore((s) => s.addConnection);
  const removeConn = useAppStore((s) => s.removeConnection);
  const setActiveConnection = useAppStore((s) => s.setActiveConnection);
  const setConnectionStatus = useAppStore((s) => s.setConnectionStatus);
  const setDbInfo = useAppStore((s) => s.setDbInfo);
  const setSchemaMap = useAppStore((s) => s.setSchemaMap);
  const setIsLoadingSchema = useAppStore((s) => s.setIsLoadingSchema);
  const selectTable = useAppStore((s) => s.selectTable);
  const setActivePage = useAppStore((s) => s.setActivePage);

  const [showAddModal, setShowAddModal] = useState(false);
  const [connectingName, setConnectingName] = useState<string | null>(null);
  const [schemaSearch, setSchemaSearch] = useState('');
  const [history, setHistory] = useState<QueryHistoryEntry[]>([]);
  const [scriptsList, setScriptsList] = useState<SqlScript[]>([]);

  // Load connections on mount
  useEffect(() => {
    api.connections.list().then(setConnections).catch(console.error);
    api.auth.status().then(s => {
      const store = useAppStore.getState();
      store.setAuthenticated(s.authenticated, s.accountId, s.provider);
      if (s.model) store.setModel(s.model);
    }).catch(() => {});
  }, []);

  // Load history when tab opens
  useEffect(() => {
    if (sidebarTab === 'history') {
      api.query.history().then(setHistory).catch(console.error);
    }
    if (sidebarTab === 'scripts') {
      api.scripts.list().then(setScriptsList).catch(console.error);
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

  // ─── Schema Tree (memoized) ───
  const schemaGroups = useMemo(() => {
    if (!schemaMap) return [];
    return schemaMap.schemas.map(schema => {
      const schemaTables = schemaMap.tables
        .filter(t => t.schema === schema)
        .filter(t =>
          !schemaSearch || t.name.toLowerCase().includes(schemaSearch.toLowerCase())
        );
      const tablesOnly = schemaTables.filter(t => t.type === 'table');
      const viewsOnly = schemaTables.filter(t => t.type === 'view');
      return { schema, tables: tablesOnly, views: viewsOnly };
    }).filter(g => g.tables.length > 0 || g.views.length > 0);
  }, [schemaMap, schemaSearch]);

  return (
    <>
      <div
        className={`
          flex shrink-0 bg-[#000000] border-r border-white/10 transition-all duration-300 ease-out h-full
          ${sidebarOpen ? 'w-[280px]' : 'w-16'}
        `}
      >
        {/* Tab icons */}
        <div className="flex flex-col items-center w-14 py-4 border-r border-white/5 gap-2 shrink-0 bg-white/[0.02]">
          {/* Chat button - always at top */}
          <button
            onClick={() => setActivePage('chat')}
            className={`
              w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 cursor-pointer mb-2
              ${activePage === 'chat'
                ? 'bg-gradient-brand text-white glow-brand scale-110 shadow-glow-sm'
                : 'text-text-muted hover:text-text-primary hover:bg-white/5'}
            `}
            title="Chat"
          >
            <MessageSquare className="w-5 h-5" />
          </button>

          <div className="w-8 border-t border-white/5 mb-2" />

          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                if (!sidebarOpen) toggleSidebar();
                setSidebarTab(tab.id);
              }}
              className={`
                w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-300 cursor-pointer
                ${sidebarTab === tab.id && sidebarOpen
                  ? 'bg-gradient-brand text-white glow-brand shadow-glow-sm scale-110'
                  : 'text-text-muted hover:text-text-primary hover:bg-white/5'}
              `}
              title={tab.label}
            >
              {tab.icon}
            </button>
          ))}

          <div className="flex-1" />

          <button
            onClick={toggleSidebar}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-text-muted hover:text-text-primary hover:bg-white/5 transition-all cursor-pointer"
          >
            {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
        </div>

        {/* Content */}
        {sidebarOpen && (
          <div className="flex-1 flex flex-col overflow-hidden animate-fadeIn duration-500 min-w-0 bg-black/20">
            {/* ─── Connections Tab ─── */}
            {sidebarTab === 'connections' && (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
                  <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">
                    Conexões
                  </span>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="p-1.5 rounded-lg text-text-muted hover:text-brand hover:bg-brand/10 transition-all cursor-pointer border border-transparent hover:border-brand/20 shadow-glow-sm"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
                  {connections.length === 0 ? (
                    <div className="px-4 py-12 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4 border border-white/5">
                        <PlugZap className="w-6 h-6 text-text-muted" />
                      </div>
                      <p className="text-[11px] text-text-muted leading-relaxed">
                        Nenhuma conexão salva.<br />Clique em + para adicionar.
                      </p>
                    </div>
                  ) : (
                    connections.map(conn => {
                      const isActive = activeConnection?.name === conn.name;
                      const isConnecting = connectingName === conn.name;
                      return (
                        <div
                          key={conn.name}
                          className={`
                            group flex items-center gap-3 px-3 py-2.5 rounded-xl
                            transition-all duration-300 cursor-pointer border
                            ${isActive
                              ? 'bg-gradient-brand-subtle border-brand/20 glow-brand shadow-glow-sm translate-x-1'
                              : 'border-transparent hover:bg-white/5 hover:border-white/10 hover:translate-x-1'}
                          `}
                        >
                          <div className={`
                            w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                            ${isActive ? 'bg-gradient-brand text-white shadow-glow-sm' : 'bg-white/5 text-text-muted group-hover:text-text-primary'}
                          `}>
                            <Plug className="w-4 h-4" />
                          </div>
                          <div
                            className="flex-1 min-w-0"
                            onClick={() => !isConnecting && handleConnect(conn.name)}
                          >
                            <div className={`text-xs font-bold truncate ${isActive ? 'text-white' : 'text-text-secondary group-hover:text-text-primary'}`}>
                              {conn.name}
                            </div>
                            {isActive && (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="text-[9px] font-black tracking-widest text-emerald-400/80 uppercase">CONNECTED</span>
                              </div>
                            )}
                          </div>
                          {isConnecting ? (
                            <Loader2 className="w-4 h-4 animate-spin text-brand" />
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteConnection(conn.name); }}
                              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
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
                <div className="px-4 py-4 border-b border-white/5">
                  <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted group-focus-within:text-brand transition-colors" />
                    <input
                      placeholder="Buscar tabelas..."
                      value={schemaSearch}
                      onChange={(e) => setSchemaSearch(e.target.value)}
                      className="w-full bg-white/5 border border-white/5 focus:border-brand/40 focus:ring-1 focus:ring-brand/20 rounded-xl pl-9 pr-4 py-2 text-[11px] text-text-primary placeholder:text-text-muted outline-none transition-all duration-300 focus-glow"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto py-2 px-1 custom-scrollbar">
                  {connectionStatus !== 'connected' ? (
                    <div className="px-4 py-12 text-center text-text-muted text-[11px] italic">
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
                <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
                  <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">
                    Histórico
                  </span>
                  <button
                    onClick={async () => {
                      await api.query.clearHistory();
                      setHistory([]);
                    }}
                    className="text-[10px] font-bold text-text-muted hover:text-red-400 transition-all cursor-pointer px-2 py-1 rounded-lg hover:bg-white/5"
                  >
                    LIMPAR
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto py-3 px-2 space-y-2">
                  {history.length === 0 ? (
                    <div className="px-4 py-12 text-center text-text-muted text-[11px] italic">
                      Nenhuma query no histórico.
                    </div>
                  ) : (
                    history.map((item, i) => (
                      <div
                        key={i}
                        className="group p-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all duration-300 cursor-pointer"
                      >
                        <div className="font-mono text-[11px] text-text-primary truncate mb-2 opacity-80 group-hover:opacity-100">
                          {item.sql}
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[9px] font-bold text-text-muted tracking-tight">
                            <span className="flex items-center gap-1"><Play className="w-2.5 h-2.5" /> {item.duration}ms</span>
                            <span>•</span>
                            <span className="px-1.5 py-0.5 rounded bg-white/5">{item.rowCount} ROWS</span>
                          </div>
                          <button
                            onClick={() => navigator.clipboard.writeText(item.sql)}
                            className="p-1 px-2 rounded-lg bg-white/5 text-text-muted hover:text-brand hover:bg-brand/10 transition-all cursor-pointer border border-transparent hover:border-brand/20"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                        {item.error && (
                          <div className="mt-2 text-[9px] font-black tracking-widest text-red-400 uppercase">FAILED TO EXECUTE</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ─── Scripts Tab ─── */}
            {sidebarTab === 'scripts' && (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
                  <span className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">
                    Scripts
                  </span>
                  <button
                    onClick={() => setActivePage('scripts')}
                    className="text-[10px] font-bold text-brand hover:text-brand-hover transition-all cursor-pointer px-2 py-1 rounded-lg hover:bg-brand/5 border border-transparent hover:border-brand/20 glow-brand shadow-glow-sm"
                  >
                    EDITOR
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1.5">
                  {scriptsList.length === 0 ? (
                    <div className="px-4 py-12 text-center text-text-muted text-[11px] italic">
                      Nenhum script salvo.
                    </div>
                  ) : (
                    scriptsList.map(script => (
                      <button
                        key={script.id}
                        onClick={() => setActivePage('scripts')}
                        className="flex items-center gap-3 w-full p-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-brand/20 transition-all duration-300 cursor-pointer group text-left shadow-hover"
                      >
                        <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-text-muted group-hover:text-brand group-hover:bg-brand/5 transition-all">
                          <FileCode2 className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-text-primary group-hover:text-brand transition-colors truncate">{script.name}</div>
                          <div className="text-[10px] text-text-muted font-mono truncate opacity-60 mt-0.5">
                            {script.sql ? script.sql.substring(0, 40) : 'vazio'}
                          </div>
                        </div>
                      </button>
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
    <div className="px-2 py-0.5 space-y-0.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`
          flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-[11px] font-bold tracking-wide transition-all duration-300 cursor-pointer
          ${expanded ? 'text-text-primary bg-white/5 shadow-inner' : 'text-text-muted hover:text-text-primary hover:bg-white/[0.03]'}
        `}
      >
        <div className={`transition-transform duration-300 ${expanded ? 'rotate-90' : ''}`}>
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
        <FolderOpen className={`w-3.5 h-3.5 ${expanded ? 'text-amber-400' : 'text-text-muted'}`} />
        <span className="truncate uppercase tracking-wider">{schema}</span>
        <span className="text-[10px] text-text-muted ml-auto px-1.5 py-0.5 rounded-full bg-black/40 border border-white/5">
          {tables.length + views.length}
        </span>
      </button>

      {expanded && (
        <div className="ml-5 p-1 space-y-0.5 animate-fadeInUp">
          {tables.length > 0 && (
            <>
              {tables.map(t => (
                <button
                  key={t.name}
                  onClick={() => onSelectTable(schema, t.name)}
                  className="group flex items-center gap-3 w-full px-3 py-2 rounded-xl text-xs text-text-secondary hover:text-brand hover:bg-brand/5 border border-transparent hover:border-brand/20 transition-all duration-300 cursor-pointer"
                >
                  <Table2 className="w-3.5 h-3.5 text-text-muted group-hover:text-brand transition-colors shrink-0" />
                  <span className="truncate font-medium">{t.name}</span>
                  {t.estimatedRowCount > 0 && (
                    <span className="ml-auto text-[9px] font-bold text-text-muted group-hover:text-brand/80 shrink-0 opacity-60">
                      {t.estimatedRowCount > 1000
                        ? `${(t.estimatedRowCount / 1000).toFixed(1)}K`
                        : t.estimatedRowCount}
                    </span>
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
                  className="group flex items-center gap-3 w-full px-3 py-2 rounded-xl text-xs text-text-secondary hover:text-cyan-400 hover:bg-cyan-500/5 border border-transparent hover:border-cyan-500/20 transition-all duration-300 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-text-muted group-hover:text-cyan-400 transition-colors shrink-0" />
                  <span className="truncate font-medium">{v.name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
