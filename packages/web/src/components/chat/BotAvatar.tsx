import { memo } from 'react';
import { Bot } from 'lucide-react';
import { useAppStore } from '../../stores/app-store';

interface BotAvatarProps {
  isError?: boolean;
}

export const BotAvatar = memo(function BotAvatar({ isError }: BotAvatarProps) {
  const provider = useAppStore((s) => s.provider);

  const containerClass = `w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border transition-all duration-300 shadow-glass-sm ${
    isError 
      ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' 
      : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
  }`;

  const iconClass = `w-5 h-5 ${isError ? 'animate-pulse' : ''}`;

  return (
    <div className={containerClass}>
      {provider === 'openai' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={iconClass} strokeWidth="1.5">
          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
          <path d="M12 6v12M6 12h12" />
        </svg>
      ) : (
        <Bot className={iconClass} />
      )}
    </div>
  );
});
