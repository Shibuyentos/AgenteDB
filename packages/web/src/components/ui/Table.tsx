import React from 'react';
import { Database } from 'lucide-react';

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
    return { display: 'NULL', colorClass: 'text-red-400/60 italic' };
  }
  if (typeof value === 'number') {
    return { display: value.toLocaleString('pt-BR'), colorClass: 'text-cyan-400 font-mono' };
  }
  if (typeof value === 'boolean') {
    return {
      display: value ? 'true' : 'false',
      colorClass: value ? 'text-emerald-400' : 'text-red-400',
    };
  }
  // Date detection
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return { display: str, colorClass: 'text-amber-400 font-mono text-xs' };
  }
  return { display: str, colorClass: 'text-text-primary' };
}

export function Table({ columns, data, compact = false, maxRows, className = '', onViewAll }: TableProps) {
  const displayData = maxRows ? data.slice(0, maxRows) : data;
  const hasMore = maxRows ? data.length > maxRows : false;

  if (data.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 text-text-muted ${className}`}>
        <Database className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">Nenhum dado encontrado</p>
      </div>
    );
  }

  return (
    <div className={`w-full overflow-hidden rounded-lg border border-border ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-elevated/50 border-b border-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`
                    ${compact ? 'px-3 py-1.5' : 'px-4 py-2.5'}
                    text-xs font-semibold text-text-muted uppercase tracking-wider
                    text-${col.align || 'left'} whitespace-nowrap
                  `}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayData.map((row, i) => (
              <tr
                key={i}
                className={`
                  border-b border-border/50 last:border-b-0
                  hover:bg-bg-elevated/30 transition-colors duration-75
                  ${i % 2 === 1 ? 'bg-bg-elevated/10' : ''}
                `}
              >
                {columns.map((col) => {
                  const { display, colorClass } = formatCellValue(row[col.key]);
                  return (
                    <td
                      key={col.key}
                      className={`
                        ${compact ? 'px-3 py-1' : 'px-4 py-2'}
                        ${colorClass}
                        text-${col.align || 'left'}
                        max-w-[300px] truncate
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
        <div className="px-4 py-2 bg-bg-elevated/30 border-t border-border text-center">
          <button
            onClick={onViewAll}
            className="text-xs text-brand hover:text-brand-hover transition-colors cursor-pointer"
          >
            Ver todas ({data.length} linhas)
          </button>
        </div>
      )}
    </div>
  );
}
