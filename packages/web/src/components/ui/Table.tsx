import React from 'react';
import { Database, ChevronRight } from 'lucide-react';

interface Column {
  key: string;
  label: string;
  width?: string;
  align?: 'left' | 'right' | 'center';
}

interface TableProps {
  columns: Column[];
  data: Record<string, unknown>[];
  compact?: boolean;
  maxRows?: number;
  className?: string;
  onViewAll?: () => void;
}

function formatCellValue(value: unknown): { display: string; colorClass: string } {
  if (value === null || value === undefined) {
    return { display: 'NULL', colorClass: 'text-red-400/50 italic font-bold tracking-widest text-[10px]' };
  }
  if (typeof value === 'number') {
    return { display: value.toLocaleString('pt-BR'), colorClass: 'text-emerald-400 font-mono font-medium' };
  }
  if (typeof value === 'boolean') {
    return {
      display: value ? 'TRUE' : 'FALSE',
      colorClass: value ? 'text-indigo-400 font-black' : 'text-rose-400 font-black',
    };
  }
  // Date detection
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return { display: str, colorClass: 'text-amber-200/80 font-mono text-xs' };
  }
  return { display: str, colorClass: 'text-text-primary/90' };
}

export function Table({ columns, data, compact = false, maxRows, className = '', onViewAll }: TableProps) {
  const displayData = maxRows ? data.slice(0, maxRows) : data;
  const hasMore = maxRows ? data.length > maxRows : false;

  if (data.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-20 glass-panel rounded-3xl border-white/5 ${className}`}>
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
          <Database className="w-8 h-8 text-text-muted opacity-20" />
        </div>
        <p className="text-xs font-bold tracking-widest text-text-muted uppercase">Nenhum dado encontrado</p>
      </div>
    );
  }

  return (
    <div className={`w-full overflow-hidden glass-card-strong border-white/5 rounded-3xl shadow-glass-lg ${className}`}>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-white/[0.03] border-b border-white/5">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`
                    ${compact ? 'px-4 py-3' : 'px-6 py-4'}
                    text-[10px] font-black text-text-muted uppercase tracking-[0.2em]
                    text-${col.align || 'left'} whitespace-nowrap
                  `}
                  style={col.width ? { width: col.width } : undefined}
                >
                  <div className="flex items-center gap-2">
                    {col.label}
                    <div className="w-1 h-1 rounded-full bg-white/10" />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {displayData.map((row, i) => (
              <tr
                key={i}
                className="hover:bg-white/[0.04] transition-all duration-300 group"
              >
                {columns.map((col) => {
                  const { display, colorClass } = formatCellValue(row[col.key]);
                  return (
                    <td
                      key={col.key}
                      className={`
                        ${compact ? 'px-4 py-2.5' : 'px-6 py-4'}
                        ${colorClass}
                        text-${col.align || 'left'}
                        max-w-[400px] truncate transition-colors
                      `}
                      title={display}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="px-6 py-3 bg-white/[0.02] border-t border-white/5 text-center">
          <button
            onClick={onViewAll}
            className="group inline-flex items-center gap-2 text-[10px] font-black tracking-widest text-brand hover:text-brand-hover transition-all cursor-pointer uppercase py-1"
          >
            Ver todas as {data.length} linhas
            <ChevronRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      )}
    </div>
  );
}
