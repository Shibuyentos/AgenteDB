import { useEffect } from 'react';
import { useAppStore } from '../stores/app-store';

interface ShortcutHandlers {
  onCommandPalette: () => void;
  onClearChat?: () => void;
}

export function useKeyboardShortcuts({ onCommandPalette, onClearChat }: ShortcutHandlers) {
  const { setActivePage, toggleSidebar } = useAppStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea (unless it's a global shortcut)
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'k':
            e.preventDefault();
            onCommandPalette();
            break;
          case 'e':
            e.preventDefault();
            setActivePage('query-editor');
            break;
          case 'j':
            e.preventDefault();
            setActivePage('chat');
            // Focus chat input
            setTimeout(() => {
              const chatInput = document.querySelector<HTMLTextAreaElement>('[data-chat-input]');
              chatInput?.focus();
            }, 100);
            break;
          case 'b':
            e.preventDefault();
            toggleSidebar();
            break;
          case 'l':
            if (!isInput) {
              e.preventDefault();
              onClearChat?.();
            }
            break;
        }
      }

      // Escape - back to chat
      if (e.key === 'Escape' && !isInput) {
        const { activePage } = useAppStore.getState();
        if (activePage !== 'chat') {
          setActivePage('chat');
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCommandPalette, onClearChat, setActivePage, toggleSidebar]);
}
