export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-brand animate-dot-bounce" style={{ animationDelay: '0s' }} />
        <div className="w-2 h-2 rounded-full bg-brand animate-dot-bounce" style={{ animationDelay: '0.16s' }} />
        <div className="w-2 h-2 rounded-full bg-brand animate-dot-bounce" style={{ animationDelay: '0.32s' }} />
      </div>
      <span className="text-sm text-text-muted animate-pulse-subtle">Pensando...</span>
    </div>
  );
}
