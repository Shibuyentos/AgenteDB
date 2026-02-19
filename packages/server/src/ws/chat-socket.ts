import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { ServerState } from '../index.js';
import {
  ContextBuilder,
  LLMClient,
  QueryExecutor,
} from '@agentdb/core';

interface ChatSocketMessage {
  type: 'message';
  content: string;
}

interface ChatResponse {
  type: 'thinking' | 'text' | 'sql' | 'executing' | 'result' | 'summary' | 'error';
  content?: string;
  data?: Record<string, unknown>;
}

function send(ws: WebSocket, msg: ChatResponse): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function setupChatSocket(server: Server, state: ServerState): void {
  const wss = new WebSocketServer({ server, path: '/ws/chat' });

  wss.on('connection', (ws) => {
    console.log('[WS] Chat client connected');

    ws.on('message', async (rawData) => {
      try {
        const data = JSON.parse(rawData.toString()) as ChatSocketMessage;

        if (data.type !== 'message' || !data.content) {
          send(ws, { type: 'error', content: 'Formato de mensagem inválido' });
          return;
        }

        if (!state.activeConnection || !state.schemaEngine) {
          send(ws, { type: 'error', content: 'Nenhum banco conectado. Conecte a um banco primeiro.' });
          return;
        }

        if (!state.isAuthenticated) {
          send(ws, { type: 'error', content: 'Não autenticado. Faça login primeiro.' });
          return;
        }

        // Inicializa LLM client se necessário
        if (!state.llmClient) {
          state.llmClient = new LLMClient(state.auth);
          const contextBuilder = new ContextBuilder(state.schemaEngine);
          state.llmClient.setSystemPrompt(contextBuilder.buildSystemPrompt());
        }

        if (!state.executor) {
          state.executor = new QueryExecutor(state.activeConnection);
        }

        // 1. Thinking
        send(ws, { type: 'thinking', content: '' });

        // 2. Chat with LLM
        const response = await state.llmClient.chat(data.content);

        // 3. Check for SQL
        const sql = state.executor.extractSQL(response.content);

        if (sql) {
          // Send text without SQL block
          const textWithoutSQL = response.content
            .replace(/```sql\s*\n[\s\S]*?```/gi, '')
            .replace(/```\s*\n[\s\S]*?```/g, '')
            .trim();

          if (textWithoutSQL) {
            send(ws, { type: 'text', content: textWithoutSQL });
          }

          // Send SQL
          send(ws, { type: 'sql', content: sql });

          // Execute
          send(ws, { type: 'executing', content: '' });

          const result = await state.executor.execute(sql);

          // Save to history
          state.queryHistory.unshift({
            sql,
            rowCount: result.rowCount,
            duration: result.duration,
            error: result.error,
            timestamp: new Date().toISOString(),
          });
          if (state.queryHistory.length > 50) {
            state.queryHistory.pop();
          }

          if (result.error) {
            send(ws, { type: 'error', content: `Erro SQL: ${result.error}` });
          } else {
            send(ws, {
              type: 'result',
              data: {
                rows: result.rows,
                rowCount: result.rowCount,
                duration: result.duration,
                columns: result.columns || Object.keys(result.rows[0] || {}),
              },
            });

            // Get summary from LLM
            if (result.rows.length > 0) {
              const rowsToSend = result.rows.slice(0, 20);
              const summaryMsg = `Resultado da query (${result.rowCount} linhas, ${result.duration}ms):\n${JSON.stringify(rowsToSend, null, 2)}`;
              try {
                const summary = await state.llmClient.chat(summaryMsg);
                send(ws, { type: 'summary', content: summary.content });
              } catch {
                // Summary errors are non-critical
              }
            }
          }
        } else {
          // No SQL — just text response
          send(ws, { type: 'text', content: response.content });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro desconhecido';
        send(ws, { type: 'error', content: msg });
      }
    });

    ws.on('close', () => {
      console.log('[WS] Chat client disconnected');
    });

    ws.on('error', (error) => {
      console.error('[WS] Error:', error.message);
    });
  });
}
