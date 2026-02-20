import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Save, Plus, Trash2, Copy, Clock, Rows3,
  FileCode2, Search, Pencil, Check, X,
} from 'lucide-react';
import { Button, Badge, Table } from '../components/ui';
import { SqlAutocomplete } from '../components/editor/SqlAutocomplete';
import { useAppStore } from '../stores/app-store';
import { api } from '../lib/api';
import type { SqlScript, QueryResult } from '../types';

export function ScriptsPage() {
  const [scripts, setScripts] = useState<SqlScript[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sql, setSql] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const { schemaMap } = useAppStore();

  const selected = scripts.find(s => s.id === selectedId) || null;

  // Load scripts
  useEffect(() => {
    api.scripts.list().then(setScripts).catch(console.error);
  }, []);

  // Sync editor when selection changes
  useEffect(() => {
    if (selected) {
      setSql(selected.sql);
      setDirty(false);
      setResult(null);
      setError(null);
    }
  }, [selectedId]);

  // Focus name input when editing
  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const handleCreate = async () => {
    try {
      const script = await api.scripts.create({});
      setScripts(prev => [...prev, script]);
      setSelectedId(script.id);
    } catch (err) {
      console.error('Erro ao criar script:', err);
    }
  };

  const handleSave = useCallback(async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const updated = await api.scripts.update(selected.id, { sql });
      setScripts(prev => prev.map(s => s.id === updated.id ? updated : s));
      setDirty(false);
    } catch (err) {
      console.error('Erro ao salvar:', err);
    } finally {
      setSaving(false);
    }
  }, [selected, sql, saving]);

  const handleExecute = useCallback(async () => {
    if (!sql.trim() || executing) return;
    setExecuting(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.query.execute(sql);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao executar query');
    } finally {
      setExecuting(false);
    }
  }, [sql, executing]);

  const handleDelete = async (id: string) => {
    try {
      await api.scripts.remove(id);
      setScripts(prev => prev.filter(s => s.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setSql('');
        setDirty(false);
        setResult(null);
        setError(null);
      }
    } catch (err) {
      console.error('Erro ao deletar:', err);
    }
  };

  const handleRenameSave = async () => {
    if (!selected || !nameValue.trim()) {
      setEditingName(false);
      return;
    }
    try {
      const updated = await api.scripts.update(selected.id, { name: nameValue.trim() });
      setScripts(prev => prev.map(s => s.id === updated.id ? updated : s));
    } catch (err) {
      console.error('Erro ao renomear:', err);
    }
    setEditingName(false);
  };

  const handleAutocompleteSelect = useCallback((insertText: string, wordStart: number, wordEnd: number) => {
    const newSql = sql.substring(0, wordStart) + insertText + sql.substring(wordEnd);
    const newPos = wordStart + insertText.length;
    setSql(newSql);
    setDirty(true);
    setShowAutocomplete(false);
    setTimeout(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.selectionStart = textarea.selectionEnd = newPos;
        textarea.focus();
      }
    }, 0);
  }, [sql]);

  const handleSqlChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newSql = e.target.value;
    const newPos = e.target.selectionStart;
    setSql(newSql);
    setDirty(true);
    setCursorPos(newPos);

    // Show autocomplete when typing (not on delete to empty)
    if (newSql.length > 0) {
      // Check if last char is a letter, dot, or underscore
      const charBefore = newSql[newPos - 1];
      if (charBefore && /[a-zA-Z0-9_.]/.test(charBefore)) {
        setShowAutocomplete(true);
      } else if (charBefore === ' ') {
        // Check if previous word is a context keyword (FROM, JOIN, etc.)
        const textBefore = newSql.substring(0, newPos).trimEnd().toUpperCase();
        const contextKeywords = ['FROM', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN', 'INTO', 'UPDATE', 'TABLE', 'SELECT', 'WHERE', 'ON', 'AND', 'OR', 'BY', 'SET', 'HAVING'];
        if (contextKeywords.some(kw => textBefore.endsWith(kw))) {
          setShowAutocomplete(true);
        } else {
          setShowAutocomplete(false);
        }
      } else {
        setShowAutocomplete(false);
      }
    } else {
      setShowAutocomplete(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't intercept keys when autocomplete handles them
    if (showAutocomplete && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab' || e.key === 'Escape')) {
      return; // Let autocomplete handle these
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleExecute();
    }
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newVal = sql.substring(0, start) + '  ' + sql.substring(end);
      setSql(newVal);
      setDirty(true);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const filtered = scripts.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  const columns = result ? result.columns.map(c => ({ key: c, label: c })) : [];

  return (
    <div className="flex h-full animate-fadeIn">
      {/* Script List Panel */}
      <div className="w-[240px] shrink-0 flex flex-col border-r border-border bg-bg-card">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            Scripts
          </span>
          <button
            onClick={handleCreate}
            className="p-1 rounded-md text-text-muted hover:text-brand hover:bg-brand/10 transition-colors cursor-pointer"
            title="Novo Script"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="px-2 py-1.5 border-b border-border/50">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-bg-elevated/50">
            <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar scripts..."
              className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-text-muted text-xs">
              {scripts.length === 0
                ? 'Nenhum script criado.\nClique em + para criar.'
                : 'Nenhum resultado.'}
            </div>
          ) : (
            filtered.map(script => (
              <div
                key={script.id}
                onClick={() => setSelectedId(script.id)}
                className={`
                  group flex items-center gap-2 px-3 py-2 mx-1 rounded-md
                  transition-colors duration-100 cursor-pointer
                  ${selectedId === script.id
                    ? 'bg-brand/5 border-l-2 border-brand'
                    : 'hover:bg-bg-elevated border-l-2 border-transparent'}
                `}
              >
                <FileCode2 className={`w-4 h-4 shrink-0 ${selectedId === script.id ? 'text-brand' : 'text-text-muted'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{script.name}</div>
                  <div className="text-[10px] text-text-muted">
                    {new Date(script.updatedAt).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(script.id); }}
                  className="hidden group-hover:block p-1 rounded text-text-muted hover:text-red-400 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Editor + Results */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor */}
          <div className="flex flex-col shrink-0 border-b border-border" style={{ height: '45%' }}>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 bg-bg-card border-b border-border/50">
              <div className="flex items-center gap-2 min-w-0">
                {editingName ? (
                  <div className="flex items-center gap-1">
                    <input
                      ref={nameInputRef}
                      value={nameValue}
                      onChange={e => setNameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRenameSave();
                        if (e.key === 'Escape') setEditingName(false);
                      }}
                      className="px-1.5 py-0.5 bg-bg-elevated border border-border rounded text-sm text-text-primary focus:outline-none focus:border-brand"
                    />
                    <button onClick={handleRenameSave} className="p-0.5 text-brand hover:text-brand/80 cursor-pointer">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setEditingName(false)} className="p-0.5 text-text-muted hover:text-text-primary cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setNameValue(selected.name); setEditingName(true); }}
                    className="flex items-center gap-1.5 text-sm font-semibold text-text-primary hover:text-brand transition-colors cursor-pointer truncate"
                  >
                    {selected.name}
                    <Pencil className="w-3 h-3 text-text-muted" />
                  </button>
                )}
                {dirty && (
                  <Badge variant="warning" size="sm">modificado</Badge>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Copy className="w-3.5 h-3.5" />}
                  onClick={() => navigator.clipboard.writeText(sql)}
                >
                  Copiar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Save className="w-3.5 h-3.5" />}
                  onClick={handleSave}
                  loading={saving}
                  disabled={!dirty}
                >
                  Salvar
                </Button>
                <Button
                  size="sm"
                  icon={<Play className="w-3.5 h-3.5" />}
                  onClick={handleExecute}
                  loading={executing}
                  disabled={!sql.trim()}
                >
                  Executar
                </Button>
              </div>
            </div>

            {/* Textarea */}
            <div className="flex-1 overflow-hidden relative">
              <textarea
                ref={textareaRef}
                value={sql}
                onChange={handleSqlChange}
                onKeyDown={handleKeyDown}
                onClick={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart)}
                placeholder="SELECT * FROM ..."
                spellCheck={false}
                className="
                  w-full h-full p-4 bg-[#0C0C0E]
                  font-mono text-sm text-text-primary placeholder:text-text-muted
                  resize-none focus:outline-none
                "
              />
              <SqlAutocomplete
                sql={sql}
                cursorPos={cursorPos}
                textareaRef={textareaRef}
                schemaMap={schemaMap}
                visible={showAutocomplete}
                onSelect={handleAutocompleteSelect}
                onClose={() => setShowAutocomplete(false)}
              />
            </div>

            <div className="px-4 py-1 bg-bg-card/50 text-[10px] text-text-muted">
              Ctrl+Enter executar • Ctrl+S salvar • Tab indentação
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto">
            {error && (
              <div className="m-4 px-4 py-3 rounded-lg bg-red-500/5 border border-red-500/20">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {result && (
              <div className="p-4">
                <div className="flex items-center gap-4 mb-3 text-xs text-text-muted">
                  <span className="flex items-center gap-1">
                    <Rows3 className="w-3 h-3" />
                    {result.rowCount} {result.rowCount === 1 ? 'linha' : 'linhas'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {result.duration}ms
                  </span>
                </div>
                <Table columns={columns} data={result.rows} />
              </div>
            )}

            {!result && !error && (
              <div className="flex items-center justify-center h-full text-text-muted text-sm">
                Execute o script para ver os resultados aqui.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-3">
          <FileCode2 className="w-12 h-12 opacity-30" />
          <p className="text-sm">Selecione um script ou crie um novo</p>
          <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={handleCreate}>
            Novo Script
          </Button>
        </div>
      )}
    </div>
  );
}
