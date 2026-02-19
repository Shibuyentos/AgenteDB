import * as crypto from 'crypto';
import * as http from 'http';
import * as https from 'https';
import * as readline from 'readline';
import { log } from '../utils/logger.js';
import { getAuth, saveAuth } from '../utils/config.js';

// ─── Interfaces ───

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO date string
  accountId: string;
  chatgptAccountId: string;
}

// ─── Helpers ───

function base64url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function sha256(input: string): Buffer {
  return crypto.createHash('sha256').update(input).digest();
}

function decodeJWTPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Token JWT inválido');
  }
  const payload = parts[1];
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
  const decoded = Buffer.from(padded, 'base64').toString('utf-8');
  return JSON.parse(decoded);
}

function extractIdsFromJWT(accessToken: string): { accountId: string; chatgptAccountId: string } {
  let accountId = 'unknown';
  let chatgptAccountId = '';
  try {
    const payload = decodeJWTPayload(accessToken);
    accountId = (payload.sub as string) || (payload.account_id as string) || 'unknown';
    // ChatGPT account ID vive no claim "https://api.openai.com/auth"
    const authClaim = payload['https://api.openai.com/auth'] as Record<string, unknown> | undefined;
    if (authClaim?.chatgpt_account_id) {
      chatgptAccountId = authClaim.chatgpt_account_id as string;
    }
  } catch {
    // Se não conseguir decodar o JWT, segue com defaults
  }
  return { accountId, chatgptAccountId };
}

function httpsPost(
  url: string,
  body: string,
  headers: Record<string, string>
): Promise<{ statusCode: number; data: string }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body).toString(),
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode ?? 0, data });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout na requisição'));
    });

    req.write(body);
    req.end();
  });
}

// ─── Classe ───

/**
 * Autenticação OAuth PKCE com OpenAI.
 */
export class OpenAIAuth {
  private static CLIENT_ID = process.env.OPENAI_CLIENT_ID || 'app_EMoamEEZ73f0CkXaXp7hrann';
  private static AUTH_URL = 'https://auth.openai.com/oauth/authorize';
  private static TOKEN_URL = 'https://auth.openai.com/oauth/token';
  private static CALLBACK_PORT = 1455;
  private static CALLBACK_URL = `http://localhost:${OpenAIAuth.CALLBACK_PORT}/auth/callback`;
  private static SCOPES = 'openid profile email offline_access';

  private tokenData: TokenData | null = null;

  /**
   * Fluxo completo de login OAuth PKCE.
   */
  async login(): Promise<TokenData> {
    const codeVerifier = base64url(crypto.randomBytes(64));
    const codeChallenge = base64url(sha256(codeVerifier));
    const state = base64url(crypto.randomBytes(32));

    const authParams = new URLSearchParams({
      client_id: OpenAIAuth.CLIENT_ID,
      redirect_uri: OpenAIAuth.CALLBACK_URL,
      response_type: 'code',
      scope: OpenAIAuth.SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `${OpenAIAuth.AUTH_URL}?${authParams.toString()}`;

    let code: string;
    try {
      code = await this.captureCallback(authUrl, state);
    } catch {
      code = await this.manualCapture(authUrl, state);
    }

    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: OpenAIAuth.CLIENT_ID,
      code,
      redirect_uri: OpenAIAuth.CALLBACK_URL,
      code_verifier: codeVerifier,
    }).toString();

    const tokenResponse = await httpsPost(
      OpenAIAuth.TOKEN_URL,
      tokenBody,
      { 'Content-Type': 'application/x-www-form-urlencoded' }
    );

    if (tokenResponse.statusCode !== 200) {
      throw new Error(
        `Falha ao obter tokens (HTTP ${tokenResponse.statusCode}): ${tokenResponse.data}`
      );
    }

    const tokenResult = JSON.parse(tokenResponse.data) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const { accountId, chatgptAccountId } = extractIdsFromJWT(tokenResult.access_token);

    const expiresAt = new Date(
      Date.now() + tokenResult.expires_in * 1000
    ).toISOString();

    this.tokenData = {
      accessToken: tokenResult.access_token,
      refreshToken: tokenResult.refresh_token,
      expiresAt,
      accountId,
      chatgptAccountId,
    };

    this.saveToConfig();
    log.success('Autenticação concluída com sucesso!');

    return this.tokenData;
  }

  /**
   * Inicia o fluxo de auth para uso em servidor (headless).
   * Retorna a URL para o frontend e uma Promise que resolve quando o usuário completa o login.
   */
  async startHeadlessAuth(): Promise<{ authUrl: string; waitForCompletion: () => Promise<TokenData> }> {
    const codeVerifier = base64url(crypto.randomBytes(64));
    const codeChallenge = base64url(sha256(codeVerifier));
    const state = base64url(crypto.randomBytes(32));
    
    // Sempre usa a porta fixa 1455 e localhost para compatibilidade com o Client ID público
    const callbackUrl = OpenAIAuth.CALLBACK_URL;

    const authParams = new URLSearchParams({
      client_id: OpenAIAuth.CLIENT_ID,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: OpenAIAuth.SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `${OpenAIAuth.AUTH_URL}?${authParams.toString()}`;

    // Prepara a promise que vai esperar o callback
    const waitForCompletion = async () => {
      // Sobe servidor na 1455 esperando o redirect
      const code = await this.captureCallbackAuth(state);
      // Troca code por token
      return this.exchangeCode(code, codeVerifier, callbackUrl);
    };

    return { authUrl, waitForCompletion };
  }

  // Versão modificada do captureCallback que não abre browser e é mais genérica
  private captureCallbackAuth(expectedState: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Verifica se a porta já está em uso ou servidor antigo rodando
      // Simplificação: Assume que podemos subir na 1455. 
      // Em produção real precisaria de gestão melhor de porta.
      
      const server = http.createServer((req, res) => {
        const reqUrl = new URL(req.url ?? '/', `http://localhost:${OpenAIAuth.CALLBACK_PORT}`);

        if (reqUrl.pathname === '/auth/callback') {
          const code = reqUrl.searchParams.get('code');
          const state = reqUrl.searchParams.get('state');
          const error = reqUrl.searchParams.get('error');

          // Responder com HTML bonito e fechar
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html><html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:system-ui;background:#09090B;color:#fff;">
            <div style="text-align:center;"><h1 style="font-size:3em;">✅</h1><h2>Conectado!</h2><p style="color:#A1A1AA;">Volte para o AgentDB.</p>
            <script>setTimeout(() => window.close(), 2000);</script>
            </div></body></html>
          `);

          server.close();

          if (error) {
            reject(new Error(`Erro OAuth: ${error}`));
          } else if (state !== expectedState) {
            reject(new Error('State inválido!'));
          } else if (!code) {
            reject(new Error('Code não recebido'));
          } else {
            resolve(code);
          }
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      // Timeout de 5 minutos para o usuário fazer login
      const timeout = setTimeout(() => {
        server.close();
        reject(new Error('Timeout aguardando login (5min)'));
      }, 300000);

      server.on('error', (err) => {
        clearTimeout(timeout);
        // Se porta estiver em uso, tenta falhar graciosamente ou reutilizar?
        // Por enquanto falha.
        reject(new Error(`Erro ao subir servidor de auth na porta ${OpenAIAuth.CALLBACK_PORT}: ${err.message}`));
      });

      server.listen(OpenAIAuth.CALLBACK_PORT, 'localhost');
    });
  }

  /**
   * Gera a URL de autorização OAuth (para uso pelo server).
   */
  getAuthUrl(redirectUri?: string): { authUrl: string; codeVerifier: string; state: string; redirectUri: string } {
    const codeVerifier = base64url(crypto.randomBytes(64));
    const codeChallenge = base64url(sha256(codeVerifier));
    const state = base64url(crypto.randomBytes(32));
    const callbackUrl = redirectUri ?? OpenAIAuth.CALLBACK_URL;

    const authParams = new URLSearchParams({
      client_id: OpenAIAuth.CLIENT_ID,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: OpenAIAuth.SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return {
      authUrl: `${OpenAIAuth.AUTH_URL}?${authParams.toString()}`,
      codeVerifier,
      state,
      redirectUri: callbackUrl,
    };
  }

  /**
   * Troca o code por tokens (para uso pelo server).
   */
  async exchangeCode(code: string, codeVerifier: string, redirectUri?: string): Promise<TokenData> {
    const callbackUrl = redirectUri ?? OpenAIAuth.CALLBACK_URL;
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: OpenAIAuth.CLIENT_ID,
      code,
      redirect_uri: callbackUrl,
      code_verifier: codeVerifier,
    }).toString();

    const tokenResponse = await httpsPost(
      OpenAIAuth.TOKEN_URL,
      tokenBody,
      { 'Content-Type': 'application/x-www-form-urlencoded' }
    );

    if (tokenResponse.statusCode !== 200) {
      throw new Error(
        `Falha ao obter tokens (HTTP ${tokenResponse.statusCode}): ${tokenResponse.data}`
      );
    }

    const tokenResult = JSON.parse(tokenResponse.data) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const { accountId, chatgptAccountId } = extractIdsFromJWT(tokenResult.access_token);

    const expiresAt = new Date(
      Date.now() + tokenResult.expires_in * 1000
    ).toISOString();

    this.tokenData = {
      accessToken: tokenResult.access_token,
      refreshToken: tokenResult.refresh_token,
      expiresAt,
      accountId,
      chatgptAccountId,
    };

    this.saveToConfig();
    return this.tokenData;
  }

  /**
   * Faz refresh do token se necessário.
   */
  async refreshIfNeeded(): Promise<string> {
    if (!this.tokenData) {
      throw new Error('Não autenticado. Execute login() primeiro.');
    }

    const expiresAt = new Date(this.tokenData.expiresAt).getTime();
    const marginMs = 5 * 60 * 1000;

    if (Date.now() < expiresAt - marginMs) {
      return this.tokenData.accessToken;
    }

    const refreshBody = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: OpenAIAuth.CLIENT_ID,
      refresh_token: this.tokenData.refreshToken,
    }).toString();

    const response = await httpsPost(
      OpenAIAuth.TOKEN_URL,
      refreshBody,
      { 'Content-Type': 'application/x-www-form-urlencoded' }
    );

    if (response.statusCode !== 200) {
      throw new Error(
        `Falha ao renovar token (HTTP ${response.statusCode}). Faça login novamente.`
      );
    }

    const result = JSON.parse(response.data) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    this.tokenData.accessToken = result.access_token;
    this.tokenData.refreshToken = result.refresh_token;
    this.tokenData.expiresAt = new Date(
      Date.now() + result.expires_in * 1000
    ).toISOString();

    this.saveToConfig();

    return this.tokenData.accessToken;
  }

  async getAccessToken(): Promise<string> {
    return this.refreshIfNeeded();
  }

  isAuthenticated(): boolean {
    return this.tokenData !== null;
  }

  getAccountId(): string | null {
    return this.tokenData?.accountId ?? null;
  }

  loadFromConfig(): boolean {
    const auth = getAuth();
    if (!auth || auth.provider !== 'openai' || !auth.accessToken) {
      return false;
    }

    // Se chatgptAccountId não estiver salvo, extrai do JWT existente
    let chatgptAccountId = auth.chatgptAccountId ?? '';
    if (!chatgptAccountId && auth.accessToken) {
      const ids = extractIdsFromJWT(auth.accessToken);
      chatgptAccountId = ids.chatgptAccountId;
      // Salva para não precisar extrair novamente
      if (chatgptAccountId) {
        saveAuth({ ...auth, chatgptAccountId });
      }
    }

    this.tokenData = {
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken ?? '',
      expiresAt: auth.tokenExpires ?? new Date(0).toISOString(),
      accountId: auth.accountId ?? 'unknown',
      chatgptAccountId,
    };

    return true;
  }

  clearTokens(): void {
    this.tokenData = null;
    saveAuth({
      provider: 'openai',
      accessToken: undefined,
      refreshToken: undefined,
      tokenExpires: undefined,
      accountId: undefined,
    });
  }

  getChatGPTAccountId(): string {
    return this.tokenData?.chatgptAccountId ?? '';
  }

  private saveToConfig(): void {
    if (!this.tokenData) return;

    saveAuth({
      provider: 'openai',
      accessToken: this.tokenData.accessToken,
      refreshToken: this.tokenData.refreshToken,
      tokenExpires: this.tokenData.expiresAt,
      accountId: this.tokenData.accountId,
      chatgptAccountId: this.tokenData.chatgptAccountId,
    });
  }

  private captureCallback(authUrl: string, expectedState: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const reqUrl = new URL(req.url ?? '/', `http://127.0.0.1:${OpenAIAuth.CALLBACK_PORT}`);

        if (reqUrl.pathname === '/auth/callback') {
          const code = reqUrl.searchParams.get('code');
          const state = reqUrl.searchParams.get('state');
          const error = reqUrl.searchParams.get('error');

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
            <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:system-ui;background:#09090B;color:#fff;">
              <div style="text-align:center;">
                <h1 style="font-size:3em;">✅</h1>
                <h2>Autenticação concluída!</h2>
                <p style="color:#aaa;">Pode fechar esta aba e voltar ao AgentDB.</p>
              </div>
            </body>
            </html>
          `);

          server.close();
          clearTimeout(timeout);

          if (error) {
            reject(new Error(`Erro OAuth: ${error}`));
            return;
          }

          if (state !== expectedState) {
            reject(new Error('State OAuth inválido. Possível ataque CSRF.'));
            return;
          }

          if (!code) {
            reject(new Error('Code OAuth não recebido.'));
            return;
          }

          resolve(code);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      const timeout = setTimeout(() => {
        server.close();
        reject(new Error('Timeout aguardando autenticação (120s).'));
      }, 120000);

      server.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      server.listen(OpenAIAuth.CALLBACK_PORT, 'localhost', async () => {
        log.info('Abrindo browser para login...');
        log.dim(`Se não abrir automaticamente, acesse:`);
        log.dim(authUrl);

        try {
          const openModule = await import('open');
          const openFn = openModule.default || openModule;
          await openFn(authUrl);
        } catch {
          log.warn('Não foi possível abrir o browser automaticamente.');
        }
      });
    });
  }

  private manualCapture(authUrl: string, expectedState: string): Promise<string> {
    return new Promise((resolve, reject) => {
      log.warn('Não foi possível abrir a porta 1455.');
      log.info('Acesse a URL abaixo no seu browser:');
      console.log();
      console.log(`  ${authUrl}`);
      console.log();
      log.info('Após fazer login, copie a URL de redirecionamento e cole aqui:');

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question('  URL: ', (answer) => {
        rl.close();

        try {
          const callbackUrl = new URL(answer.trim());
          const code = callbackUrl.searchParams.get('code');
          const state = callbackUrl.searchParams.get('state');

          if (state !== expectedState) {
            reject(new Error('State OAuth inválido.'));
            return;
          }

          if (!code) {
            reject(new Error('Code não encontrado na URL.'));
            return;
          }

          resolve(code);
        } catch {
          reject(new Error('URL inválida. Tente fazer login novamente.'));
        }
      });
    });
  }
}
