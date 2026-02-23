import { memo, useMemo } from 'react';
import { SQLBlock } from './SQLBlock';
import { ResultTable } from './ResultTable';
import { BotAvatar } from './BotAvatar';
import type { ChatMessage as ChatMessageType } from '../../types';

interface ChatMessageProps {
  message: ChatMessageType;
}

function formatInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="font-bold text-white">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(
        <code key={match.index} className="px-1.5 py-0.5 rounded-md bg-white/10 text-indigo-300 font-mono text-[13px]">
          {match[3]}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function formatMarkdown(content: string): React.ReactNode[] {
  const lines = content.split('\n');
  return lines.map((line, i) => {
    if (!line.trim()) {
      return <div key={i} className="h-2" />;
    }
    if (line.startsWith('### ')) {
      return <h3 key={i} className="text-sm font-extrabold text-white mt-4 mb-2 tracking-tight">{formatInline(line.slice(4))}</h3>;
    }
    if (line.startsWith('## ')) {
      return <h2 key={i} className="text-base font-extrabold text-white mt-4 mb-2 tracking-tight">{formatInline(line.slice(3))}</h2>;
    }
    if (line.startsWith('# ')) {
      return <h1 key={i} className="text-lg font-extrabold text-white mt-4 mb-2 tracking-tight">{formatInline(line.slice(2))}</h1>;
    }
    if (/^\s*[-*]\s/.test(line)) {
      const text = line.replace(/^\s*[-*]\s/, '');
      return (
        <div key={i} className="flex items-start gap-2.5 ml-1 my-0.5">
          <div className="w-1.5 h-1.5 rounded-full bg-brand/60 mt-2 shrink-0" />
          <span className="text-sm leading-relaxed text-text-primary/90">{formatInline(text)}</span>
        </div>
      );
    }
    const numMatch = line.match(/^\s*(\d+)\.\s(.+)/);
    if (numMatch) {
      return (
        <div key={i} className="flex items-start gap-2.5 ml-1 my-0.5">
          <span className="text-[11px] font-bold text-brand/80 mt-0.5 shrink-0 w-4 text-right">{numMatch[1]}.</span>
          <span className="text-sm leading-relaxed text-text-primary/90">{formatInline(numMatch[2])}</span>
        </div>
      );
    }
    return <div key={i} className="text-sm leading-relaxed text-text-primary/90">{formatInline(line)}</div>;
  });
}

export const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  const formattedContent = useMemo(() => {
    if (message.content) {
      return formatMarkdown(message.content);
    }
    return null;
  }, [message.content]);

  if (message.type === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-5 py-3 rounded-2xl bg-white text-black text-sm font-medium leading-relaxed rounded-br-sm shadow-lg">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.type === 'thinking' || message.type === 'executing') {
    return (
      <div className="flex items-center gap-3 text-sm text-text-secondary">
        <BotAvatar />
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-xs font-medium text-text-muted">
            {message.type === 'thinking' ? 'Pensando...' : 'Executando query...'}
          </span>
        </div>
      </div>
    );
  }

  if (message.type === 'sql') {
    return (
      <div className="flex gap-3 max-w-4xl">
        <div className="shrink-0"><BotAvatar /></div>
        <div className="flex-1 min-w-0">
          <SQLBlock sql={message.content || ''} />
        </div>
      </div>
    );
  }

  if (message.type === 'result' && message.data) {
    return (
      <div className="flex gap-3 max-w-4xl">
        <div className="shrink-0"><BotAvatar /></div>
        <div className="flex-1 min-w-0">
          <ResultTable data={message.data} />
        </div>
      </div>
    );
  }

  if (message.type === 'error') {
    return (
      <div className="flex gap-3 max-w-4xl">
        <div className="shrink-0"><BotAvatar isError /></div>
        <div className="flex-1 min-w-0 px-5 py-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-sm text-red-300 leading-relaxed">
          {formattedContent || message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 max-w-4xl">
      <div className="shrink-0"><BotAvatar /></div>
      <div className="flex-1 min-w-0 text-text-primary/90 leading-relaxed space-y-1">
        {formattedContent}
      </div>
    </div>
  );
});
