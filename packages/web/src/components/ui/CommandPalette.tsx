import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Table2, Zap, MessageSquare, PlugZap, Lock } from 'lucide-react';
import { useAppStore } from '../../stores/app-store';

interface CommandItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  category: 'table' | 'command';
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { schemaMap, setActivePage, selectTable } = useAppStore();

  // Build items list
  const items = useMemo<CommandItem[]>(() => {
    const result: CommandItem[] = [];

    // Tables from schema
    if (schemaMap?.tables) {
      for (const table of schemaMap.tables) {
        result.push({
          id: `${table.schema}.${table.name}`,
          label: `${table.schema}.${table.name}`,
          icon: <Table2 className="w-4 h-4 text-text-muted" />,
          category: 'table',
          action: () => {
            selectTable(table.schema, table.name);
            onClose();
          },
        });
      }
    }

    // Commands
    result.push({
      id: 'cmd-chat',
      label: 'Ir para Chat',
      icon: <MessageSquare className="w-4 h-4 text-text-muted" />,
      category: 'command',
      action: () => { setActivePage('chat'); onClose(); },
    });
    result.push({
      id: 'cmd-query',
      label: 'Abrir Query Editor',
      icon: <Zap className="w-4 h-4 text-text-muted" />,
      category: 'command',
      action: () => { setActivePage('query-editor'); onClose(); },
    });
    result.push({
      id: 'cmd-connection',
      label: 'Nova Conexao',
      icon: <PlugZap className="w-4 h-4 text-text-muted" />,
      category: 'command',
      action: () => { onClose(); },
    });

    return result;
  }, [schemaMap, setActivePage, selectTable, onClose]);

  // Filter by query (fuzzy)
  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.label.toLowerCase().replace(/[._]/g, ' ').includes(q)
    );
  }, [items, query]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  // Reset selection on filter change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center pt-[20vh]" onClick={onClose}>
      <div
        className="w-full max-w-md bg-bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar tabelas, comandos..."
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-text-muted">
              Nenhum resultado encontrado.
            </div>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.id}
                onClick={item.action}
                className={`
                  flex items-center gap-2.5 w-full px-4 py-2 text-left text-sm transition-colors cursor-pointer
                  ${i === selectedIndex ? 'bg-bg-elevated text-text-primary' : 'text-text-secondary hover:bg-bg-elevated/50'}
                `}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
                {item.category === 'command' && (
                  <span className="ml-auto text-[10px] text-text-muted uppercase">cmd</span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-border/50 text-[10px] text-text-muted flex gap-4">
          <span>↑↓ navegar</span>
          <span>↵ selecionar</span>
          <span>esc fechar</span>
        </div>
      </div>
    </div>
  );
}
