import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { Send, Square, MessageSquare, Trash2, Command, Sparkles } from 'lucide-react';
import { ChatMessage } from '../components/chat/ChatMessage';
import { MentionDropdown } from '../components/chat/MentionDropdown';
import { useWebSocket } from '../hooks/useWebSocket';
import { useMentionAutocomplete } from '../hooks/useMentionAutocomplete';
import { useAppStore } from '../stores/app-store';

const QUICK_ACTIONS = [
  { text: 'Quais tabelas existem no banco?', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { text: 'Mostre os ultimos 10 pedidos', icon: <Command className="w-3.5 h-3.5" /> },
  { text: 'Quais tabelas se relacionam com usuario?', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { text: 'Quantos registros tem cada tabela?', icon: <Command className="w-3.5 h-3.5" /> },
] as const;

export function ChatPage() {
  const connectionStatus = useAppStore((s) => s.connectionStatus);
  const {
    messages,
    sendMessage,
    cancelRun,
    clearMessages,
    isBusy,
    runPhase,
    runDetail,
  } = useWebSocket();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);

  const mention = useMentionAutocomplete({ input, setInput, textareaRef });

  // Auto-scroll only when new messages are added, using instant scroll
  useEffect(() => {
    const currentCount = messages.length;
    if (currentCount > prevMessageCountRef.current) {
      // Use requestAnimationFrame for better timing
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
      });
    }
    prevMessageCountRef.current = currentCount;
  }, [messages.length]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const notConnected = connectionStatus !== 'connected';
  const inputLocked = notConnected || isBusy;
  const statusText =
    runDetail ||
    (runPhase === 'thinking'
      ? 'Pensando...'
      : runPhase === 'executing'
        ? 'Executando consulta...'
        : runPhase === 'summarizing'
          ? 'Consolidando resposta...'
          : '');

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isBusy || notConnected) return;
    const sent = sendMessage(trimmed);
    if (sent) {
      setInput('');
    }
  }, [input, isBusy, notConnected, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (mention.handleKeyDown(e)) return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!isBusy) {
        handleSend();
      }
    }
  }, [mention, isBusy, handleSend]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  return (
    <div className="flex flex-col h-full bg-transparent relative">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-8 relative z-10">
        {messages.length === 0 ? (
          <EmptyState
            notConnected={notConnected}
            isBusy={isBusy}
            setInput={setInput}
            textareaRef={textareaRef}
          />
        ) : (
          <div className="space-y-8 max-w-4xl mx-auto pb-32">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl px-6 z-20">
        <div className="bg-[#09090b] border border-white/10 rounded-2xl shadow-2xl flex items-end gap-2 p-2 shadow-subtle-inner focus-within:border-white/30 transition-colors duration-200">
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              disabled={isBusy}
              className="w-10 h-10 flex items-center justify-center rounded-xl text-text-muted hover:text-white hover:bg-white/5 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          <div className="flex-1 relative">
            {mention.isOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-4">
                <MentionDropdown
                  items={mention.items}
                  selectedIndex={mention.selectedIndex}
                  onSelect={mention.insertMention}
                  listRef={mention.listRef}
                  query={mention.query}
                />
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                notConnected
                  ? 'Conecte a um banco primeiro...'
                  : isBusy
                    ? 'Aguarde a resposta atual...'
                    : 'Faca uma pergunta ao banco de dados...'
              }
              disabled={inputLocked}
              data-chat-input
              rows={1}
              className="w-full bg-transparent border-none px-4 py-3 text-[14px] text-white placeholder:text-text-muted focus:outline-none resize-none disabled:opacity-50"
            />
          </div>

          <button
            onClick={isBusy ? cancelRun : handleSend}
            disabled={isBusy ? false : notConnected || !input.trim()}
            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors ${
              isBusy
                ? 'bg-white/10 text-white hover:bg-white/20'
                : 'bg-white text-black hover:bg-gray-200 disabled:opacity-20 disabled:bg-white/10 disabled:text-white'
            }`}
            title={isBusy ? 'Parar execucao' : 'Enviar'}
          >
            {isBusy ? <Square className="w-4 h-4 fill-current" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <div className="text-center mt-2 min-h-[16px]">
          {isBusy && (
            <span className="text-[11px] text-text-secondary tracking-wide">{statusText}</span>
          )}
        </div>
        <div className="text-center mt-3">
          <span className="text-[10px] text-text-muted tracking-wide">
            Pressione <kbd className="font-mono bg-white/10 px-1 py-0.5 rounded border border-white/10">CTRL+ENTER</kbd> para enviar
          </span>
        </div>
      </div>
    </div>
  );
}

// Empty state component extracted and memoized
const EmptyState = memo(function EmptyState({
  notConnected,
  isBusy,
  setInput,
  textareaRef,
}: {
  notConnected: boolean;
  isBusy: boolean;
  setInput: (v: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full text-center animate-fadeIn">
      <div className="w-16 h-16 border border-white/10 rounded-2xl bg-[#09090b] flex items-center justify-center mb-8 shadow-subtle-inner">
        <MessageSquare className="w-8 h-8 text-white" />
      </div>

      <h1 className="text-3xl font-semibold tracking-tight text-white mb-4">
        Shibuy.ai
      </h1>

      <p className="text-sm text-text-secondary max-w-md mb-12 leading-relaxed">
        Converse com seu banco de dados. Faca perguntas em linguagem natural e receba queries otimizadas em milissegundos.
      </p>

      {notConnected && (
        <div className="mb-10 px-4 py-2 rounded-xl bg-[#09090b] border border-white/10">
          <p className="text-xs text-text-secondary">
            Conecte a um banco de dados para comecar.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
        {QUICK_ACTIONS.map((item) => (
          <button
            key={item.text}
            onClick={() => {
              setInput(item.text);
              textareaRef.current?.focus();
            }}
            disabled={notConnected || isBusy}
            className="group flex items-center gap-3 text-left px-4 py-3 rounded-xl text-[13px] font-medium bg-[#09090b] border border-white/10 hover:bg-[#18181b] hover:border-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-black border border-white/10 flex items-center justify-center text-text-muted group-hover:text-white transition-colors">
              {item.icon}
            </div>
            <span className="text-text-secondary group-hover:text-white transition-colors">{item.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
