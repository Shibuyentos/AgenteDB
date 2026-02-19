import { useState } from 'react';
import { Copy, Play, Check, Code2 } from 'lucide-react';
import { api } from '../../lib/api';

interface SQLBlockProps {
  sql: string;
  executed?: boolean;
  onResult?: (data: any) => void;
}

const SQL_KEYWORDS = /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|AND|OR|NOT|IN|EXISTS|BETWEEN|LIKE|ILIKE|IS|NULL|AS|ORDER\s+BY|GROUP\s+BY|HAVING|LIMIT|OFFSET|UNION|EXCEPT|INTERSECT|DISTINCT|INTO|VALUES|SET|RETURNING|CASCADE|RESTRICT|DEFAULT|REFERENCES|FOREIGN\s+KEY|PRIMARY\s+KEY|CONSTRAINT|INDEX|TABLE|VIEW|SCHEMA|BEGIN|COMMIT|ROLLBACK|WITH|RECURSIVE|CASE|WHEN|THEN|ELSE|END|ASC|DESC|NULLS|FIRST|LAST|COUNT|SUM|AVG|MIN|MAX|COALESCE|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/gi;

function highlightSQL(sql: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  // Reset regex
  SQL_KEYWORDS.lastIndex = 0;

  const text = sql;

  // Simple tokenization
  const tokens: { type: 'keyword' | 'string' | 'number' | 'comment' | 'text'; value: string }[] = [];
  let i = 0;

  while (i < text.length) {
    // Single-line comment
    if (text[i] === '-' && text[i + 1] === '-') {
      const end = text.indexOf('\n', i);
      const commentEnd = end === -1 ? text.length : end;
      tokens.push({ type: 'comment', value: text.slice(i, commentEnd) });
      i = commentEnd;
      continue;
    }

    // String
    if (text[i] === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== "'") j++;
      tokens.push({ type: 'string', value: text.slice(i, j + 1) });
      i = j + 1;
      continue;
    }

    // Number
    if (/\d/.test(text[i]) && (i === 0 || /[\s,=(]/.test(text[i - 1]))) {
      let j = i;
      while (j < text.length && /[\d.]/.test(text[j])) j++;
      tokens.push({ type: 'number', value: text.slice(i, j) });
      i = j;
      continue;
    }

    // Word
    if (/[a-zA-Z_]/.test(text[i])) {
      let j = i;
      while (j < text.length && /[a-zA-Z0-9_]/.test(text[j])) j++;
      const word = text.slice(i, j);
      if (SQL_KEYWORDS.test(word)) {
        SQL_KEYWORDS.lastIndex = 0;
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
        return <span key={idx} className="text-cyan-400 font-bold">{token.value.toUpperCase()}</span>;
      case 'string':
        return <span key={idx} className="text-amber-300">{token.value}</span>;
      case 'number':
        return <span key={idx} className="text-emerald-400">{token.value}</span>;
      case 'comment':
        return <span key={idx} className="text-text-muted italic">{token.value}</span>;
      default:
        return <span key={idx}>{token.value}</span>;
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
    <div className="rounded-lg overflow-hidden border border-border/50 my-2 animate-slideUp">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0C0C0E] border-b border-border/30">
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <Code2 className="w-3.5 h-3.5" />
          <span>SQL</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3 h-3 text-brand" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          {!wasExecuted && (
            <button
              onClick={handleExecute}
              disabled={executing}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-brand hover:text-brand-hover hover:bg-brand/10 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3 h-3" />
              {executing ? 'Executando...' : 'Executar'}
            </button>
          )}
        </div>
      </div>

      {/* Code */}
      <pre className="px-4 py-3 bg-[#0C0C0E] text-sm font-mono overflow-x-auto leading-relaxed">
        <code>{highlightSQL(sql)}</code>
      </pre>
    </div>
  );
}
