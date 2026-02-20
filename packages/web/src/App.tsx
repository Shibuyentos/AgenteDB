import { useState, useCallback } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ChatPage } from './pages/ChatPage';
import { TableDetailPage } from './pages/TableDetailPage';
import { QueryEditorPage } from './pages/QueryEditorPage';
import { ScriptsPage } from './pages/ScriptsPage';
import { ToastContainer } from './components/ui/Toast';
import { CommandPalette } from './components/ui/CommandPalette';
import { RelationGraph } from './components/schema/RelationGraph';
import { useAppStore } from './stores/app-store';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

function App() {
  const activePage = useAppStore((s) => s.activePage);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showGraph, setShowGraph] = useState(false);

  const toggleCommandPalette = useCallback(() => {
    setShowCommandPalette((prev) => !prev);
  }, []);

  useKeyboardShortcuts({
    onCommandPalette: toggleCommandPalette,
  });

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      <Header onOpenGraph={() => setShowGraph(true)} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          {activePage === 'chat' && <ChatPage />}
          {activePage === 'table-detail' && <TableDetailPage />}
          {activePage === 'query-editor' && <QueryEditorPage />}
          {activePage === 'scripts' && <ScriptsPage />}
        </main>
      </div>

      {/* Global overlays */}
      <ToastContainer />
      <CommandPalette isOpen={showCommandPalette} onClose={() => setShowCommandPalette(false)} />
      <RelationGraph isOpen={showGraph} onClose={() => setShowGraph(false)} />
    </div>
  );
}

export default App;
