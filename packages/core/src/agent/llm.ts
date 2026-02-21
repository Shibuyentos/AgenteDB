import * as https from 'https';
import { spawn } from 'child_process';
import type { IncomingHttpHeaders } from 'http';
import type { IAuthProvider } from '../auth/oauth.js';
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

// ─── Constantes Anthropic ───

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

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
    } catch {
      // Ignora linhas SSE que não são JSON válido
    }
  }

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

// ─── Anthropic SSE Parser ───

function extractTextFromAnthropicSSE(sseData: string): { content: string; usage: { input: number; output: number; total: number } } {
  let content = '';
  let usage = { input: 0, output: 0, total: 0 };

  for (const line of sseData.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const jsonStr = line.substring(6).trim();
    if (!jsonStr || jsonStr === '[DONE]') continue;

    try {
      const event = JSON.parse(jsonStr) as Record<string, unknown>;
      const eventType = event.type as string | undefined;

      // content_block_delta - streaming text
      if (eventType === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown> | undefined;
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          content += delta.text;
        }
      }

      // message_delta - usage info
      if (eventType === 'message_delta') {
        const msgUsage = event.usage as Record<string, number> | undefined;
        if (msgUsage) {
          usage.output = msgUsage.output_tokens ?? 0;
        }
      }

      // message_start - input usage
      if (eventType === 'message_start') {
        const message = event.message as Record<string, unknown> | undefined;
        const msgUsage = message?.usage as Record<string, number> | undefined;
        if (msgUsage) {
          usage.input = msgUsage.input_tokens ?? 0;
        }
      }
    } catch {
      // ignore
    }
  }

  // If no streaming content found, try non-streaming response format
  if (!content) {
    try {
      const parsed = JSON.parse(sseData) as Record<string, unknown>;
      const contentArr = parsed.content as Array<Record<string, unknown>> | undefined;
      if (contentArr) {
        for (const block of contentArr) {
          if (block.type === 'text' && typeof block.text === 'string') {
            content += block.text;
          }
        }
      }
      const msgUsage = parsed.usage as Record<string, number> | undefined;
      if (msgUsage) {
        usage.input = msgUsage.input_tokens ?? 0;
        usage.output = msgUsage.output_tokens ?? 0;
      }
    } catch {
      // not a plain JSON response
    }
  }

  usage.total = usage.input + usage.output;
  return { content, usage };
}

export class LLMClient {
  private auth: IAuthProvider;
  private conversationHistory: LLMMessage[] = [];
  private systemPrompt: string = '';
  private modelOverride: string | null = null;

  constructor(auth: IAuthProvider) {
    this.auth = auth;
  }

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  setModel(model: string): void {
    this.modelOverride = model;
  }

  getModel(): string {
    const provider = this.auth.getProvider();
    if (this.modelOverride) return this.modelOverride;
    if (provider === 'anthropic') {
      return process.env.ANTHROPIC_MODEL || getAuth()?.model || DEFAULT_ANTHROPIC_MODEL;
    }
    return normalizeModelName(process.env.OPENAI_MODEL || getAuth()?.model || DEFAULT_MODEL);
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
          if (stdout.trim().length === 0) {
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

  private async doChat(isRetry: boolean): Promise<LLMResponse> {
    if (process.env.USE_LOCAL_CODEX === 'true') {
      const messages: LLMMessage[] = [];
      if (this.systemPrompt) {
        messages.push({ role: 'system', content: this.systemPrompt });
      }
      messages.push(...this.conversationHistory);
      return this.runLocalCodex(messages);
    }

    const provider = this.auth.getProvider();
    if (provider === 'anthropic') {
      return this.doChatAnthropic(isRetry);
    }
    return this.doChatOpenAI(isRetry);
  }

  private async doChatAnthropic(isRetry: boolean): Promise<LLMResponse> {
    const accessToken = await this.auth.getAccessToken();

    // Convert messages to Anthropic format
    const messages = this.conversationHistory.map(m => ({
      role: m.role === 'system' ? 'user' as const : m.role,
      content: m.content,
    }));

    const model = this.modelOverride || process.env.ANTHROPIC_MODEL || getAuth()?.model || DEFAULT_ANTHROPIC_MODEL;

    const requestBody = JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      system: this.systemPrompt || undefined,
      messages,
    });

    const response = await httpsRequest(
      ANTHROPIC_API_URL,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody).toString(),
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'oauth-2025-04-20',
        },
      },
      requestBody
    );

    if (response.statusCode === 401) {
      if (!isRetry) {
        await this.auth.getAccessToken();
        return this.doChatAnthropic(true);
      }
      throw new Error('Token Anthropic inválido ou expirado. Faça login novamente.');
    }

    if (response.statusCode === 429) {
      throw new Error('Limite de uso Anthropic atingido. Aguarde um momento.');
    }

    if (response.statusCode && response.statusCode >= 500) {
      throw new Error('Serviço Anthropic indisponível. Tente novamente.');
    }

    if (response.statusCode !== 200) {
      let errorMsg = `Erro na API Anthropic (HTTP ${response.statusCode})`;
      try {
        const errorData = JSON.parse(response.data) as { error?: { message?: string } };
        if (errorData.error?.message) {
          errorMsg += `: ${errorData.error.message}`;
        }
      } catch {
        if (response.data.length < 500) {
          errorMsg += `: ${response.data}`;
        }
      }
      throw new Error(errorMsg);
    }

    const { content, usage } = extractTextFromAnthropicSSE(response.data);

    if (!content) {
      throw new Error('Resposta vazia do Anthropic. Tente novamente.');
    }

    this.conversationHistory.push({ role: 'assistant', content });

    return {
      content,
      tokensUsed: {
        prompt: usage.input,
        completion: usage.output,
        total: usage.total,
      },
    };
  }

  private async doChatOpenAI(isRetry: boolean): Promise<LLMResponse> {
    const accessToken = await this.auth.getAccessToken();

    // OpenAI-specific: get chatgpt account ID
    const chatgptAccountId = (this.auth as any).getChatGPTAccountId?.() || '';

    const input = convertToResponsesInput(this.conversationHistory);

    const model = this.modelOverride
      ? normalizeModelName(this.modelOverride)
      : normalizeModelName(process.env.OPENAI_MODEL || getAuth()?.model || DEFAULT_MODEL);

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

    if (response.statusCode === 401) {
      if (!isRetry) {
        await this.auth.getAccessToken();
        return this.doChatOpenAI(true);
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
        if (response.data.length < 500) {
          errorMsg += `: ${response.data}`;
        }
      }
      throw new Error(errorMsg);
    }

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
