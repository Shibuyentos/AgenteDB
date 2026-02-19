import { Table } from '../ui/Table';
import { Clock, Rows3, Download } from 'lucide-react';
import type { QueryResult } from '../../types';

interface ResultTableProps {
  data: QueryResult;
  compact?: boolean;
}

export function ResultTable({ data, compact = true }: ResultTableProps) {
  const columns = data.columns.map(col => ({
    key: col,
    label: col,
  }));

  const handleExportJSON = () => {
    const json = JSON.stringify(data.rows, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'result.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const headers = data.columns.join(',');
    const rows = data.rows.map(row =>
      data.columns.map(col => {
        const val = row[col];
        if (val === null || val === undefined) return '';
        const str = String(val);
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(',')
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'result.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="my-2 animate-slideUp">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-bg-elevated/30 rounded-t-lg border border-border/50 border-b-0">
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="flex items-center gap-1">
            <Rows3 className="w-3 h-3" />
            {data.rowCount} {data.rowCount === 1 ? 'linha' : 'linhas'}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {data.duration}ms
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleExportJSON}
            className="px-2 py-0.5 rounded text-[10px] text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors cursor-pointer"
          >
            JSON
          </button>
          <button
            onClick={handleExportCSV}
            className="px-2 py-0.5 rounded text-[10px] text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors cursor-pointer"
          >
            CSV
          </button>
        </div>
      </div>

      <Table
        columns={columns}
        data={data.rows}
        compact={compact}
        maxRows={10}
      />
    </div>
  );
}
