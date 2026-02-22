import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useAppStore } from '../stores/app-store';

export type MentionItemType = 'schema' | 'table' | 'view';

export interface MentionItem {
  type: MentionItemType;
  label: string;        // Display label (e.g. "public.users")
  schema: string;
  name: string;         // Table/view name, or schema name for schema items
  subtitle: string;     // Extra info (e.g. "table · 15 columns")
}

interface UseMentionAutocompleteOptions {
  input: string;
  setInput: (value: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function useMentionAutocomplete({ input, setInput, textareaRef }: UseMentionAutocompleteOptions) {
  const schemaMap = useAppStore((s) => s.schemaMap);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartPos, setMentionStartPos] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  // Build flat list of all mentionable items from the schema
  const allItems = useMemo<MentionItem[]>(() => {
    if (!schemaMap) return [];

    const items: MentionItem[] = [];

    // Add schemas
    for (const schema of schemaMap.schemas) {
      items.push({
        type: 'schema',
        label: schema,
        schema,
        name: schema,
        subtitle: `schema`,
      });
    }

    // Add tables and views
    for (const table of schemaMap.tables) {
      items.push({
        type: table.type === 'view' ? 'view' : 'table',
        label: `${table.schema}.${table.name}`,
        schema: table.schema,
        name: table.name,
        subtitle: `${table.type} · ${table.columns.length} colunas`,
      });
    }

    return items;
  }, [schemaMap]);

  // Filter items based on the query typed after @
  const filteredItems = useMemo(() => {
    if (!mentionQuery) return allItems;

    const q = mentionQuery.toLowerCase();
    return allItems.filter((item) => {
      return (
        item.label.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q)
      );
    });
  }, [allItems, mentionQuery]);

  // Detect @ trigger from input changes
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    // Search backwards from cursor to find unescaped @
    const textBeforeCursor = input.slice(0, cursorPos);

    // Find the last @ that isn't preceded by a word character
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex === -1) {
      if (isOpen) {
        setIsOpen(false);
        setMentionQuery('');
        setMentionStartPos(-1);
      }
      return;
    }

    // Check that @ is at start or preceded by whitespace
    const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
    if (charBefore !== ' ' && charBefore !== '\n' && atIndex !== 0) {
      if (isOpen) {
        setIsOpen(false);
        setMentionQuery('');
        setMentionStartPos(-1);
      }
      return;
    }

    // Check no space between @ and cursor (user typing a cohesive mention)
    const queryAfterAt = textBeforeCursor.slice(atIndex + 1);
    if (queryAfterAt.includes(' ')) {
      if (isOpen) {
        setIsOpen(false);
        setMentionQuery('');
        setMentionStartPos(-1);
      }
      return;
    }

    setMentionQuery(queryAfterAt);
    setMentionStartPos(atIndex);
    setIsOpen(true);
    setSelectedIndex(0);
  }, [input, textareaRef]);

  // Ensure selected item is scrolled into view
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const activeEl = listRef.current.querySelector('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, isOpen]);

  // Insert selected mention into the input
  const insertMention = useCallback(
    (item: MentionItem) => {
      if (mentionStartPos === -1) return;

      const textarea = textareaRef.current;
      const cursorPos = textarea?.selectionStart ?? input.length;

      const before = input.slice(0, mentionStartPos);
      const after = input.slice(cursorPos);
      const mentionText = `@${item.label} `;

      const newInput = before + mentionText + after;
      setInput(newInput);

      setIsOpen(false);
      setMentionQuery('');
      setMentionStartPos(-1);

      // Restore focus and cursor position after React re-render
      requestAnimationFrame(() => {
        if (textarea) {
          textarea.focus();
          const newCursorPos = before.length + mentionText.length;
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }
      });
    },
    [input, setInput, mentionStartPos, textareaRef]
  );

  // Keyboard handler — returns true if the event was consumed
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || filteredItems.length === 0) return false;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
          return true;

        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) =>
            prev <= 0 ? filteredItems.length - 1 : prev - 1
          );
          return true;

        case 'Enter':
        case 'Tab':
          e.preventDefault();
          e.stopPropagation();
          insertMention(filteredItems[selectedIndex]);
          return true;

        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(false);
          setMentionQuery('');
          setMentionStartPos(-1);
          return true;

        default:
          return false;
      }
    },
    [isOpen, filteredItems, selectedIndex, insertMention]
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setMentionQuery('');
    setMentionStartPos(-1);
  }, []);

  return {
    isOpen: isOpen && filteredItems.length > 0,
    items: filteredItems,
    selectedIndex,
    handleKeyDown,
    insertMention,
    close,
    listRef,
    query: mentionQuery,
  };
}
