export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-4 px-6 py-4 glass-card-strong border-white/5 rounded-[2rem] rounded-tl-[0.5rem] shadow-glass-lg animate-fadeIn">
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 glow-brand animate-dot-bounce" style={{ animationDelay: '0s' }} />
        <div className="w-1.5 h-1.5 rounded-full bg-violet-400 glow-purple animate-dot-bounce" style={{ animationDelay: '0.16s' }} />
        <div className="w-1.5 h-1.5 rounded-full bg-pink-400 glow-purple animate-dot-bounce" style={{ animationDelay: '0.32s' }} />
      </div>
      <span className="text-xs font-bold tracking-[0.2em] text-text-secondary uppercase animate-pulse-subtle">
        Processando Inteligência...
      </span>
    </div>
  );
}
