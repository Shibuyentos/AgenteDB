import { useState } from 'react';
import { Database, Lock, Key, ClipboardPaste } from 'lucide-react';
import { Modal, Button, Input } from '../ui';
import { api } from '../../lib/api';
import { useAppStore } from '../../stores/app-store';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ProviderTab = 'openai' | 'anthropic';

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { setAuthenticated } = useAppStore();
  const [provider, setProvider] = useState<ProviderTab>('anthropic');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Anthropic-specific state
  const [anthropicStep, setAnthropicStep] = useState<'login' | 'paste'>('login');
  const [anthropicCode, setAnthropicCode] = useState('');

  const handleOAuthLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const { authUrl } = await api.auth.login();
      window.open(authUrl, '_blank', 'width=500,height=700');
      const interval = setInterval(async () => {
        try {
          const status = await api.auth.status();
          if (status.authenticated) {
            setAuthenticated(true, status.accountId, status.provider);
            clearInterval(interval);
            onClose();
          }
        } catch {}
      }, 2000);
      setTimeout(() => { clearInterval(interval); setLoading(false); }, 120000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar login');
      setLoading(false);
    }
  };

  const handleAnthropicLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const { authUrl } = await api.auth.anthropicLogin();
      window.open(authUrl, '_blank', 'width=500,height=700');
      setAnthropicStep('paste');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar login Anthropic');
    } finally {
      setLoading(false);
    }
  };

  const handleAnthropicExchange = async () => {
    if (!anthropicCode.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.auth.anthropicExchange(anthropicCode.trim());
      if (result.success) {
        setAuthenticated(true, result.accountId, 'anthropic');
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao trocar código');
    } finally {
      setLoading(false);
    }
  };

  const handleApiKeySubmit = async () => {
    if (!apiKey.trim()) return;
    setLoading(true);
    setError('');
    try {
      await api.auth.setApiKey(apiKey.trim());
      setAuthenticated(true, 'api-key', 'openai');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro com API key');
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setAnthropicStep('login');
    setAnthropicCode('');
    setError('');
    setShowApiKey(false);
    setApiKey('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col items-center py-4 px-2">
        <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
          <Database className="w-7 h-7 text-brand" />
        </div>
        <h2 className="text-lg font-bold text-text-primary mb-1">AgentDB</h2>
        <p className="text-sm text-text-secondary text-center mb-4 max-w-sm">
          Escolha seu provedor de IA para usar com o AgentDB.
        </p>

        {/* Provider Tabs */}
        <div className="flex w-full max-w-sm rounded-lg bg-bg-elevated p-1 mb-4">
          <button
            onClick={() => { setProvider('anthropic'); resetState(); }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              provider === 'anthropic'
                ? 'bg-bg-card text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Claude (Anthropic)
          </button>
          <button
            onClick={() => { setProvider('openai'); resetState(); }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              provider === 'openai'
                ? 'bg-bg-card text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            ChatGPT (OpenAI)
          </button>
        </div>

        {/* Error display */}
        {error && (
          <div className="w-full max-w-sm mb-3 p-2 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}

        <div className="w-full space-y-3 max-w-sm">
          {/* ─── Anthropic Flow ─── */}
          {provider === 'anthropic' && (
            <>
              {anthropicStep === 'login' && (
                <>
                  <p className="text-xs text-text-muted text-center">
                    Usa sua assinatura Claude Pro/Max. Zero custo extra de API.
                  </p>
                  <Button
                    className="w-full justify-center"
                    icon={<Lock className="w-4 h-4" />}
                    onClick={handleAnthropicLogin}
                    loading={loading}
                  >
                    Fazer login com Claude
                  </Button>
                </>
              )}

              {anthropicStep === 'paste' && (
                <div className="space-y-3 animate-slideUp">
                  <p className="text-xs text-text-muted text-center">
                    Apos fazer login no Claude, copie o codigo exibido na pagina e cole abaixo:
                  </p>
                  <Input
                    placeholder="Cole o codigo aqui..."
                    value={anthropicCode}
                    onChange={(e) => setAnthropicCode(e.target.value)}
                    icon={<ClipboardPaste className="w-4 h-4" />}
                  />
                  <Button
                    className="w-full justify-center"
                    onClick={handleAnthropicExchange}
                    loading={loading}
                    disabled={!anthropicCode.trim()}
                  >
                    Confirmar
                  </Button>
                  <button
                    onClick={() => { setAnthropicStep('login'); setAnthropicCode(''); setError(''); }}
                    className="w-full text-center text-[10px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                  >
                    Voltar
                  </button>
                </div>
              )}
            </>
          )}

          {/* ─── OpenAI Flow ─── */}
          {provider === 'openai' && (
            <>
              <p className="text-xs text-text-muted text-center">
                Usa sua assinatura do ChatGPT. Zero custo extra de API.
              </p>
              <Button
                className="w-full justify-center"
                icon={<Lock className="w-4 h-4" />}
                onClick={handleOAuthLogin}
                loading={loading && !showApiKey}
              >
                Fazer login com OpenAI
              </Button>

              <Button
                variant="secondary"
                className="w-full justify-center"
                icon={<Key className="w-4 h-4" />}
                onClick={() => setShowApiKey(!showApiKey)}
              >
                Usar API Key (alternativa)
              </Button>

              {showApiKey && (
                <div className="space-y-2 animate-slideUp">
                  <Input
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    type="password"
                  />
                  <Button
                    size="sm"
                    className="w-full justify-center"
                    onClick={handleApiKeySubmit}
                    loading={loading}
                    disabled={!apiKey.trim()}
                  >
                    Salvar API Key
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <p className="text-[10px] text-text-muted mt-6 flex items-center gap-1">
          <Lock className="w-3 h-3" />
          Seus dados nunca saem do seu computador.
        </p>
      </div>
    </Modal>
  );
}
