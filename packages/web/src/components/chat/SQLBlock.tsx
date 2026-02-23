import { useState } from 'react';
import { Copy, Play, Check, Code2, Sparkles } from 'lucide-react';
import { api } from '../../lib/api';

interface SQLBlockProps {
  sql: string;
  executed?: boolean;
  onResult?: (data: any) => void;
}

const SQL_KEYWORDS = /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|AND|OR|NOT|IN|EXISTS|BETWEEN|LIKE|ILIKE|IS|NULL|AS|ORDER\s+BY|GROUP\s+BY|HAVING|LIMIT|OFFSET|UNION|EXCEPT|INTERSECT|DISTINCT|INTO|VALUES|SET|RETURNING|CASCADE|RESTRICT|DEFAULT|REFERENCES|FOREIGN\s+KEY|PRIMARY\s+KEY|CONSTRAINT|INDEX|TABLE|VIEW|SCHEMA|BEGIN|COMMIT|ROLLBACK|WITH|RECURSIVE|CASE|WHEN|THEN|ELSE|END|ASC|DESC|NULLS|FIRST|LAST|COUNT|SUM|AVG|MIN|MAX|COALESCE|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/gi;

function highlightSQL(sql: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let i = 0;
  const text = sql;
  const tokens: { type: 'keyword' | 'string' | 'number' | 'comment' | 'text'; value: string }[] = [];

  while (i < text.length) {
    if (text[i] === '-' && text[i + 1] === '-') {
      const end = text.indexOf('\n', i);
      const commentEnd = end === -1 ? text.length : end;
      tokens.push({ type: 'comment', value: text.slice(i, commentEnd) });
      i = commentEnd;
      continue;
    }
    if (text[i] === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== "'") j++;
      tokens.push({ type: 'string', value: text.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    if (/\d/.test(text[i]) && (i === 0 || /[\s,=(]/.test(text[i - 1]))) {
      let j = i;
      while (j < text.length && /[\d.]/.test(text[j])) j++;
      tokens.push({ type: 'number', value: text.slice(i, j) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(text[i])) {
      let j = i;
      while (j < text.length && /[a-zA-Z0-9_]/.test(text[j])) j++;
      const word = text.slice(i, j);
      if (word.toUpperCase().match(SQL_KEYWORDS)) {
        tokens.push({ type: 'keyword', value: word });
      } else {
        tokens.push({ type: 'text', value: word });
      }
      i = j;
      continue;
    }
    tokens.push({ type: 'text', value: text[i] });
    i++;
  }

  return tokens.map((token, idx) => {
    switch (token.type) {
      case 'keyword':
        return <span key={idx} className="text-indigo-400 font-bold tracking-tight">{token.value.toUpperCase()}</span>;
      case 'string':
        return <span key={idx} className="text-amber-200 opacity-90">{token.value}</span>;
      case 'number':
        return <span key={idx} className="text-emerald-400">{token.value}</span>;
      case 'comment':
        return <span key={idx} className="text-text-muted italic opacity-60">{token.value}</span>;
      default:
        return <span key={idx} className="text-text-primary/80">{token.value}</span>;
    }
  });
}

export function SQLBlock({ sql, executed = false, onResult }: SQLBlockProps) {
  const [copied, setCopied] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [wasExecuted, setWasExecuted] = useState(executed);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExecute = async () => {
    setExecuting(true);
    try {
      const result = await api.query.execute(sql);
      setWasExecuted(true);
      onResult?.(result);
    } catch (error) {
      console.error('Execute error:', error);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="rounded-[1.5rem] overflow-hidden glass-card-strong border-white/5 my-4 animate-scaleIn shadow-glass-lg relative group">
      {/* Glow Effect on Hover */}
      <div className="absolute inset-0 bg-gradient-brand opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500 pointer-events-none" />
      
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-white/[0.02] border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center">
            <Code2 className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <span className="text-[10px] font-black tracking-[0.2em] text-text-muted uppercase">Query SQL</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold text-text-muted hover:text-text-primary hover:bg-white/5 transition-all cursor-pointer border border-transparent hover:border-white/10"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'COPIADO' : 'COPIAR'}
          </button>
          {!wasExecuted && (
            <button
              onClick={handleExecute}
              disabled={executing}
              className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-[10px] font-black bg-gradient-brand text-white hover:scale-105 transition-all cursor-pointer disabled:opacity-30 glow-brand shadow-glow-sm"
            >
              {executing ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              {executing ? 'EXECUTANDO...' : 'EXECUTAR'}
            </button>
          )}
          {wasExecuted && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-[9px] font-black text-emerald-400 tracking-widest">
              <Sparkles className="w-3.5 h-3.5" />
              EXECUTADO
            </div>
          )}
        </div>
      </div>

      {/* Code */}
      <div className="relative">
        <pre className="px-6 py-5 bg-black/40 text-[14px] font-mono overflow-x-auto leading-relaxed custom-scrollbar">
          <code className="block min-w-max">{highlightSQL(sql)}</code>
        </pre>
      </div>
    </div>
  );
}
