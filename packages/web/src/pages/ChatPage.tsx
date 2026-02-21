import { useRef, useEffect, useState } from 'react';
import { Send, MessageSquare, Trash2 } from 'lucide-react';
import { ChatMessage } from '../components/chat/ChatMessage';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAppStore } from '../stores/app-store';

export function ChatPage() {
  const connectionStatus = useAppStore((s) => s.connectionStatus);
  const { messages, sendMessage, isConnected, clearMessages } = useWebSocket();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    sendMessage(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const notConnected = connectionStatus !== 'connected';

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fadeIn">
            <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-brand" />
            </div>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              Converse com seu banco de dados
            </h2>
            <p className="text-sm text-text-muted max-w-md">
              Faça perguntas em linguagem natural sobre a estrutura, dados e relações do seu banco.
              O AgentDB vai gerar e executar queries automaticamente.
            </p>

            {notConnected && (
              <div className="mt-6 px-4 py-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <p className="text-xs text-amber-400">
                  Conecte a um banco de dados pela sidebar para começar.
                </p>
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
              {[
                'Quais tabelas existem no banco?',
                'Mostre os últimos 10 pedidos',
                'Quais tabelas se relacionam com usuario?',
                'Quantos registros tem cada tabela?',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                    textareaRef.current?.focus();
                  }}
                  disabled={notConnected}
                  className="
                    text-left px-3 py-2 rounded-lg text-xs text-text-secondary
                    bg-bg-card border border-border hover:border-brand/30 hover:text-text-primary
                    transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed
                    cursor-pointer
                  "
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-4xl mx-auto">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="shrink-0 border-t border-border bg-bg-card/50 backdrop-blur-sm px-6 py-3">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-end gap-2">
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                className="p-2 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0 mb-0.5"
                title="Limpar chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={notConnected ? 'Conecte a um banco primeiro...' : 'Digite sua pergunta...'}
                disabled={notConnected}
                rows={1}
                className="
                  w-full bg-bg-base border border-border rounded-xl px-4 py-3 pr-12
                  text-sm text-text-primary placeholder:text-text-muted
                  focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand
                  transition-all duration-150 resize-none
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              />
              <button
                onClick={handleSend}
                disabled={notConnected || !input.trim()}
                className="
                  absolute right-2 bottom-2 p-2 rounded-lg
                  bg-brand hover:bg-brand-hover text-white
                  transition-colors duration-150 cursor-pointer
                  disabled:opacity-30 disabled:cursor-not-allowed
                "
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-[10px] text-text-muted">
              Ctrl+Enter para enviar
            </span>
            <div className="flex items-center gap-2">
              {!isConnected && (
                <span className="text-[10px] text-amber-400">WebSocket desconectado</span>
              )}
              {isConnected && (
                <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Conectado
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
