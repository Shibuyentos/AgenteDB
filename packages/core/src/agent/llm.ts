import * as https from 'https';
import { spawn } from 'child_process';
import type { IncomingHttpHeaders, IncomingMessage } from 'http';
import { OpenAIAuth } from '../auth/oauth.js';
import { getAuth } from '../utils/config.js';

// ─── Interfaces ───

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
}

// ─── Helpers ───

/**
 * Makes an HTTPS request and returns the raw response stream.
 * Does NOT buffer the response — caller handles the stream.
 */
function httpsRequestRaw(
  url: string,
  options: https.RequestOptions,
  body: string
): Promise<{ statusCode: number; stream: IncomingMessage; headers: IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions: https.RequestOptions = {
      ...options,
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      timeout: 120000,
    };

    const req = https.request(reqOptions, (res) => {
      resolve({ statusCode: res.statusCode ?? 0, stream: res, headers: res.headers });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout na chamada ao LLM (120s)'));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Read a small response body (for error responses).
 */
function readBody(stream: IncomingMessage, maxBytes = 8192): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    let bytes = 0;
    stream.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes <= maxBytes) {
        data += chunk.toString();
      }
    });
    stream.on('end', () => resolve(data));
    stream.on('error', () => resolve(data));
  });
}

/**
 * Parse SSE stream incrementally — only accumulates text content.
 * Reasoning tokens and other large payloads are discarded immediately.
 */
function parseSSEStream(
  stream: IncomingMessage,
  onDelta?: (text: string) => void
): Promise<{ content: string; usage: { input: number; output: number; total: number } }> {
  return new Promise((resolve, reject) => {
    let content = '';
    let usage = { input: 0, output: 0, total: 0 };
    let buffer = '';

    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();

      // Process complete SSE lines
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, newlineIdx).trimEnd();
        buffer = buffer.substring(newlineIdx + 1);

        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.substring(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const event = JSON.parse(jsonStr) as Record<string, unknown>;
          const eventType = event.type as string | undefined;

          // Collect text deltas incrementally
          if (eventType === 'response.output_text.delta' && typeof event.delta === 'string') {
            content += event.delta;
            if (onDelta) onDelta(event.delta);
          }

          // On response.completed, extract final text and usage (overrides deltas)
          if (eventType === 'response.completed' || eventType === 'response.done') {
            const response = event.response as Record<string, unknown> | undefined;
            if (response) {
              // Extract final text
              const output = response.output as Array<Record<string, unknown>> | undefined;
              if (output) {
                for (const item of output) {
                  if (item.type === 'message' && item.role === 'assistant') {
                    const contentArr = item.content as Array<Record<string, unknown>> | undefined;
                    if (contentArr) {
                      for (const part of contentArr) {
                        if (part.type === 'output_text' && typeof part.text === 'string') {
                          content = part.text; // final authoritative text
                        }
                      }
                    }
                  }
                }
              }
              // Extract usage
              const usageData = response.usage as Record<string, number> | undefined;
              if (usageData) {
                usage = {
                  input: usageData.input_tokens ?? 0,
                  output: usageData.output_tokens ?? 0,
                  total: usageData.total_tokens ?? (usageData.input_tokens ?? 0) + (usageData.output_tokens ?? 0),
                };
              }
            }
          }

          // All other event types (reasoning, etc.) are discarded — not accumulated
        } catch {
          // Ignore malformed SSE lines
        }
      }
    });

    stream.on('end', () => {
      resolve({ content, usage });
    });

    stream.on('error', (err) => {
      reject(err);
    });
  });
}

// ─── Constantes ChatGPT Backend ───

const CHATGPT_BASE_URL = 'https://chatgpt.com/backend-api';
const CODEX_RESPONSES_PATH = '/codex/responses';

// ─── Classe ───

const MAX_HISTORY_MESSAGES = 20;
const DEFAULT_MODEL = 'gpt-5-codex';

function normalizeModelName(model: string): string {
  if (model === 'gpt-5.3-codex') {
    return DEFAULT_MODEL;
  }
  return model;
}

// ─── Responses API Helpers ───

interface ResponsesInputItem {
  type: 'message';
  role: 'user' | 'assistant' | 'developer';
  content: { type: string; text: string }[];
}

function convertToResponsesInput(messages: LLMMessage[]): ResponsesInputItem[] {
  const input: ResponsesInputItem[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    input.push({
      type: 'message',
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: [{
        type: msg.role === 'assistant' ? 'output_text' : 'input_text',
        text: msg.content,
      }],
    });
  }
  return input;
}

export class LLMClient {
  private auth: OpenAIAuth;
  private conversationHistory: LLMMessage[] = [];
  private systemPrompt: string = '';

  constructor(auth: OpenAIAuth) {
    this.auth = auth;
  }

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  async chat(userMessage: string, onDelta?: (text: string) => void): Promise<LLMResponse> {
    this.conversationHistory.push({ role: 'user', content: userMessage });
    this.trimHistory();
    return this.doChat(false, onDelta);
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  getHistory(): LLMMessage[] {
    return [...this.conversationHistory];
  }

  addToHistory(message: LLMMessage): void {
    this.conversationHistory.push(message);
    this.trimHistory();
  }

  private async runLocalCodex(messages: LLMMessage[]): Promise<LLMResponse> {
    const cmd = process.env.CODEX_CLI_CMD || 'codex';

    const prompt = messages.map(m => {
      const roleMap: Record<string, string> = { system: 'System', user: 'User', assistant: 'Assistant' };
      return `${roleMap[m.role] || m.role}: ${m.content}`;
    }).join('\n\n') + '\n\nAssistant:';

    return new Promise((resolve, reject) => {
      const args = ['--no-alt-screen', '--dangerously-bypass-approvals-and-sandbox'];

      const child = spawn(cmd, args, {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', d => { stdout += d.toString(); });
      child.stderr.on('data', d => { stderr += d.toString(); });

      child.on('error', err => reject(new Error(`Falha ao iniciar Codex CLI (${cmd}): ${err.message}`)));

      child.on('close', code => {
        if (code !== 0) {
          if (stdout.trim().length > 0) {
            // Try to use output even with error
          } else {
            reject(new Error(`Codex CLI falhou (exit code ${code}): ${stderr || 'Erro desconhecido'}`));
            return;
          }
        }

        let cleanOutput = stdout
          .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
          .replace(/^.*Codex CLI.*$/gm, '')
          .replace(/^.*Working.*$/gm, '')
          .replace(/^.*To continue this session.*$/gm, '')
          .replace(/Token usage:.*$/ms, '')
          .replace(/^\s*[\r\n]/gm, '')
          .trim();

        if (!cleanOutput && stderr) {
          cleanOutput = stderr.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
        }

        resolve({
          content: cleanOutput || 'Sem resposta do Codex CLI.',
          tokensUsed: { prompt: 0, completion: 0, total: 0 }
        });
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }

  private async doChat(isRetry: boolean, onDelta?: (text: string) => void): Promise<LLMResponse> {
    // If local execution is enabled, bypass the API logic
    if (process.env.USE_LOCAL_CODEX === 'true') {
      const messages: LLMMessage[] = [];
      if (this.systemPrompt) {
        messages.push({ role: 'system', content: this.systemPrompt });
      }
      messages.push(...this.conversationHistory);
      return this.runLocalCodex(messages);
    }

    const accessToken = await this.auth.getAccessToken();
    const chatgptAccountId = this.auth.getChatGPTAccountId();

    const input = convertToResponsesInput(this.conversationHistory);

    const model = normalizeModelName(
      process.env.OPENAI_MODEL || getAuth()?.model || DEFAULT_MODEL
    );

    const requestBody = JSON.stringify({
      model,
      store: false,
      stream: true,
      instructions: this.systemPrompt || undefined,
      input,
      reasoning: { effort: 'medium', summary: 'auto' },
    });

    const url = `${CHATGPT_BASE_URL}${CODEX_RESPONSES_PATH}`;

    const response = await httpsRequestRaw(
      url,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody).toString(),
          'accept': 'text/event-stream',
          'chatgpt-account-id': chatgptAccountId,
          'OpenAI-Beta': 'responses=experimental',
          'originator': 'codex_cli_rs',
        },
      },
      requestBody
    );

    // Error handling — read body only for errors (small payloads)
    if (response.statusCode === 401) {
      response.stream.resume(); // drain
      if (!isRetry) {
        await this.auth.refreshIfNeeded();
        return this.doChat(true, onDelta);
      }
      throw new Error('Token inválido ou expirado. Faça login novamente.');
    }

    if (response.statusCode === 429) {
      response.stream.resume();
      throw new Error('Limite de uso atingido. Aguarde um momento e tente novamente.');
    }

    if (response.statusCode && response.statusCode >= 500) {
      response.stream.resume();
      throw new Error('Serviço indisponível. Tente novamente em alguns instantes.');
    }

    if (response.statusCode !== 200) {
      const errorBody = await readBody(response.stream);
      let errorMsg = `Erro na API ChatGPT (HTTP ${response.statusCode})`;
      try {
        const errorData = JSON.parse(errorBody) as {
          error?: { message?: string };
          detail?: string;
        };
        if (errorData.error?.message) {
          errorMsg += `: ${errorData.error.message}`;
        } else if (errorData.detail) {
          errorMsg += `: ${errorData.detail}`;
        }
      } catch {
        if (errorBody.length < 500) {
          errorMsg += `: ${errorBody}`;
        }
      }
      throw new Error(errorMsg);
    }

    // Stream SSE — parse incrementally, only accumulate text
    const { content, usage } = await parseSSEStream(response.stream, onDelta);

    if (!content) {
      throw new Error('Resposta vazia do ChatGPT. Tente novamente.');
    }

    const tokensUsed = {
      prompt: usage.input,
      completion: usage.output,
      total: usage.total,
    };

    this.conversationHistory.push({ role: 'assistant', content });

    return { content, tokensUsed };
  }

  private trimHistory(): void {
    if (this.conversationHistory.length > MAX_HISTORY_MESSAGES) {
      const excess = this.conversationHistory.length - MAX_HISTORY_MESSAGES;
      this.conversationHistory.splice(0, excess);
    }
  }
}
