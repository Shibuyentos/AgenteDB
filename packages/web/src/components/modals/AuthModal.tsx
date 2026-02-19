import { useState } from 'react';
import { Database, Lock, Key } from 'lucide-react';
import { Modal, Button, Input } from '../ui';
import { api } from '../../lib/api';
import { useAppStore } from '../../stores/app-store';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { setAuthenticated } = useAppStore();
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);

  const handleOAuthLogin = async () => {
    setLoading(true);
    try {
      const { authUrl } = await api.auth.login();
      window.open(authUrl, '_blank', 'width=500,height=700');
      // Poll for auth status
      const interval = setInterval(async () => {
        try {
          const status = await api.auth.status();
          if (status.authenticated) {
            setAuthenticated(true, status.accountId);
            clearInterval(interval);
            onClose();
          }
        } catch {}
      }, 2000);
      setTimeout(() => { clearInterval(interval); setLoading(false); }, 120000);
    } catch (error) {
      console.error('Login error:', error);
      setLoading(false);
    }
  };

  const handleApiKeySubmit = async () => {
    if (!apiKey.trim()) return;
    setLoading(true);
    try {
      // Save API key via server endpoint
      await api.auth.setApiKey(apiKey.trim());
      setAuthenticated(true, 'api-key');
      onClose();
    } catch (error) {
      console.error('API key error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col items-center py-4 px-2">
        <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
          <Database className="w-7 h-7 text-brand" />
        </div>
        <h2 className="text-lg font-bold text-text-primary mb-1">AgentDB</h2>
        <p className="text-sm text-text-secondary text-center mb-6 max-w-sm">
          Para usar o AgentDB, faca login com sua conta OpenAI.
          Isso usa sua assinatura existente do ChatGPT — sem custo extra de API.
        </p>

        <div className="w-full space-y-3 max-w-sm">
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
        </div>

        <p className="text-[10px] text-text-muted mt-6 flex items-center gap-1">
          <Lock className="w-3 h-3" />
          Seus dados nunca saem do seu computador.
        </p>
      </div>
    </Modal>
  );
}
