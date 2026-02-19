import * as https from 'https';
import { spawn } from 'child_process';
import type { IncomingHttpHeaders } from 'http';
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

function httpsRequest(
  url: string,
  options: https.RequestOptions,
  body: string
): Promise<{ statusCode: number; data: string; headers: IncomingHttpHeaders }> {
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
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode ?? 0, data, headers: res.headers });
      });
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
    if (msg.role === 'system') continue; // system vai em "instructions"
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

function extractTextFromSSE(sseData: string): { content: string; usage: { input: number; output: number; total: number } } {
  let content = '';
  let usage = { input: 0, output: 0, total: 0 };

  for (const line of sseData.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const jsonStr = line.substring(6).trim();
    if (!jsonStr || jsonStr === '[DONE]') continue;

    try {
      const event = JSON.parse(jsonStr) as Record<string, unknown>;
      const eventType = event.type as string | undefined;

      // Coleta texto completo do evento response.completed
      if (eventType === 'response.completed' || eventType === 'response.done') {
        const response = event.response as Record<string, unknown> | undefined;
        if (response) {
          const output = response.output as Array<Record<string, unknown>> | undefined;
          if (output) {
            for (const item of output) {
              if (item.type === 'message' && item.role === 'assistant') {
                const contentArr = item.content as Array<Record<string, unknown>> | undefined;
                if (contentArr) {
                  for (const part of contentArr) {
                    if (part.type === 'output_text' && typeof part.text === 'string') {
                      content = part.text;
                    }
                  }
                }
              }
            }
          }
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

      // Fallback: coleta deltas incrementais caso response.completed não tenha o texto
      if (eventType === 'response.output_text.delta' && !content) {
        // Não usamos deltas se já temos o texto completo
      }
    } catch {
      // Ignora linhas SSE que não são JSON válido
    }
  }

  // Fallback: se response.completed não tinha texto, concatena os deltas
  if (!content) {
    for (const line of sseData.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.substring(6).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;
      try {
        const event = JSON.parse(jsonStr) as Record<string, unknown>;
        if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
          content += event.delta;
        }
      } catch {
        // ignore
      }
    }
  }

  return { content, usage };
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

  async chat(userMessage: string): Promise<LLMResponse> {
    this.conversationHistory.push({ role: 'user', content: userMessage });
    this.trimHistory();
    return this.doChat(false);
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
    
    // Converte o histórico de mensagens em um prompt único
    const prompt = messages.map(m => {
      const roleMap: Record<string, string> = { system: 'System', user: 'User', assistant: 'Assistant' };
      return `${roleMap[m.role] || m.role}: ${m.content}`;
    }).join('\n\n') + '\n\nAssistant:';

    return new Promise((resolve, reject) => {
      // Executa o CLI com flags para evitar interatividade e limpar a saída
      // --no-alt-screen: evita sequências de terminal complexas
      // --dangerously-bypass-approvals-and-sandbox: permite execução direta sem prompts (seguro pois o usuário autorizou)
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
          // O Codex as vezes retorna erro 1 mas imprime a resposta, vamos tentar salvar
          if (stdout.trim().length > 0) {
             // Tenta limpar mesmo com erro
          } else {
             reject(new Error(`Codex CLI falhou (exit code ${code}): ${stderr || 'Erro desconhecido'}`));
             return;
          }
        }
        
        // Limpeza da saída
        let cleanOutput = stdout
          // Remove sequências ANSI de cores/controle
          .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
          // Remove linhas de log conhecidas do Codex CLI
          .replace(/^.*Codex CLI.*$/gm, '')
          .replace(/^.*Working.*$/gm, '')
          .replace(/^.*To continue this session.*$/gm, '')
          // Remove Token usage info
          .replace(/Token usage:.*$/ms, '')
          // Remove linhas vazias excessivas
          .replace(/^\s*[\r\n]/gm, '')
          .trim();

        // Se a saída estiver vazia, tenta pegar do stderr (alguns CLIs mandam pra lá)
        if (!cleanOutput && stderr) {
            cleanOutput = stderr.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
        }

        resolve({
          content: cleanOutput || 'Sem resposta do Codex CLI.',
          tokensUsed: { prompt: 0, completion: 0, total: 0 }
        });
      });

      // Escreve o prompt no stdin
      child.stdin.write(prompt);
      child.stdin.end();
    });
  }

  private async doChat(isRetry: boolean): Promise<LLMResponse> {
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

    // Converte mensagens para o formato Responses API
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
      include: ['reasoning.encrypted_content'],
    });

    const url = `${CHATGPT_BASE_URL}${CODEX_RESPONSES_PATH}`;

    const response = await httpsRequest(
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

    // Tratamento de erros HTTP
    if (response.statusCode === 401) {
      if (!isRetry) {
        await this.auth.refreshIfNeeded();
        return this.doChat(true);
      }
      throw new Error('Token inválido ou expirado. Faça login novamente.');
    }

    if (response.statusCode === 429) {
      throw new Error('Limite de uso atingido. Aguarde um momento e tente novamente.');
    }

    if (response.statusCode && response.statusCode >= 500) {
      throw new Error('Serviço indisponível. Tente novamente em alguns instantes.');
    }

    if (response.statusCode !== 200) {
      let errorMsg = `Erro na API ChatGPT (HTTP ${response.statusCode})`;
      try {
        const errorData = JSON.parse(response.data) as {
          error?: { message?: string };
          detail?: string;
        };
        if (errorData.error?.message) {
          errorMsg += `: ${errorData.error.message}`;
        } else if (errorData.detail) {
          errorMsg += `: ${errorData.detail}`;
        }
      } catch {
        // A resposta pode ser SSE parcial, tenta extrair mensagem de erro
        if (response.data.length < 500) {
          errorMsg += `: ${response.data}`;
        }
      }
      throw new Error(errorMsg);
    }

    // Parseia a resposta SSE
    const { content, usage } = extractTextFromSSE(response.data);

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
