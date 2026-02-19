import { useEffect, useState } from 'react';
import {
  ArrowLeft, Table2, Eye, Key, Link2, Hash, Clock,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { Badge, Card, Spinner, Table } from '../components/ui';
import { useAppStore } from '../stores/app-store';
import { api } from '../lib/api';
import type { TableInfo } from '../types';

export function TableDetailPage() {
  const { selectedTable, setActivePage } = useAppStore();
  const [table, setTable] = useState<TableInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [sampleData, setSampleData] = useState<any[] | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    columns: true,
    indexes: true,
    foreignKeys: true,
    referencedBy: true,
  });

  useEffect(() => {
    if (!selectedTable) return;
    setLoading(true);
    api.schema
      .table(selectedTable.schema, selectedTable.name)
      .then(setTable)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedTable]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const loadSampleData = async () => {
    if (!selectedTable) return;
    setLoadingSample(true);
    try {
      const result = await api.query.execute(
        `SELECT * FROM "${selectedTable.schema}"."${selectedTable.name}" LIMIT 20`
      );
      setSampleData(result.rows);
    } catch (error) {
      console.error('Sample data error:', error);
    } finally {
      setLoadingSample(false);
    }
  };

  if (!selectedTable) return null;
  if (loading) return <div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>;
  if (!table) return <div className="p-6 text-text-muted">Tabela não encontrada.</div>;

  return (
    <div className="h-full overflow-y-auto p-6 animate-fadeIn">
      <div className="max-w-4xl mx-auto">
        {/* Back */}
        <button
          onClick={() => setActivePage('chat')}
          className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors mb-4 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          {table.type === 'view' ? (
            <Eye className="w-6 h-6 text-text-muted" />
          ) : (
            <Table2 className="w-6 h-6 text-brand" />
          )}
          <div>
            <h1 className="text-xl font-bold">
              {table.schema}.{table.name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              {table.type === 'view' && <Badge variant="info">VIEW</Badge>}
              <span className="text-xs text-text-muted">
                {table.columns.length} colunas
              </span>
              {table.estimatedRowCount > 0 && (
                <span className="text-xs text-text-muted">
                  • ~{table.estimatedRowCount.toLocaleString('pt-BR')} linhas
                </span>
              )}
              {table.comment && (
                <span className="text-xs text-text-secondary italic">
                  — {table.comment}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Columns */}
        <SectionHeader
          title="Colunas"
          count={table.columns.length}
          expanded={expandedSections.columns}
          onToggle={() => toggleSection('columns')}
        />
        {expandedSections.columns && (
          <Card className="mb-4 !p-0 overflow-hidden animate-slideUp">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-elevated/50 border-b border-border">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-text-muted">Nome</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-text-muted">Tipo</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-text-muted">Nullable</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-text-muted">Default</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-text-muted">Atributos</th>
                </tr>
              </thead>
              <tbody>
                {table.columns.map(col => {
                  const fk = table.foreignKeys.find(f => f.column === col.name);
                  return (
                    <tr key={col.name} className="border-b border-border/50 hover:bg-bg-elevated/30 transition-colors">
                      <td className="px-4 py-2 font-mono text-sm">
                        <span className="flex items-center gap-1.5">
                          {col.isPrimaryKey && <Key className="w-3 h-3 text-amber-400" />}
                          {fk && <Link2 className="w-3 h-3 text-cyan-400" />}
                          {col.name}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="default" size="sm">{col.type}</Badge>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {col.nullable ? (
                          <span className="text-text-muted text-xs">YES</span>
                        ) : (
                          <Badge variant="warning" size="sm">NOT NULL</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-text-muted max-w-[200px] truncate">
                        {col.defaultValue || '-'}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center gap-1 justify-end">
                          {col.isPrimaryKey && <Badge variant="warning" size="sm">PK</Badge>}
                          {fk && (
                            <Badge variant="info" size="sm">
                              FK→{fk.referencedTable}.{fk.referencedColumn}
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}

        {/* Indexes */}
        {table.indexes.length > 0 && (
          <>
            <SectionHeader
              title="Índices"
              count={table.indexes.length}
              expanded={expandedSections.indexes}
              onToggle={() => toggleSection('indexes')}
            />
            {expandedSections.indexes && (
              <Card className="mb-4 space-y-2 animate-slideUp">
                {table.indexes.map(idx => (
                  <div key={idx.name} className="flex items-center gap-2 text-xs">
                    <Hash className="w-3 h-3 text-text-muted" />
                    <span className="font-mono">{idx.name}</span>
                    {idx.isPrimary && <Badge variant="warning" size="sm">PRIMARY</Badge>}
                    {idx.isUnique && !idx.isPrimary && <Badge variant="success" size="sm">UNIQUE</Badge>}
                    <span className="text-text-muted">({idx.columns.join(', ')})</span>
                  </div>
                ))}
              </Card>
            )}
          </>
        )}

        {/* Foreign Keys */}
        {table.foreignKeys.length > 0 && (
          <>
            <SectionHeader
              title="Foreign Keys"
              count={table.foreignKeys.length}
              expanded={expandedSections.foreignKeys}
              onToggle={() => toggleSection('foreignKeys')}
            />
            {expandedSections.foreignKeys && (
              <Card className="mb-4 space-y-2 animate-slideUp">
                {table.foreignKeys.map((fk, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Link2 className="w-3 h-3 text-cyan-400" />
                    <span className="font-mono">{fk.column}</span>
                    <span className="text-text-muted">→</span>
                    <span className="font-mono text-cyan-400">
                      {fk.referencedSchema}.{fk.referencedTable}.{fk.referencedColumn}
                    </span>
                  </div>
                ))}
              </Card>
            )}
          </>
        )}

        {/* Referenced By */}
        {table.referencedBy.length > 0 && (
          <>
            <SectionHeader
              title="Referenciada por"
              count={table.referencedBy.length}
              expanded={expandedSections.referencedBy}
              onToggle={() => toggleSection('referencedBy')}
            />
            {expandedSections.referencedBy && (
              <Card className="mb-4 space-y-2 animate-slideUp">
                {table.referencedBy.map((ref, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Link2 className="w-3 h-3 text-amber-400" />
                    <span className="font-mono text-amber-400">
                      {ref.referencedSchema}.{ref.referencedTable}.{ref.referencedColumn}
                    </span>
                    <span className="text-text-muted">→</span>
                    <span className="font-mono">{ref.column}</span>
                  </div>
                ))}
              </Card>
            )}
          </>
        )}

        {/* Sample Data */}
        <div className="mt-6 mb-8">
          {sampleData ? (
            <>
              <h3 className="text-sm font-semibold text-text-secondary mb-2">
                Dados de Amostra (top 20)
              </h3>
              <Table
                columns={table.columns.map(c => ({ key: c.name, label: c.name }))}
                data={sampleData}
              />
            </>
          ) : (
            <button
              onClick={loadSampleData}
              disabled={loadingSample}
              className="px-4 py-2 rounded-lg bg-bg-elevated border border-border text-sm text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors cursor-pointer"
            >
              {loadingSample ? 'Carregando...' : 'Carregar dados de amostra'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  title, count, expanded, onToggle,
}: {
  title: string; count: number; expanded: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 w-full mb-2 text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
    >
      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      {title}
      <Badge size="sm">{count}</Badge>
    </button>
  );
}
