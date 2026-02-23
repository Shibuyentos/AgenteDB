import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ icon, label, error, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const renderedIcon =
      icon && React.isValidElement<{ className?: string }>(icon)
        ? React.cloneElement(icon, {
            className: ['w-4 h-4', icon.props.className].filter(Boolean).join(' '),
          })
        : icon;

    return (
      <div className="w-full space-y-2">
        {label && (
          <label htmlFor={inputId} className="block text-[11px] font-black text-text-muted uppercase tracking-[0.2em]">
            {label}
          </label>
        )}
        <div className="relative group">
          {icon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-brand transition-colors duration-300">
              {renderedIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`
              w-full bg-white/[0.03] border border-white/5 rounded-2xl px-4 py-3 text-sm
              text-text-primary placeholder:text-text-muted/50
              focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/20
              transition-all duration-300 focus-glow
              ${icon ? 'pl-12' : ''}
              ${error ? 'border-red-500/50 focus:ring-red-500/20' : ''}
              ${className}
            `}
            {...props}
          />
        </div>
        {error && <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide px-1">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
