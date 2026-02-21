import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Table2, Columns3, Key, FolderOpen } from 'lucide-react';
import { getSuggestions, type SuggestionKind } from '../../lib/sql-autocomplete';
import type { SchemaMap } from '../../types';

interface SqlAutocompleteProps {
  sql: string;
  cursorPos: number;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  schemaMap: SchemaMap | null;
  visible: boolean;
  onSelect: (insertText: string, wordStart: number, wordEnd: number) => void;
  onClose: () => void;
}

const kindIcons: Record<SuggestionKind, React.ReactNode> = {
  schema: <FolderOpen className="w-3.5 h-3.5 text-yellow-400" />,
  table: <Table2 className="w-3.5 h-3.5 text-cyan-400" />,
  column: <Columns3 className="w-3.5 h-3.5 text-green-400" />,
  keyword: <Key className="w-3.5 h-3.5 text-purple-400" />,
};

const kindLabels: Record<SuggestionKind, string> = {
  schema: 'Schema',
  table: 'Tabela',
  column: 'Coluna',
  keyword: 'SQL',
};

export function SqlAutocomplete({
  sql, cursorPos, textareaRef, schemaMap,
  visible, onSelect, onClose,
}: SqlAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const listRef = useRef<HTMLDivElement>(null);

  // Memoize suggestions so they only recompute when inputs change
  const { suggestions, wordStart, wordEnd } = useMemo(() => {
    if (!visible) return { suggestions: [], wordStart: 0, wordEnd: 0 };
    return getSuggestions(sql, cursorPos, schemaMap);
  }, [visible, sql, cursorPos, schemaMap]);

  // Reset selection when suggestions change
  useEffect(() => {
    setSelectedIndex(0);
  }, [sql, cursorPos]);

  // Calculate position based on cursor in textarea
  useEffect(() => {
    if (!visible || !textareaRef.current) return;

    const textarea = textareaRef.current;
    const pos = getCaretPosition(textarea);
    setPosition(pos);
  }, [visible, cursorPos, textareaRef]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!visible || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      if (suggestions[selectedIndex]) {
        e.preventDefault();
        e.stopPropagation();
        onSelect(suggestions[selectedIndex].insertText, wordStart, wordEnd);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [visible, suggestions, selectedIndex, wordStart, wordEnd, onSelect, onClose]);

  // Attach keydown listener to textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !visible) return;

    textarea.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => textarea.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [textareaRef, visible, handleKeyDown]);

  if (!visible || suggestions.length === 0) return null;

  return (
    <div
      className="absolute z-50 bg-bg-card border border-border rounded-lg shadow-2xl overflow-hidden animate-fadeIn"
      style={{
        top: position.top + 20,
        left: position.left,
        minWidth: 240,
        maxWidth: 400,
      }}
    >
      <div
        ref={listRef}
        className="max-h-[240px] overflow-y-auto py-1"
      >
        {suggestions.map((item, i) => (
          <button
            key={`${item.kind}-${item.label}-${i}`}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(item.insertText, wordStart, wordEnd);
            }}
            onMouseEnter={() => setSelectedIndex(i)}
            className={`
              flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs transition-colors cursor-pointer
              ${i === selectedIndex ? 'bg-brand/15 text-text-primary' : 'text-text-secondary hover:bg-bg-elevated/50'}
            `}
          >
            {kindIcons[item.kind]}
            <span className="truncate font-mono">{item.label}</span>
            {item.detail && (
              <span className="ml-auto text-[10px] text-text-muted shrink-0">
                {item.detail}
              </span>
            )}
            <span className="text-[10px] text-text-muted/50 shrink-0">
              {kindLabels[item.kind]}
            </span>
          </button>
        ))}
      </div>
      <div className="px-3 py-1 border-t border-border/50 text-[10px] text-text-muted flex gap-3">
        <span>↑↓ navegar</span>
        <span>Tab selecionar</span>
        <span>Esc fechar</span>
      </div>
    </div>
  );
}

/**
 * Calculate the pixel position of the caret in a textarea.
 * Uses a hidden mirror div to measure text layout.
 */
function getCaretPosition(textarea: HTMLTextAreaElement): { top: number; left: number } {
  const mirror = getOrCreateMirror(textarea);

  // Copy styles
  const computed = window.getComputedStyle(textarea);
  const stylesToCopy = [
    'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'wordWrap', 'whiteSpace', 'wordBreak', 'overflowWrap', 'tabSize',
  ] as const;

  for (const style of stylesToCopy) {
    (mirror.style as any)[style] = computed[style];
  }

  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.height = 'auto';
  mirror.style.position = 'absolute';
  mirror.style.top = '-9999px';
  mirror.style.left = '-9999px';
  mirror.style.visibility = 'hidden';
  mirror.style.overflow = 'hidden';

  // Set text up to cursor position
  const textBeforeCursor = textarea.value.substring(0, textarea.selectionStart);
  mirror.textContent = textBeforeCursor;

  // Add a span to measure final position, then clean it up
  const marker = document.createElement('span');
  marker.textContent = '|';
  mirror.appendChild(marker);

  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();

  // Clean up the marker to prevent DOM node leaks
  mirror.removeChild(marker);

  const relativeTop = markerRect.top - mirrorRect.top - textarea.scrollTop;
  const relativeLeft = markerRect.left - mirrorRect.left;

  return {
    top: Math.max(0, relativeTop),
    left: Math.min(relativeLeft, textarea.clientWidth - 250),
  };
}

let _mirror: HTMLDivElement | null = null;
function getOrCreateMirror(_textarea: HTMLTextAreaElement): HTMLDivElement {
  if (!_mirror) {
    _mirror = document.createElement('div');
    document.body.appendChild(_mirror);
  }
  // Clear any leftover content from previous calls
  _mirror.textContent = '';
  return _mirror;
}
