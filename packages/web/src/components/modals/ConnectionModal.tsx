import { useState, useEffect } from 'react';
import { Eye, EyeOff, CheckCircle2, XCircle, Database, Server, Lock, Globe } from 'lucide-react';
import { Modal, Button, Input } from '../ui';
import { api } from '../../lib/api';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (name: string, url: string) => void;
}

export function ConnectionModal({ isOpen, onClose, onConnect }: ConnectionModalProps) {
  const [mode, setMode] = useState<'fields' | 'string'>('fields');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('5432');
  const [database, setDatabase] = useState('postgres');
  const [user, setUser] = useState('postgres');
  const [password, setPassword] = useState('');
  const [useSSL, setUseSSL] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [saving, setSaving] = useState(false);

  // Sync fields → URL
  useEffect(() => {
    if (mode === 'fields') {
      const pw = password ? `:${password}` : ''; // Don't encode yet for display, but connection string needs specific format
      // Actually simpler to just construct standard PG URL
      const auth = `${user}${password ? `:${password}` : ''}`;
      // Handle special chars in password if needed, but for display let's keep it simple
      // Ideally valid URL encoded:
      const encodedUser = encodeURIComponent(user);
      const encodedPass = encodeURIComponent(password);
      const encodedAuth = `${encodedUser}${encodedPass ? `:${encodedPass}` : ''}`;
      
      const ssl = useSSL ? '?sslmode=require' : '';
      setUrl(`postgresql://${encodedAuth}@${host}:${port}/${database}${ssl}`);
    }
  }, [mode, host, port, database, user, password, useSSL]);

  // Parse URL → fields
  const parseUrl = (value: string) => {
    setUrl(value);
    try {
      if (!value.startsWith('postgres')) return;
      const u = new URL(value);
      setHost(u.hostname || 'localhost');
      setPort(u.port || '5432');
      setDatabase(u.pathname.replace('/', '') || 'postgres');
      setUser(decodeURIComponent(u.username || 'postgres'));
      setPassword(decodeURIComponent(u.password || ''));
      setUseSSL(u.searchParams.get('sslmode') === 'require');
    } catch {
      // Invalid URL, ignore
    }
  };

  const handleTest = async () => {
    setTestStatus('testing');
    setTestMessage('');
    try {
      const result = await api.connections.test(url);
      setTestStatus('success');
      setTestMessage(`Conectado a ${result.database} (${result.version})`);
    } catch (err) {
      setTestStatus('error');
      setTestMessage(err instanceof Error ? err.message : 'Falha na conexão');
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !url.trim()) return;
    setSaving(true);
    try {
      await api.connections.create({ name: name.trim(), url });
      onConnect(name.trim(), url);
      // Don't auto-reset/close to allow user to see success or if they want to add another? 
      // User flow: usually close.
      handleReset();
      onClose();
    } catch (err) {
      setTestStatus('error');
      setTestMessage(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setName('');
    if (mode === 'string') setUrl('');
    setHost('localhost');
    setPort('5432');
    setDatabase('postgres');
    setUser('postgres');
    setPassword('');
    setUseSSL(false);
    setTestStatus('idle');
    setTestMessage('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nova Conexão"
      maxWidth="max-w-xl"
    >
      <div className="space-y-6">
        
        {/* Name Input */}
        <div className="bg-bg-elevated/50 p-4 rounded-lg border border-border">
           <Input
            label="Nome da Conexão"
            placeholder="ex: Produção (Read-Only)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-bg-base"
          />
        </div>

        {/* Mode Toggle Tabs */}
        <div className="border-b border-border flex gap-6 px-1">
          <button
            onClick={() => setMode('fields')}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
              mode === 'fields'
                ? 'border-brand text-brand'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            Configuração Padrão
          </button>
          <button
            onClick={() => setMode('string')}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
              mode === 'string'
                ? 'border-brand text-brand'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            URL de Conexão
          </button>
        </div>

        {mode === 'fields' ? (
          <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
            
            {/* Server Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-text-secondary text-xs uppercase tracking-wider font-semibold">
                <Server className="w-3 h-3" /> Servidor
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-3">
                  <Input 
                    label="Host" 
                    placeholder="localhost ou IP" 
                    value={host} 
                    onChange={(e) => setHost(e.target.value)} 
                  />
                </div>
                <div className="col-span-1">
                  <Input 
                    label="Porta" 
                    placeholder="5432" 
                    value={port} 
                    onChange={(e) => setPort(e.target.value)} 
                  />
                </div>
              </div>
              <Input 
                label="Banco de Dados" 
                placeholder="postgres" 
                value={database} 
                onChange={(e) => setDatabase(e.target.value)} 
              />
            </div>

            <div className="h-px bg-border/50" />

            {/* Auth Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-text-secondary text-xs uppercase tracking-wider font-semibold">
                <Lock className="w-3 h-3" /> Autenticação
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input 
                  label="Usuário" 
                  placeholder="postgres" 
                  value={user} 
                  onChange={(e) => setUser(e.target.value)} 
                />
                <div className="relative">
                  <Input
                    label="Senha"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-[32px] text-text-muted hover:text-text-primary transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              
              <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer mt-2 select-none group">
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${useSSL ? 'bg-brand border-brand' : 'border-border group-hover:border-text-secondary'}`}>
                  {useSSL && <CheckCircle2 className="w-3 h-3 text-bg-base" />}
                </div>
                <input
                  type="checkbox"
                  checked={useSSL}
                  onChange={(e) => setUseSSL(e.target.checked)}
                  className="hidden"
                />
                Requerer SSL
              </label>
            </div>

            {/* Preview URL */}
            <div className="bg-bg-base p-3 rounded border border-border/50 font-mono text-[10px] text-text-muted break-all truncate">
              {url}
            </div>

          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-top-2 duration-200">
             <div className="flex items-center gap-2 text-text-secondary text-xs uppercase tracking-wider font-semibold mb-3">
                <Globe className="w-3 h-3" /> Connection String
              </div>
            <Input
              placeholder="postgresql://user:pass@host:5432/db"
              value={url}
              onChange={(e) => parseUrl(e.target.value)}
              className="font-mono text-sm"
            />
             <p className="text-xs text-text-muted mt-2">
              Cole sua string de conexão completa aqui.
            </p>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-border mt-6">
           <div className="flex items-center gap-2">
             <Button 
                variant="secondary" 
                size="sm" 
                onClick={handleTest} 
                loading={testStatus === 'testing'}
                disabled={!url || !host}
              >
                Testar Conexão
              </Button>
              
              {testStatus === 'success' && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4" />
                  {testMessage || 'OK'}
                </span>
              )}
              {testStatus === 'error' && (
                <span className="flex items-center gap-1.5 text-xs text-red-400 animate-in fade-in">
                  <XCircle className="w-4 h-4" />
                  Falha
                </span>
              )}
           </div>

           <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleSave} loading={saving} disabled={!name.trim() || !url.trim()}>
                Salvar
              </Button>
           </div>
        </div>
      </div>
    </Modal>
  );
}
