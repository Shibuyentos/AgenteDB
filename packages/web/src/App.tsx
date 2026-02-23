import { useState, useCallback, lazy, Suspense } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ChatPage } from './pages/ChatPage';
import { ToastContainer } from './components/ui/Toast';
import { useAppStore } from './stores/app-store';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

// Lazy-load heavy overlays and less-used pages
const CommandPalette = lazy(() => import('./components/ui/CommandPalette').then(m => ({ default: m.CommandPalette })));
const RelationGraph = lazy(() => import('./components/schema/RelationGraph').then(m => ({ default: m.RelationGraph })));
const AuthModal = lazy(() => import('./components/modals/AuthModal').then(m => ({ default: m.AuthModal })));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage').then(m => ({ default: m.OnboardingPage })));
const ScriptsPage = lazy(() => import('./pages/ScriptsPage').then(m => ({ default: m.ScriptsPage })));
const QueryEditorPage = lazy(() => import('./pages/QueryEditorPage').then(m => ({ default: m.QueryEditorPage })));
const TableDetailPage = lazy(() => import('./pages/TableDetailPage').then(m => ({ default: m.TableDetailPage })));

function App() {
  const activePage = useAppStore((s) => s.activePage);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  const [showGraph, setShowGraph] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  const handleOpenGraph = useCallback(() => setShowGraph(true), []);
  const handleOpenAuth = useCallback(() => setShowAuthModal(true), []);
  const handleCloseGraph = useCallback(() => setShowGraph(false), []);
  const handleCloseAuth = useCallback(() => setShowAuthModal(false), []);
  const handleClosePalette = useCallback(() => setShowCommandPalette(false), []);

  useKeyboardShortcuts({
    onCommandPalette: () => setShowCommandPalette((v) => !v),
  });

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<div className="flex items-center justify-center h-screen bg-bg-base text-text-muted">Carregando...</div>}>
        <OnboardingPage />
      </Suspense>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg-base text-text-primary bg-glow noise relative">
      <Header onOpenGraph={handleOpenGraph} onLogin={handleOpenAuth} />

      <div className="flex flex-1 overflow-hidden relative z-10">
        <Sidebar />

        <main className="flex-1 overflow-hidden relative">
          {activePage === 'chat' && <ChatPage />}
          {activePage !== 'chat' && (
            <Suspense fallback={
              <div className="flex items-center justify-center h-full">
                <div className="w-6 h-6 border-2 border-white/20 border-t-brand rounded-full animate-spin" />
              </div>
            }>
              {activePage === 'scripts' && <ScriptsPage />}
              {activePage === 'query-editor' && <QueryEditorPage />}
              {activePage === 'table-detail' && <TableDetailPage />}
            </Suspense>
          )}
        </main>
      </div>

      {/* Global overlays - always present but lightweight */}
      <ToastContainer />

      {/* Lazy overlays - only load when opened */}
      {showCommandPalette && (
        <Suspense fallback={null}>
          <CommandPalette isOpen={showCommandPalette} onClose={handleClosePalette} />
        </Suspense>
      )}
      {showGraph && (
        <Suspense fallback={null}>
          <RelationGraph isOpen={showGraph} onClose={handleCloseGraph} />
        </Suspense>
      )}
      {showAuthModal && (
        <Suspense fallback={null}>
          <AuthModal isOpen={showAuthModal} onClose={handleCloseAuth} />
        </Suspense>
      )}
    </div>
  );
}

export default App;
