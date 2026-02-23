import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fadeIn" 
        onClick={onClose} 
      />
      
      {/* Modal Card */}
      <div className={`
        relative w-full ${sizes[size]} glass-card-strong shadow-glass-lg
        border-white/10 animate-scaleIn overflow-hidden flex flex-col
      `}>
        {/* Glow behind title */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 bg-brand/10 blur-[60px] pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 relative z-10">
          {title ? (
            <h3 className="text-xl font-extrabold tracking-tight text-white">
              {title}
            </h3>
          ) : (
            <span />
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-text-muted hover:text-white hover:bg-white/5 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-8 py-8 flex-1 overflow-y-auto relative z-10 custom-scrollbar max-h-[70vh]">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-8 py-6 border-t border-white/5 bg-white/[0.02] flex items-center justify-end gap-3 relative z-10">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
