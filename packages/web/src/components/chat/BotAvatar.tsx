import { memo } from 'react';
import { Bot } from 'lucide-react';
import { useAppStore } from '../../stores/app-store';
import { OpenAIIcon } from '../icons/OpenAIIcon';
import { AnthropicIcon } from '../icons/AnthropicIcon';

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
        <OpenAIIcon className={iconClass} />
      ) : provider === 'anthropic' ? (
        <AnthropicIcon className={iconClass} />
      ) : (
        <Bot className={iconClass} />
      )}
    </div>
  );
});
