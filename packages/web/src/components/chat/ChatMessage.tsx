import { memo } from 'react';
import { User, Database } from 'lucide-react';
import { SQLBlock } from './SQLBlock';
import { ResultTable } from './ResultTable';
import { ThinkingIndicator } from './ThinkingIndicator';
import { BotAvatar } from './BotAvatar';
import type { ChatMessage as ChatMessageType } from '../../types';

interface ChatMessageProps {
  message: ChatMessageType;
}

function formatMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    let processed: React.ReactNode = line;

    if (line.includes('`')) {
      const parts = line.split(/`([^`]+)`/g);
      processed = parts.map((part, j) =>
        j % 2 === 1 ? (
          <code key={j} className="px-1.5 py-0.5 rounded bg-bg-elevated font-mono text-xs text-white">
            {part}
          </code>
        ) : (
          <span key={j}>{formatInline(part)}</span>
        )
      );
    } else {
      processed = formatInline(line);
    }

    if (line.trim().startsWith('- ')) {
      return (
        <div key={i} className="flex gap-2 ml-2">
          <span className="text-white">•</span>
          <span>{processed}</span>
        </div>
      );
    }

    const numMatch = line.trim().match(/^(\d+)\.\s/);
    if (numMatch) {
      return (
        <div key={i} className="flex gap-2 ml-2">
          <span className="text-text-muted">{numMatch[1]}.</span>
          <span>{typeof processed === 'string' ? processed.replace(/^\d+\.\s/, '') : processed}</span>
        </div>
      );
    }

    return <div key={i}>{processed || <br />}</div>;
  });
}

function formatInline(text: string): React.ReactNode {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  if (parts.length > 1) {
    return parts.map((part, i) =>
      i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : <span key={i}>{part}</span>
    );
  }
  return text;
}

export const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  if (message.type === 'thinking' || message.type === 'executing') {
    return (
      <div className="flex gap-3 animate-slideUp">
        <BotAvatar />
        <ThinkingIndicator />
      </div>
    );
  }

  if (message.type === 'user') {
    return (
      <div className="flex gap-4 justify-end animate-slideUp">
        <div className="max-w-[80%] bg-[#18181b] border border-white/5 rounded-xl px-5 py-4 shadow-subtle-inner">
          <p className="text-[14px] leading-relaxed text-white">{message.content}</p>
        </div>
        <div className="w-8 h-8 rounded-full border border-white/10 bg-[#09090b] flex items-center justify-center shrink-0 mt-1">
          <User className="w-4 h-4 text-white" />
        </div>
      </div>
    );
  }

  if (message.type === 'sql') {
    return (
      <div className="flex gap-4 animate-slideUp">
        <BotAvatar />
        <div className="flex-1 max-w-[90%]">
          <SQLBlock sql={message.content || ''} />
        </div>
      </div>
    );
  }

  if (message.type === 'result' && message.data) {
    return (
      <div className="flex gap-4 animate-slideUp">
        <div className="w-10" />
        <div className="flex-1 max-w-full overflow-hidden">
          <ResultTable data={message.data} />
        </div>
      </div>
    );
  }

  if (message.type === 'error') {
    return (
      <div className="flex gap-4 animate-slideUp">
        <BotAvatar variant="error" />
        <div className="flex-1 max-w-[85%] bg-red-500/5 border border-red-500/20 rounded-xl px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold tracking-wide text-red-400 uppercase">Execution Error</span>
          </div>
          <p className="text-[14px] text-red-200/90 font-mono leading-relaxed">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 animate-slideUp">
      <div className="w-8 h-8 rounded-full border border-white/20 bg-white flex items-center justify-center shrink-0 mt-1">
        <Database className="w-4 h-4 text-black" />
      </div>
      <div className="flex-1 max-w-[85%] bg-transparent px-2 py-2">
        <div className="text-[14px] leading-relaxed text-gray-300 font-light">
          {formatMarkdown(message.content || '')}
        </div>
      </div>
    </div>
  );
});
