import { useState } from 'react';
import { Database, Lock, Key, PlugZap, MessageSquare, CheckCircle2, ArrowRight } from 'lucide-react';
import { Button, Input } from '../components/ui';
import { api } from '../lib/api';
import { useAppStore } from '../stores/app-store';

const steps = [
  { label: 'Auth', icon: Lock },
  { label: 'Connect', icon: PlugZap },
  { label: 'Chat!', icon: MessageSquare },
];

export function OnboardingPage() {
  const { setAuthenticated, addConnection, setActiveConnection, setConnectionStatus, setDbInfo, setSchemaMap, setIsLoadingSchema, setSidebarTab } = useAppStore();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Auth state
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('');

  // Connection state
  const [connName, setConnName] = useState('');
  const [connUrl, setConnUrl] = useState('');

  const handleOAuth = async () => {
    setLoading(true);
    try {
      const { authUrl } = await api.auth.login();
      window.open(authUrl, '_blank', 'width=500,height=700');
      const interval = setInterval(async () => {
        try {
          const status = await api.auth.status();
          if (status.authenticated) {
            setAuthenticated(true, status.accountId);
            clearInterval(interval);
            setLoading(false);
            setStep(1);
          }
        } catch {}
      }, 2000);
      setTimeout(() => { clearInterval(interval); setLoading(false); }, 120000);
    } catch {
      setLoading(false);
    }
  };

  const handleApiKey = async () => {
    if (!apiKey.trim()) return;
    setLoading(true);
    try {
      await api.auth.setApiKey(apiKey.trim());
      setAuthenticated(true, 'api-key');
      setStep(1);
    } catch {} finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!connName.trim() || !connUrl.trim()) return;
    setLoading(true);
    try {
      await api.connections.create({ name: connName.trim(), url: connUrl });
      addConnection({ name: connName.trim(), url: connUrl });
      setConnectionStatus('connecting');

      const result = await api.connections.connect(connName.trim());
      setConnectionStatus('connected');
      setActiveConnection({ name: connName.trim(), url: connUrl });
      setDbInfo({ database: result.database, version: result.version, tableCount: result.tableCount });

      setIsLoadingSchema(true);
      const schema = await api.schema.full();
      setSchemaMap(schema);
      setIsLoadingSchema(false);
      setSidebarTab('schema');
      setStep(2);
    } catch {
      setConnectionStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg-base">
      <div className="w-full max-w-md mx-auto px-6 animate-fadeIn">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-3">
            <Database className="w-8 h-8 text-brand" />
          </div>
          <h1 className="text-2xl font-bold">AgentDB</h1>
          <p className="text-sm text-text-muted mt-1">Seu banco de dados, sua conversa.</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={s.label} className="flex items-center gap-2">
                <div className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                  ${isDone ? 'bg-brand/10 text-brand' : isActive ? 'bg-bg-elevated text-text-primary border border-brand/30' : 'bg-bg-card text-text-muted border border-border'}
                `}>
                  {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  {s.label}
                </div>
                {i < steps.length - 1 && <ArrowRight className="w-3 h-3 text-text-muted" />}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="bg-bg-card border border-border rounded-xl p-6">
          {step === 0 && (
            <div className="space-y-4 animate-slideUp">
              <h2 className="text-base font-semibold text-center">Autenticar</h2>
              <p className="text-xs text-text-muted text-center">
                Usa sua assinatura do ChatGPT. Zero custo extra.
              </p>
              <Button className="w-full justify-center" icon={<Lock className="w-4 h-4" />} onClick={handleOAuth} loading={loading && !showApiKey}>
                Fazer login com OpenAI
              </Button>
              <Button variant="secondary" className="w-full justify-center" icon={<Key className="w-4 h-4" />} onClick={() => setShowApiKey(!showApiKey)}>
                Usar API Key
              </Button>
              {showApiKey && (
                <div className="space-y-2 animate-slideUp">
                  <Input placeholder="sk-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" />
                  <Button size="sm" className="w-full justify-center" onClick={handleApiKey} loading={loading} disabled={!apiKey.trim()}>
                    Salvar
                  </Button>
                </div>
              )}
              <button onClick={() => setStep(1)} className="w-full text-center text-[10px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer mt-2">
                Pular por agora
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4 animate-slideUp">
              <h2 className="text-base font-semibold text-center">Conectar ao banco</h2>
              <Input label="Nome" placeholder="ex: meu-banco" value={connName} onChange={(e) => setConnName(e.target.value)} />
              <Input label="Connection String" placeholder="postgresql://user:pass@host:5432/db" value={connUrl} onChange={(e) => setConnUrl(e.target.value)} />
              <Button className="w-full justify-center" icon={<PlugZap className="w-4 h-4" />} onClick={handleConnect} loading={loading} disabled={!connName.trim() || !connUrl.trim()}>
                Conectar
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col items-center py-4 animate-slideUp">
              <CheckCircle2 className="w-12 h-12 text-brand mb-3" />
              <h2 className="text-base font-semibold mb-1">Tudo pronto!</h2>
              <p className="text-xs text-text-muted text-center mb-4">
                Seu banco esta conectado. Comece a conversar.
              </p>
              <Button icon={<MessageSquare className="w-4 h-4" />} onClick={() => useAppStore.getState().setActivePage('chat')}>
                Ir para o Chat
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
