import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { useToastStore, type Toast as ToastType } from '../../hooks/useToast';

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const borderColors = {
  success: 'border-l-emerald-500',
  error: 'border-l-red-500',
  info: 'border-l-cyan-500',
};

const iconColors = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  info: 'text-cyan-400',
};

function ToastItem({ toast, onRemove }: { toast: ToastType; onRemove: () => void }) {
  const [progress, setProgress] = useState(100);
  const Icon = icons[toast.type];
  const duration = toast.duration || 4000;

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, [duration]);

  return (
    <div className={`
      relative flex items-start gap-2 px-3 py-2.5 rounded-lg
      bg-bg-card border border-border border-l-4 ${borderColors[toast.type]}
      shadow-lg animate-slideLeft min-w-[280px] max-w-[400px]
    `}>
      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${iconColors[toast.type]}`} />
      <p className="text-xs text-text-primary flex-1">{toast.message}</p>
      <button onClick={onRemove} className="shrink-0 text-text-muted hover:text-text-primary transition-colors cursor-pointer">
        <X className="w-3 h-3" />
      </button>
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-border/30 rounded-b-lg overflow-hidden">
        <div
          className={`h-full transition-all ease-linear ${
            toast.type === 'success' ? 'bg-emerald-500' :
            toast.type === 'error' ? 'bg-red-500' : 'bg-cyan-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}
