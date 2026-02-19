import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, className = '', hover = false, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        bg-bg-card border border-border rounded-lg p-4
        ${hover ? 'hover:border-border-hover transition-colors duration-150 cursor-pointer' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
