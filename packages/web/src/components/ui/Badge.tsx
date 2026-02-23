import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info' | 'premium';
  size?: 'sm' | 'md';
  className?: string;
}

const variants = {
  default: 'bg-white/5 text-text-muted border-white/10',
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 glow-brand',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
  warning: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  info: 'bg-brand/10 text-brand border-brand/20 glow-brand',
  premium: 'bg-gradient-brand text-white border-white/10 shadow-glow-sm',
};

const sizes = {
  sm: 'px-2 py-0.5 text-[9px] font-black tracking-widest uppercase rounded-lg',
  md: 'px-3 py-1 text-[10px] font-black tracking-[0.15em] uppercase rounded-xl',
};

export function Badge({ children, variant = 'default', size = 'md', className = '' }: BadgeProps) {
  return (
    <span className={`
      inline-flex items-center justify-center border
      transition-all duration-300
      ${variants[variant]} ${sizes[size]} ${className}
    `}>
      {children}
    </span>
  );
}
