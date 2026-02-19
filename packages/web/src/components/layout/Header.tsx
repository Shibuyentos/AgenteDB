import { Database, Lock, LockOpen, User, LogOut, Moon, Sun, GitFork } from 'lucide-react';
import { Tooltip } from '../ui';
import { useAppStore } from '../../stores/app-store';
import { useThemeStore } from '../../hooks/useTheme';
import { api } from '../../lib/api';

interface HeaderProps {
  onOpenGraph?: () => void;
}

export function Header({ onOpenGraph }: HeaderProps) {
  const {
    connectionStatus,
    dbInfo,
    isAuthenticated,
    accountId,
    readOnlyMode,
    toggleReadOnly,
    setAuthenticated,
  } = useAppStore();

  const { theme, toggleTheme } = useThemeStore();

  const handleLogin = async () => {
    try {
      const { authUrl } = await api.auth.login();
      window.open(authUrl, '_blank', 'width=500,height=700');
      const interval = setInterval(async () => {
        const status = await api.auth.status();
        if (status.authenticated) {
          setAuthenticated(true, status.accountId);
          clearInterval(interval);
        }
      }, 2000);
      setTimeout(() => clearInterval(interval), 120000);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await api.auth.logout();
      setAuthenticated(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <header className="h-12 bg-[var(--color-bg-card)] border-b border-[var(--color-border)] flex items-center px-4 gap-4 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <Database className="w-5 h-5 text-[var(--color-brand)]" />
        <span className="font-semibold text-sm">AgentDB</span>
      </div>

      {/* Connection Info */}
      <div className="flex-1 flex items-center justify-center gap-3">
        {connectionStatus === 'connected' && dbInfo ? (
          <>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-subtle" />
              <span className="text-sm font-medium">{dbInfo.database}</span>
              <span className="text-xs text-[var(--color-text-muted)]">({dbInfo.version})</span>
            </div>
            <span className="text-xs text-[var(--color-text-muted)]">
              {dbInfo.tableCount} tabelas
            </span>
            {onOpenGraph && (
              <Tooltip content="Ver grafo de relacoes">
                <button
                  onClick={onOpenGraph}
                  className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-brand)] hover:bg-[var(--color-brand)]/10 transition-colors cursor-pointer"
                >
                  <GitFork className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            )}
          </>
        ) : connectionStatus === 'connecting' ? (
          <span className="text-sm text-[var(--color-text-muted)] animate-pulse-subtle">
            Conectando...
          </span>
        ) : (
          <span className="text-sm text-[var(--color-text-muted)]">Nenhum banco conectado</span>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Read Only Toggle */}
        <Tooltip content={readOnlyMode ? 'Modo somente leitura' : 'Modo escrita ativo'}>
          <button
            onClick={toggleReadOnly}
            className={`
              flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium
              transition-colors duration-150 cursor-pointer
              ${readOnlyMode
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}
            `}
          >
            {readOnlyMode ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
            {readOnlyMode ? 'READ' : 'WRITE'}
          </button>
        </Tooltip>

        {/* Theme Toggle */}
        <Tooltip content={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}>
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </Tooltip>

        {/* Auth */}
        {isAuthenticated ? (
          <div className="flex items-center gap-2">
            <Tooltip content={`Logado: ${accountId || 'unknown'}`}>
              <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                <User className="w-3.5 h-3.5" />
              </div>
            </Tooltip>
            <Tooltip content="Sair">
              <button
                onClick={handleLogout}
                className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          </div>
        ) : (
          <button
            onClick={handleLogin}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white transition-colors cursor-pointer"
          >
            <User className="w-3.5 h-3.5" />
            Login
          </button>
        )}
      </div>
    </header>
  );
}
