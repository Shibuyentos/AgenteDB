import { User } from 'lucide-react';
import { SQLBlock } from './SQLBlock';
import { ResultTable } from './ResultTable';
import { ThinkingIndicator } from './ThinkingIndicator';
import { BotAvatar } from './BotAvatar';
import type { ChatMessage as ChatMessageType } from '../../types';

interface ChatMessageProps {
  message: ChatMessageType;
}

function formatMarkdown(text: string): React.ReactNode {
  // Simple markdown: bold, italic, code inline, lists
  const lines = text.split('\n');
  return lines.map((line, i) => {
    let processed: React.ReactNode = line;

    // Code inline
    if (line.includes('`')) {
      const parts = line.split(/`([^`]+)`/g);
      processed = parts.map((part, j) =>
        j % 2 === 1 ? (
          <code key={j} className="px-1.5 py-0.5 rounded bg-bg-elevated font-mono text-xs text-cyan-400">
            {part}
          </code>
        ) : (
          <span key={j}>{formatInline(part)}</span>
        )
      );
    } else {
      processed = formatInline(line);
    }

    // List items
    if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
      return (
        <div key={i} className="flex gap-2 ml-2">
          <span className="text-brand">•</span>
          <span>{processed}</span>
        </div>
      );
    }

    // Numbered list
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
  // Bold
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  if (parts.length > 1) {
    return parts.map((part, i) =>
      i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : <span key={i}>{part}</span>
    );
  }
  return text;
}

export function ChatMessage({ message }: ChatMessageProps) {
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
      <div className="flex gap-3 justify-end animate-slideUp">
        <div className="max-w-[80%] bg-brand-dark/40 border border-brand/20 rounded-xl rounded-tr-sm px-4 py-3">
          <p className="text-sm leading-relaxed">{message.content}</p>
        </div>
        <div className="w-7 h-7 rounded-full bg-brand/20 flex items-center justify-center shrink-0 mt-1">
          <User className="w-4 h-4 text-brand" />
        </div>
      </div>
    );
  }

  if (message.type === 'sql') {
    return (
      <div className="flex gap-3 animate-slideUp">
        <BotAvatar />
        <div className="flex-1 max-w-[85%]">
          <SQLBlock sql={message.content || ''} />
        </div>
      </div>
    );
  }

  if (message.type === 'result' && message.data) {
    return (
      <div className="flex gap-3 animate-slideUp">
        <div className="w-7" />
        <div className="flex-1 max-w-[85%]">
          <ResultTable data={message.data} />
        </div>
      </div>
    );
  }

  if (message.type === 'error') {
    return (
      <div className="flex gap-3 animate-slideUp">
        <BotAvatar variant="error" />
        <div className="flex-1 max-w-[85%] bg-red-500/5 border border-red-500/20 rounded-xl rounded-tl-sm px-4 py-3">
          <p className="text-sm text-red-400">{message.content}</p>
        </div>
      </div>
    );
  }

  // text / summary
  return (
    <div className="flex gap-3 animate-slideUp">
      <BotAvatar />
      <div className="flex-1 max-w-[85%] bg-bg-card border border-border/50 rounded-xl rounded-tl-sm px-4 py-3">
        <div className="text-sm leading-relaxed">
          {formatMarkdown(message.content || '')}
        </div>
      </div>
    </div>
  );
}
