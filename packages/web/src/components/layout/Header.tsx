import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { Database, Lock, LockOpen, User, LogOut, GitFork, ChevronDown } from 'lucide-react';
import { useAppStore } from '../../stores/app-store';
import { api } from '../../lib/api';
import { OpenAIIcon } from '../icons/OpenAIIcon';
import { AnthropicIcon } from '../icons/AnthropicIcon';

type ProviderId = 'openai' | 'anthropic';

const MODEL_OPTIONS_FALLBACK: Record<ProviderId, { label: string; value: string }[]> = {
  anthropic: [
    { label: 'Sonnet 4.6', value: 'claude-sonnet-4-6' },
    { label: 'Opus 4.6', value: 'claude-opus-4-6' },
    { label: 'Haiku 4.5', value: 'claude-haiku-4-5' },
  ],
  openai: [
    { label: 'GPT-5 Codex', value: 'gpt-5-codex' },
    { label: 'GPT-5', value: 'gpt-5' },
  ],
};

const MODEL_LABELS: Record<string, string> = Object.values(MODEL_OPTIONS_FALLBACK).flat()
  .reduce<Record<string, string>>((acc, item) => {
    acc[item.value] = item.label;
    return acc;
  }, {});

function prettifyModelLabel(model: string): string {
  const known = MODEL_LABELS[model];
  if (known) return known;
  return model.replace(/[-_]+/g, ' ').toUpperCase();
}

interface HeaderProps {
  onOpenGraph?: () => void;
  onLogin?: () => void;
}

export const Header = memo(function Header({ onOpenGraph, onLogin }: HeaderProps) {
  const connectionStatus = useAppStore((s) => s.connectionStatus);
  const dbInfo = useAppStore((s) => s.dbInfo);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const accountId = useAppStore((s) => s.accountId);
  const provider = useAppStore((s) => s.provider);
  const model = useAppStore((s) => s.model);
  const readOnlyMode = useAppStore((s) => s.readOnlyMode);
  const toggleReadOnly = useAppStore((s) => s.toggleReadOnly);
  const setAuthenticated = useAppStore((s) => s.setAuthenticated);
  const setModel = useAppStore((s) => s.setModel);

  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<{ label: string; value: string }[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAuthenticated || !provider) {
      setAvailableModels([]);
      return;
    }

    api.auth.getModel()
      .then((res) => {
        if (res.current) {
          setModel(res.current);
        }

        const fromApi = (res.available || []).map((value) => ({
          label: prettifyModelLabel(value),
          value,
        }));

        if (fromApi.length > 0) {
          setAvailableModels(fromApi);
          return;
        }

        const fallback = MODEL_OPTIONS_FALLBACK[provider as ProviderId] || [];
        setAvailableModels(fallback);
      })
      .catch(() => {
        const fallback = MODEL_OPTIONS_FALLBACK[provider as ProviderId] || [];
        setAvailableModels(fallback);
      });
  }, [isAuthenticated, provider, setModel]);

  useEffect(() => {
    if (!modelDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [modelDropdownOpen]);

  const handleLogout = useCallback(async () => {
    try {
      await api.auth.logout();
      setAuthenticated(false);
      setModel(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }, [setAuthenticated, setModel]);

  const handleModelChange = useCallback(async (newModel: string) => {
    try {
      await api.auth.setModel(newModel);
      setModel(newModel);
      setModelDropdownOpen(false);
    } catch (error) {
      console.error('Model change error:', error);
    }
  }, [setModel]);

  const currentModelLabel = model ? prettifyModelLabel(model) : 'Modelo';

  return (
    <header className="h-14 bg-[#000000] border-b border-white/10 flex items-center px-4 md:px-6 shrink-0 relative z-20">
      <div className="flex items-center gap-2.5 group cursor-pointer min-w-[180px]">
        <div className="w-8 h-8 rounded-xl bg-[#09090b] border border-white/10 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
          {provider === 'openai' ? (
            <OpenAIIcon className="w-4 h-4 text-white" />
          ) : provider === 'anthropic' ? (
            <AnthropicIcon className="w-4 h-4 text-white" />
          ) : (
            <Database className="w-4 h-4 text-white" />
          )}
        </div>
        <span className="font-semibold text-lg tracking-tight text-white">Shibuy.ai</span>
      </div>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-full max-w-[430px] px-4 pointer-events-none hidden md:block">
        <div className="bg-[#09090b] px-4 py-1.5 rounded-full flex items-center justify-center gap-3 border border-white/10 pointer-events-auto">
          {connectionStatus === 'connected' && dbInfo ? (
            <>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-xs font-semibold tracking-wider text-text-primary uppercase">{dbInfo.database}</span>
              </div>
              <div className="w-px h-3 bg-white/10" />
              <span className="text-[10px] font-medium tracking-wider text-text-secondary uppercase">
                {dbInfo.tableCount} TABELAS
              </span>
              {onOpenGraph && (
                <button
                  onClick={onOpenGraph}
                  className="p-1 rounded-lg text-text-muted hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <GitFork className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          ) : connectionStatus === 'connecting' ? (
            <span className="text-xs font-medium text-text-secondary animate-pulse">ESTABELECENDO CONEXAO...</span>
          ) : (
            <span className="text-[10px] font-medium tracking-wider text-text-muted uppercase">NENHUM BANCO CONECTADO</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 ml-auto">
        {isAuthenticated && availableModels.length > 0 && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setModelDropdownOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-wider uppercase transition-colors duration-200 cursor-pointer border bg-[#09090b] text-white border-white/10 hover:bg-[#18181b] hover:border-white/30"
            >
              {currentModelLabel}
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${modelDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {modelDropdownOpen && (
              <div className="absolute right-0 top-full mt-3 w-48 bg-[#09090b] rounded-xl shadow-2xl z-50 py-2 animate-fadeIn border border-white/10">
                <div className="px-3 py-1 mb-1">
                  <span className="text-[9px] font-black text-text-muted uppercase tracking-widest">Modelos Disponiveis</span>
                </div>
                {availableModels.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleModelChange(opt.value)}
                    className={`w-[calc(100%-16px)] mx-2 text-left px-3 py-2 text-xs rounded-lg transition-colors cursor-pointer mb-0.5 ${model === opt.value ? 'bg-white text-black font-semibold' : 'text-text-secondary hover:text-white hover:bg-white/5'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={toggleReadOnly}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold tracking-wider uppercase transition-colors duration-200 cursor-pointer border ${readOnlyMode ? 'bg-[#09090b] text-white border-white/20 hover:bg-[#18181b]' : 'bg-white text-black border-white/20 hover:bg-gray-200'}`}
        >
          {readOnlyMode ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
          {readOnlyMode ? 'SOMENTE LEITURA' : 'MODO ESCRITA'}
        </button>

        <div className="w-px h-6 bg-white/10 mx-1" />

        {isAuthenticated ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#09090b] border border-white/10">
              <div className="w-5 h-5 rounded-full border border-white/20 bg-black flex items-center justify-center text-[10px] font-bold text-white uppercase px-1">
                {accountId?.substring(0, 2) || 'AI'}
              </div>
              <span className="text-xs font-semibold text-text-secondary">{accountId || 'Usuario'}</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onLogin}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold tracking-wide bg-white text-black hover:bg-gray-200 transition-colors cursor-pointer"
          >
            <User className="w-4 h-4" />
            Login
          </button>
        )}
      </div>
    </header>
  );
});
