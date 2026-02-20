import { useState, useRef, useCallback } from 'react';
import { Play, Clock, Rows3, Copy, Trash2 } from 'lucide-react';
import { Button, Badge, Table } from '../components/ui';
import { SqlAutocomplete } from '../components/editor/SqlAutocomplete';
import { useAppStore } from '../stores/app-store';
import { api } from '../lib/api';
import type { QueryResult } from '../types';

export function QueryEditorPage() {
  const [sql, setSql] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const schemaMap = useAppStore((s) => s.schemaMap);

  const handleExecute = async () => {
    if (!sql.trim()) return;
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
  };

  const handleAutocompleteSelect = useCallback((insertText: string, wordStart: number, wordEnd: number) => {
    const newSql = sql.substring(0, wordStart) + insertText + sql.substring(wordEnd);
    const newPos = wordStart + insertText.length;
    setSql(newSql);
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
    setCursorPos(newPos);

    if (newSql.length > 0) {
      const charBefore = newSql[newPos - 1];
      if (charBefore && /[a-zA-Z0-9_.]/.test(charBefore)) {
        setShowAutocomplete(true);
      } else if (charBefore === ' ') {
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
    if (showAutocomplete && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab' || e.key === 'Escape')) {
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleExecute();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newVal = sql.substring(0, start) + '  ' + sql.substring(end);
      setSql(newVal);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const columns = result ? result.columns.map(c => ({ key: c, label: c })) : [];

  return (
    <div className="flex flex-col h-full animate-fadeIn">
      {/* Editor */}
      <div className="flex flex-col shrink-0 border-b border-border" style={{ height: '40%' }}>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-bg-card border-b border-border/50">
          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            Query Editor
          </span>
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
              icon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() => { setSql(''); setResult(null); setError(null); }}
            >
              Limpar
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
          Ctrl+Enter para executar • Tab para indentação
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
            Execute uma query para ver os resultados aqui.
          </div>
        )}
      </div>
    </div>
  );
}
