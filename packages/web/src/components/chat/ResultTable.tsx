import { Table } from '../ui/Table';
import { Clock, Rows3, Download, FileJson, FileSpreadsheet } from 'lucide-react';
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
    <div className="my-6 animate-fadeInUp">
      {/* Metrics & Actions Pill */}
      <div className="flex items-center justify-between px-6 py-3 glass-panel rounded-full border-white/5 mb-4 shadow-glow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <Rows3 className="w-3 h-3 text-indigo-400" />
            </div>
            <span className="text-[10px] font-black tracking-widest text-text-primary uppercase">
              {data.rowCount} <span className="text-text-muted">REGISTROS</span>
            </span>
          </div>
          
          <div className="w-px h-3 bg-white/10" />

          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Clock className="w-3 h-3 text-emerald-400" />
            </div>
            <span className="text-[10px] font-black tracking-widest text-text-primary uppercase">
              {data.duration} <span className="text-text-muted">MS</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportJSON}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-[9px] font-black tracking-widest text-text-muted hover:text-brand hover:bg-brand/10 transition-all cursor-pointer border border-transparent hover:border-brand/20 uppercase"
          >
            <FileJson className="w-3 h-3" />
            JSON
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-[9px] font-black tracking-widest text-text-muted hover:text-brand hover:bg-brand/10 transition-all cursor-pointer border border-transparent hover:border-brand/20 uppercase"
          >
            <FileSpreadsheet className="w-3 h-3" />
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
