import * as crypto from 'crypto';
import * as https from 'https';
import { log } from '../utils/logger.js';
import { getAuth, saveAuth } from '../utils/config.js';

// ─── Interfaces ───

export interface AnthropicTokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  accountId: string;
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

function httpsPostJSON(
  url: string,
  body: Record<string, string>
): Promise<{ statusCode: number; data: string }> {
  return new Promise((resolve, reject) => {
    const jsonBody = JSON.stringify(body);
    const urlObj = new URL(url);
    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(jsonBody).toString(),
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

    req.write(jsonBody);
    req.end();
  });
}

// ─── Classe ───

export class AnthropicAuth {
  static CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
  static AUTH_URL = 'https://claude.ai/oauth/authorize';
  static TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
  static REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
  static SCOPES = 'org:create_api_key user:profile user:inference';

  private tokenData: AnthropicTokenData | null = null;

  /**
   * Generate the OAuth authorization URL with PKCE.
   */
  getAuthUrl(): { authUrl: string; codeVerifier: string; state: string } {
    const codeVerifier = base64url(crypto.randomBytes(32));
    const codeChallenge = base64url(sha256(codeVerifier));
    const state = base64url(crypto.randomBytes(32));

    const authParams = new URLSearchParams({
      client_id: AnthropicAuth.CLIENT_ID,
      redirect_uri: AnthropicAuth.REDIRECT_URI,
      response_type: 'code',
      scope: AnthropicAuth.SCOPES,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });

    return {
      authUrl: `${AnthropicAuth.AUTH_URL}?${authParams.toString()}`,
      codeVerifier,
      state,
    };
  }

  /**
   * Exchange an authorization code for tokens.
   * The callback page returns the code in "code#state" format.
   */
  async exchangeCode(rawCode: string, codeVerifier: string, state: string): Promise<AnthropicTokenData> {
    // The callback page returns code#state format
    const code = rawCode.includes('#') ? rawCode.split('#')[0] : rawCode;

    log.info(`Trocando código por tokens Anthropic...`);

    const tokenResponse = await httpsPostJSON(AnthropicAuth.TOKEN_URL, {
      grant_type: 'authorization_code',
      code,
      state,
      client_id: AnthropicAuth.CLIENT_ID,
      redirect_uri: AnthropicAuth.REDIRECT_URI,
      code_verifier: codeVerifier,
    });

    if (tokenResponse.statusCode !== 200) {
      throw new Error(
        `Falha ao obter tokens Anthropic (HTTP ${tokenResponse.statusCode}): ${tokenResponse.data}`
      );
    }

    const result = JSON.parse(tokenResponse.data) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
      account?: { uuid?: string; email?: string };
    };

    const expiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString();
    const accountId = result.account?.email || result.account?.uuid || 'anthropic-user';

    this.tokenData = {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt,
      accountId,
    };

    this.saveToConfig();
    log.success('Autenticação Anthropic concluída!');
    return this.tokenData;
  }

  /**
   * Refresh the access token if it's about to expire.
   */
  async refreshIfNeeded(): Promise<string> {
    if (!this.tokenData) {
      throw new Error('Não autenticado com Anthropic.');
    }

    const expiresAt = new Date(this.tokenData.expiresAt).getTime();
    const marginMs = 5 * 60 * 1000;

    if (Date.now() < expiresAt - marginMs) {
      return this.tokenData.accessToken;
    }

    log.info('Renovando token Anthropic...');

    const response = await httpsPostJSON(AnthropicAuth.TOKEN_URL, {
      grant_type: 'refresh_token',
      refresh_token: this.tokenData.refreshToken,
      client_id: AnthropicAuth.CLIENT_ID,
    });

    if (response.statusCode !== 200) {
      throw new Error(
        `Falha ao renovar token Anthropic (HTTP ${response.statusCode}). Faça login novamente.`
      );
    }

    const result = JSON.parse(response.data) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    this.tokenData.accessToken = result.access_token;
    this.tokenData.refreshToken = result.refresh_token;
    this.tokenData.expiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString();

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

  getProvider(): 'anthropic' {
    return 'anthropic';
  }

  loadFromConfig(): boolean {
    const auth = getAuth();
    if (!auth || auth.provider !== 'anthropic' || !auth.accessToken) {
      return false;
    }

    this.tokenData = {
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken ?? '',
      expiresAt: auth.tokenExpires ?? new Date(0).toISOString(),
      accountId: auth.accountId ?? 'anthropic-user',
    };

    return true;
  }

  clearTokens(): void {
    this.tokenData = null;
    saveAuth({
      provider: 'anthropic',
      accessToken: undefined,
      refreshToken: undefined,
      tokenExpires: undefined,
      accountId: undefined,
    });
  }

  private saveToConfig(): void {
    if (!this.tokenData) return;

    saveAuth({
      provider: 'anthropic',
      accessToken: this.tokenData.accessToken,
      refreshToken: this.tokenData.refreshToken,
      tokenExpires: this.tokenData.expiresAt,
      accountId: this.tokenData.accountId,
    });
  }
}
