import { useState, useEffect, useRef } from 'react';
import { Database, Lock, LockOpen, User, LogOut, Moon, Sun, GitFork, ChevronDown } from 'lucide-react';
import { Tooltip } from '../ui';
import { useAppStore } from '../../stores/app-store';
import { useThemeStore } from '../../hooks/useTheme';
import { api } from '../../lib/api';

const MODEL_OPTIONS: Record<string, { label: string; value: string }[]> = {
  anthropic: [
    { label: 'Sonnet 4.6', value: 'claude-sonnet-4-6' },
    { label: 'Opus 4.6', value: 'claude-opus-4-6' },
    { label: 'Haiku 4.5', value: 'claude-haiku-4-5' },
  ],
  openai: [
    { label: 'GPT-5 Codex', value: 'gpt-5-codex' },
  ],
};

function getModelLabel(model: string | null): string {
  if (!model) return 'Modelo';
  for (const opts of Object.values(MODEL_OPTIONS)) {
    const found = opts.find((o) => o.value === model);
    if (found) return found.label;
  }
  return model;
}

interface HeaderProps {
  onOpenGraph?: () => void;
  onLogin?: () => void;
}

export function Header({ onOpenGraph, onLogin }: HeaderProps) {
  const {
    connectionStatus,
    dbInfo,
    isAuthenticated,
    accountId,
    provider,
    model,
    readOnlyMode,
    toggleReadOnly,
    setAuthenticated,
    setModel,
  } = useAppStore();

  const { theme, toggleTheme } = useThemeStore();
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load current model on mount
  useEffect(() => {
    if (isAuthenticated && provider) {
      api.auth.getModel().then((res) => {
        if (res.current) setModel(res.current);
      }).catch(() => {});
    }
  }, [isAuthenticated, provider, setModel]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogin = () => {
    onLogin?.();
  };

  const handleLogout = async () => {
    try {
      await api.auth.logout();
      setAuthenticated(false);
      setModel(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleModelChange = async (newModel: string) => {
    try {
      await api.auth.setModel(newModel);
      setModel(newModel);
      setModelDropdownOpen(false);
    } catch (error) {
      console.error('Model change error:', error);
    }
  };

  const availableModels = provider ? MODEL_OPTIONS[provider] || [] : [];

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
        {/* Model Selector */}
        {isAuthenticated && availableModels.length > 0 && (
          <div className="relative" ref={dropdownRef}>
            <Tooltip content="Trocar modelo">
              <button
                onClick={() => setModelDropdownOpen((v) => !v)}
                className={`
                  flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium
                  transition-colors duration-150 cursor-pointer
                  ${provider === 'anthropic'
                    ? 'bg-[#D97757]/10 text-[#D97757] border border-[#D97757]/20 hover:bg-[#D97757]/20'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'}
                `}
              >
                {getModelLabel(model)}
                <ChevronDown className={`w-3 h-3 transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
            </Tooltip>

            {modelDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-lg shadow-lg z-50 py-1 animate-fadeIn">
                {availableModels.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleModelChange(opt.value)}
                    className={`
                      w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer
                      ${model === opt.value
                        ? 'text-[var(--color-brand)] bg-[var(--color-brand)]/10 font-medium'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]'}
                    `}
                  >
                    {opt.label}
                    {model === opt.value && <span className="ml-1 text-[10px]">(ativo)</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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
