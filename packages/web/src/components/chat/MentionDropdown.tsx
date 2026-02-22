import { Database, Eye, FolderOpen, Table2 } from 'lucide-react';
import type { MentionItem, MentionItemType } from '../../hooks/useMentionAutocomplete';

interface MentionDropdownProps {
  items: MentionItem[];
  selectedIndex: number;
  onSelect: (item: MentionItem) => void;
  listRef: React.RefObject<HTMLDivElement | null>;
  query: string;
}

const iconMap: Record<MentionItemType, React.ReactNode> = {
  schema: <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />,
  table: <Table2 className="w-4 h-4 text-brand shrink-0" />,
  view: <Eye className="w-4 h-4 text-cyan-400 shrink-0" />,
};

const typeLabel: Record<MentionItemType, string> = {
  schema: 'Schema',
  table: 'Tabela',
  view: 'View',
};

function highlightMatch(text: string, query: string) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-brand font-semibold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

export function MentionDropdown({
  items,
  selectedIndex,
  onSelect,
  listRef,
  query,
}: MentionDropdownProps) {
  if (items.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="
        absolute bottom-full left-0 right-0 mb-1 z-50
        bg-bg-card border border-border rounded-lg shadow-2xl
        max-h-[240px] overflow-y-auto overflow-x-hidden
        animate-slideUp
      "
      role="listbox"
      aria-label="Sugestões de tabelas e schemas"
    >
      {/* Header */}
      <div className="sticky top-0 bg-bg-card/95 backdrop-blur-sm border-b border-border/50 px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-[10px] text-text-muted uppercase tracking-wider font-semibold">
          <Database className="w-3 h-3" />
          Referências do banco
        </div>
      </div>

      {/* Items */}
      <div className="py-1">
        {items.map((item, index) => {
          const isActive = index === selectedIndex;
          return (
            <button
              key={`${item.type}-${item.label}`}
              data-active={isActive}
              role="option"
              aria-selected={isActive}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(item);
              }}
              onMouseDown={(e) => e.preventDefault()} // Prevent textarea blur
              className={`
                flex items-center gap-2.5 w-full px-3 py-1.5 text-left
                transition-colors duration-75 cursor-pointer
                ${isActive
                  ? 'bg-brand/10 text-text-primary'
                  : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                }
              `}
            >
              {iconMap[item.type]}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate font-mono">
                  {highlightMatch(item.label, query)}
                </div>
              </div>
              <span className={`
                text-[10px] px-1.5 py-0.5 rounded shrink-0
                ${isActive ? 'text-brand bg-brand/10' : 'text-text-muted bg-bg-elevated'}
              `}>
                {typeLabel[item.type]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="sticky bottom-0 bg-bg-card/95 backdrop-blur-sm border-t border-border/50 px-3 py-1">
        <div className="flex items-center gap-3 text-[10px] text-text-muted">
          <span>↑↓ navegar</span>
          <span>↵ selecionar</span>
          <span>esc fechar</span>
        </div>
      </div>
    </div>
  );
}
