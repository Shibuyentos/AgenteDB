export type SqlErrorKind =
  | 'permission'
  | 'read_only'
  | 'missing_object'
  | 'timeout'
  | 'connection'
  | 'syntax'
  | 'unknown';

export interface SqlErrorGuidance {
  kind: SqlErrorKind;
  actionable: boolean;
  shouldAskUser: boolean;
  shouldAutoRetry: boolean;
  userQuestion: string | null;
  recoveryInstruction: string;
}

function extractPermissionTarget(errorMessage: string): string | null {
  const match = errorMessage.match(
    /permission denied for (schema|table|relation|sequence|function)\s+("?[\w.]+"?)/i
  );
  if (!match) return null;
  return `${match[1]} ${match[2]}`;
}

function extractMissingObjectTarget(errorMessage: string): string | null {
  const patterns = [
    /relation\s+("?[\w.]+"?)\s+does not exist/i,
    /table\s+("?[\w.]+"?)\s+does not exist/i,
    /column\s+("?[\w.]+"?)\s+does not exist/i,
    /schema\s+("?[\w.]+"?)\s+does not exist/i,
    /function\s+("?[\w.,\s()]+"?)\s+does not exist/i,
  ];

  for (const pattern of patterns) {
    const match = errorMessage.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

export function analyzeSqlExecutionError(
  errorMessage: string
): SqlErrorGuidance {
  const normalized = errorMessage.toLowerCase();

  const isPermissionError =
    normalized.includes('permission denied') ||
    normalized.includes('insufficient privilege') ||
    normalized.includes('not authorized') ||
    normalized.includes('must be owner of');

  if (isPermissionError) {
    const target = extractPermissionTarget(errorMessage);
    const targetPart = target ? ` para acessar ${target}` : '';

    return {
      kind: 'permission',
      actionable: true,
      shouldAskUser: true,
      shouldAutoRetry: false,
      userQuestion: `Nao tenho permissao${targetPart}. Quer que eu tente uma versao alternativa da analise usando apenas objetos liberados (resultado pode ficar parcial)?`,
      recoveryInstruction:
        'Reescreva a consulta usando apenas objetos acessiveis. Evite schemas/tabelas sem permissao e mantenha o objetivo original, deixando claro quando a resposta ficar parcial.',
    };
  }

  const isReadOnlyError =
    normalized.includes('read-only') ||
    normalized.includes('read only') ||
    normalized.includes('modo somente leitura') ||
    (normalized.includes('cannot execute') &&
      normalized.includes('read-only transaction'));

  if (isReadOnlyError) {
    return {
      kind: 'read_only',
      actionable: true,
      shouldAskUser: true,
      shouldAutoRetry: false,
      userQuestion:
        'Essa operacao foi bloqueada por modo read-only. Quer que eu tente uma alternativa somente leitura para avancar na analise?',
      recoveryInstruction:
        'Substitua operacoes de escrita por consultas de leitura que permitam responder a pergunta sem alterar dados.',
    };
  }

  const isMissingObjectError =
    normalized.includes('does not exist') ||
    normalized.includes('undefined_table') ||
    normalized.includes('undefined_column') ||
    normalized.includes('undefined_function');

  if (isMissingObjectError) {
    const target = extractMissingObjectTarget(errorMessage);
    const targetPart = target ? ` (${target})` : '';

    return {
      kind: 'missing_object',
      actionable: true,
      shouldAskUser: true,
      shouldAutoRetry: false,
      userQuestion: `Nao encontrei um objeto necessario${targetPart}. Quer que eu adapte a consulta com base no schema disponivel agora?`,
      recoveryInstruction:
        'Ajuste a consulta para usar apenas tabelas/colunas/funcoes existentes no schema atual mantendo a intencao da pergunta.',
    };
  }

  const isTimeoutError =
    normalized.includes('statement timeout') ||
    normalized.includes('canceling statement due to statement timeout') ||
    normalized.includes('timeout');

  if (isTimeoutError) {
    return {
      kind: 'timeout',
      actionable: true,
      shouldAskUser: true,
      shouldAutoRetry: false,
      userQuestion:
        'A consulta estourou o tempo limite. Quer que eu tente uma versao mais leve (recorte menor ou agregacao antes) para continuar?',
      recoveryInstruction:
        'Reduza o custo da consulta com filtros de periodo, agregacao antecipada ou limitacao de linhas sem perder o objetivo principal.',
    };
  }

  const isConnectionError =
    normalized.includes('econnrefused') ||
    normalized.includes('terminating connection') ||
    normalized.includes('connection');

  if (isConnectionError) {
    return {
      kind: 'connection',
      actionable: false,
      shouldAskUser: false,
      shouldAutoRetry: false,
      userQuestion: null,
      recoveryInstruction: '',
    };
  }

  const isSyntaxError =
    normalized.includes('syntax error') ||
    normalized.includes('invalid input syntax') ||
    normalized.includes('unterminated');

  if (isSyntaxError) {
    return {
      kind: 'syntax',
      actionable: false,
      shouldAskUser: false,
      shouldAutoRetry: true,
      userQuestion: null,
      recoveryInstruction:
        'Corrija o SQL mantendo a mesma intencao, com sintaxe valida e sem placeholders.',
    };
  }

  return {
    kind: 'unknown',
    actionable: false,
    shouldAskUser: false,
    shouldAutoRetry: true,
    userQuestion: null,
    recoveryInstruction:
      'Ajuste a consulta para resolver o erro mantendo o objetivo original do usuario.',
  };
}
