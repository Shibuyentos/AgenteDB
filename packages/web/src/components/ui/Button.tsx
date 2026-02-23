import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  loading?: boolean;
}

const variants = {
  primary: 'bg-white hover:bg-gray-200 text-black shadow-sm',
  secondary: 'bg-[#09090b] hover:bg-[#18181b] text-white border border-white/10 shadow-subtle-inner',
  ghost: 'bg-transparent hover:bg-white/5 text-text-secondary hover:text-white',
  danger: 'bg-transparent hover:bg-red-500/10 text-red-500 border border-transparent hover:border-red-500/20',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs gap-1.5 rounded-md',
  md: 'px-4 py-2 text-sm gap-2 rounded-lg',
  lg: 'px-6 py-2.5 text-sm gap-2.5 rounded-lg',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', icon, loading, children, disabled, className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`
          inline-flex items-center justify-center rounded-lg
          transition-all duration-300 ease-out cursor-pointer
          disabled:opacity-40 disabled:cursor-not-allowed disabled:grayscale
          active:scale-[0.96]
          ${variants[variant]} ${sizes[size]} ${className}
        `}
        {...props}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
