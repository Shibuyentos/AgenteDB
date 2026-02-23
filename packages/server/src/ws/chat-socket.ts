import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { ServerState } from '../index.js';
import {
  analyzeSqlExecutionError,
  ContextBuilder,
  LLMClient,
  QueryExecutor,
} from '@agentdb/core';
import type { ExecutionResult } from '@agentdb/core';

interface ChatSocketUserMessage {
  type: 'message';
  content: string;
}

interface ChatSocketCancelMessage {
  type: 'cancel';
}

type ChatSocketMessage = ChatSocketUserMessage | ChatSocketCancelMessage;
type RunPhase = 'idle' | 'thinking' | 'executing' | 'summarizing';
type RunDoneStatus = 'completed' | 'error' | 'canceled';

interface ChatResponse {
  type:
    | 'thinking'
    | 'text'
    | 'sql'
    | 'executing'
    | 'result'
    | 'summary'
    | 'error'
    | 'run_state'
    | 'run_done';
  content?: string;
  data?: Record<string, unknown>;
}

interface ActiveRun {
  id: number;
  canceled: boolean;
}

const MAX_AUTONOMOUS_STEPS = 3;
const RESULT_SAMPLE_SIZE = 5;
const PROMPT_SAMPLE_MAX_CHARS = 6000;
const HISTORY_LIMIT = 50;

function send(ws: WebSocket, msg: ChatResponse): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sendRunState(
  ws: WebSocket,
  phase: RunPhase,
  busy: boolean,
  detail?: string
): void {
  send(ws, {
    type: 'run_state',
    data: {
      phase,
      busy,
      detail: detail ?? '',
    },
  });
}

function sendRunDone(ws: WebSocket, status: RunDoneStatus): void {
  send(ws, {
    type: 'run_done',
    data: { status },
  });
}

function stripCodeBlocks(text: string): string {
  return text
    .replace(/```sql\s*\n[\s\S]*?```/gi, '')
    .replace(/```\s*\n[\s\S]*?```/g, '')
    .trim();
}

function serializeSampleRows(rows: Record<string, unknown>[]): string {
  const raw = JSON.stringify(rows);
  if (raw.length <= PROMPT_SAMPLE_MAX_CHARS) {
    return raw;
  }
  return `${raw.slice(0, PROMPT_SAMPLE_MAX_CHARS)}... [truncated]`;
}

function buildContinuationPrompt(
  originalQuestion: string,
  step: number,
  maxSteps: number,
  sql: string,
  result: ExecutionResult
): string {
  const columns = result.columns || Object.keys(result.rows[0] || {});
  const sampleRows = result.rows.slice(0, RESULT_SAMPLE_SIZE);

  return [
    '[Sistema] Continue a analise de forma autonoma.',
    `Pergunta original do usuario: ${JSON.stringify(originalQuestion)}`,
    `Passo atual: ${step} de ${maxSteps}.`,
    '',
    'SQL executada no passo atual:',
    '```sql',
    sql,
    '```',
    '',
    `Resultado: ${result.rowCount} linha(s), ${result.duration}ms.`,
    `Colunas: ${columns.join(', ') || '(sem colunas)'}.`,
    `Amostra (${sampleRows.length} linha(s)): ${serializeSampleRows(sampleRows)}`,
    '',
    'Regra obrigatoria:',
    '- Se a pergunta ja estiver completamente respondida, responda em texto final e sem SQL.',
    '- Se ainda faltar informacao para responder bem, gere exatamente uma proxima query SQL completa em bloco ```sql```.',
    '- Nao pergunte ao usuario se deve continuar.',
  ].join('\n');
}

function buildForcedFinalPrompt(
  originalQuestion: string,
  sql: string,
  result: ExecutionResult
): string {
  const columns = result.columns || Object.keys(result.rows[0] || {});
  const sampleRows = result.rows.slice(0, RESULT_SAMPLE_SIZE);

  return [
    '[Sistema] Limite de etapas SQL atingido. Entregue resposta final agora.',
    `Pergunta original do usuario: ${JSON.stringify(originalQuestion)}`,
    '',
    'Ultima SQL executada:',
    '```sql',
    sql,
    '```',
    '',
    `Ultimo resultado: ${result.rowCount} linha(s), ${result.duration}ms.`,
    `Colunas: ${columns.join(', ') || '(sem colunas)'}.`,
    `Amostra (${sampleRows.length} linha(s)): ${serializeSampleRows(sampleRows)}`,
    '',
    'Responda apenas em texto claro, sem SQL e sem pedir para continuar.',
  ].join('\n');
}

function formatResultData(result: ExecutionResult): Record<string, unknown> {
  return {
    rows: result.rows,
    rowCount: result.rowCount,
    duration: result.duration,
    columns: result.columns || Object.keys(result.rows[0] || {}),
  };
}

function buildActionableErrorMessage(rawQuestion: string): string {
  return [
    rawQuestion,
    'Responda "sim" para eu tentar automaticamente uma alternativa, ou me diga qual direcao voce prefere.',
  ].join('\n');
}

function saveQueryToHistory(
  state: ServerState,
  sql: string,
  result: ExecutionResult
): void {
  state.queryHistory.unshift({
    sql,
    rowCount: result.rowCount,
    duration: result.duration,
    error: result.error,
    timestamp: new Date().toISOString(),
  });
  if (state.queryHistory.length > HISTORY_LIMIT) {
    state.queryHistory.pop();
  }
}

export function setupChatSocket(server: Server, state: ServerState): void {
  const wss = new WebSocketServer({ server, path: '/ws/chat' });

  wss.on('connection', (ws) => {
    console.log('[WS] Chat client connected');

    let runCounter = 0;
    let activeRun: ActiveRun | null = null;

    const isRunActive = (run: ActiveRun): boolean => {
      return (
        activeRun?.id === run.id &&
        !run.canceled &&
        ws.readyState === WebSocket.OPEN
      );
    };

    const finishRun = (run: ActiveRun, status: RunDoneStatus): void => {
      if (activeRun?.id !== run.id) {
        return;
      }

      activeRun = null;
      sendRunDone(ws, status);

      const detail =
        status === 'canceled'
          ? 'Execucao cancelada.'
          : status === 'error'
            ? 'Execucao encerrada com erro.'
            : '';

      sendRunState(ws, 'idle', false, detail);
    };

    const ensureAgentReady = (): boolean => {
      if (!state.activeConnection || !state.schemaEngine) {
        send(ws, {
          type: 'error',
          content: 'Nenhum banco conectado. Conecte a um banco primeiro.',
        });
        return false;
      }

      if (!state.isAuthenticated) {
        send(ws, {
          type: 'error',
          content: 'Nao autenticado. Faca login primeiro.',
        });
        return false;
      }

      if (!state.llmClient) {
        state.llmClient = new LLMClient(state.auth);
        const contextBuilder = new ContextBuilder(state.schemaEngine);
        state.llmClient.setSystemPrompt(contextBuilder.buildSystemPrompt());
      }

      if (!state.executor) {
        state.executor = new QueryExecutor(state.activeConnection);
      }

      return true;
    };

    const runAutonomousFlow = async (
      run: ActiveRun,
      userInput: string
    ): Promise<void> => {
      try {
        if (!state.llmClient || !state.executor) {
          send(ws, {
            type: 'error',
            content: 'Agente indisponivel. Tente novamente em alguns segundos.',
          });
          finishRun(run, 'error');
          return;
        }

        let modelInput = userInput;
        const originalQuestion = userInput;
        let lastResult: ExecutionResult | null = null;
        let lastSQL = '';

        for (let step = 1; step <= MAX_AUTONOMOUS_STEPS; step += 1) {
          if (!isRunActive(run)) return;

          sendRunState(
            ws,
            'thinking',
            true,
            step === 1
              ? 'Pensando na melhor estrategia...'
              : `Refinando analise (${step}/${MAX_AUTONOMOUS_STEPS})...`
          );
          send(ws, { type: 'thinking', content: '' });

          const llmResponse = await state.llmClient.chat(modelInput);
          if (!isRunActive(run)) return;

          const assistantContent = llmResponse.content?.trim();
          if (!assistantContent) {
            send(ws, { type: 'error', content: 'Resposta vazia do LLM.' });
            finishRun(run, 'error');
            return;
          }

          const sql = state.executor.extractSQL(assistantContent);
          if (!sql) {
            send(ws, { type: 'text', content: assistantContent });
            finishRun(run, 'completed');
            return;
          }

          const explanation = stripCodeBlocks(assistantContent);
          if (explanation) {
            send(ws, { type: 'text', content: explanation });
          }

          send(ws, { type: 'sql', content: sql });
          sendRunState(ws, 'executing', true, `Executando consulta ${step}...`);
          send(ws, { type: 'executing', content: '' });

          const result = await state.executor.execute(sql);
          if (!isRunActive(run)) return;

          saveQueryToHistory(state, sql, result);
          lastResult = result;
          lastSQL = sql;

          if (result.error) {
            send(ws, { type: 'error', content: `Erro SQL: ${result.error}` });

            const guidance = analyzeSqlExecutionError(result.error);
            if (guidance.shouldAskUser && guidance.userQuestion) {
              const followUp = buildActionableErrorMessage(guidance.userQuestion);
              send(ws, { type: 'text', content: followUp });
              state.llmClient.addToHistory({
                role: 'assistant',
                content: followUp,
              });
              finishRun(run, 'completed');
              return;
            }

            finishRun(run, 'error');
            return;
          }

          send(ws, { type: 'result', data: formatResultData(result) });

          if (step < MAX_AUTONOMOUS_STEPS) {
            modelInput = buildContinuationPrompt(
              originalQuestion,
              step,
              MAX_AUTONOMOUS_STEPS,
              sql,
              result
            );
            continue;
          }
        }

        if (!isRunActive(run)) return;

        if (lastResult && lastSQL) {
          sendRunState(ws, 'summarizing', true, 'Consolidando resposta final...');
          const forcedFinal = await state.llmClient.chat(
            buildForcedFinalPrompt(originalQuestion, lastSQL, lastResult)
          );
          if (!isRunActive(run)) return;

          const finalText = stripCodeBlocks(forcedFinal.content || '');
          send(ws, {
            type: 'text',
            content:
              finalText ||
              'Analise concluida com sucesso. Se quiser, posso aprofundar algum recorte especifico.',
          });
        } else {
          send(ws, {
            type: 'text',
            content:
              'Analise concluida, mas sem dados suficientes para gerar uma resposta final detalhada.',
          });
        }

        finishRun(run, 'completed');
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro desconhecido';
        if (isRunActive(run)) {
          send(ws, { type: 'error', content: msg });
          finishRun(run, 'error');
        }
      }
    };

    ws.on('message', async (rawData) => {
      try {
        const data = JSON.parse(rawData.toString()) as ChatSocketMessage;

        if (data.type === 'cancel') {
          if (activeRun) {
            activeRun.canceled = true;
            activeRun = null;
            sendRunDone(ws, 'canceled');
          }
          sendRunState(ws, 'idle', false, 'Execucao cancelada.');
          return;
        }

        if (data.type !== 'message' || !data.content?.trim()) {
          send(ws, { type: 'error', content: 'Formato de mensagem invalido.' });
          return;
        }

        if (activeRun && !activeRun.canceled) {
          sendRunState(
            ws,
            'thinking',
            true,
            'Ja estou processando a solicitacao anterior.'
          );
          return;
        }

        if (!ensureAgentReady()) return;

        const run: ActiveRun = {
          id: ++runCounter,
          canceled: false,
        };
        activeRun = run;

        await runAutonomousFlow(run, data.content.trim());
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro desconhecido';
        send(ws, { type: 'error', content: msg });
        if (!activeRun) {
          sendRunDone(ws, 'error');
          sendRunState(ws, 'idle', false, 'Falha ao processar a mensagem.');
        }
      }
    });

    ws.on('close', () => {
      if (activeRun) {
        activeRun.canceled = true;
        activeRun = null;
      }
      console.log('[WS] Chat client disconnected');
    });

    ws.on('error', (error) => {
      console.error('[WS] Error:', error.message);
    });
  });
}
