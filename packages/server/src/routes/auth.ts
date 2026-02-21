import { Router, type Request, type Response } from 'express';
import { LLMClient } from '@agentdb/core';
import type { ServerState } from '../index.js';

export function createAuthRoutes(state: ServerState): Router {
  const router = Router();

  // ─── OpenAI Routes ───

  // POST /api/auth/login — Inicia fluxo OAuth OpenAI
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { authUrl, waitForCompletion } = await state.openaiAuth.startHeadlessAuth();

      waitForCompletion()
        .then((tokenData) => {
          state.auth = state.openaiAuth;
          state.provider = 'openai';
          state.isAuthenticated = true;
          state.accountId = tokenData.accountId;
          state.llmClient = new LLMClient(state.openaiAuth);
          console.log('✅ Autenticação OpenAI via callback concluída!');
        })
        .catch((err) => {
          console.error('❌ Erro no fluxo OpenAI:', err.message);
        });

      res.json({ authUrl });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro ao iniciar OAuth';
      console.error(msg);
      res.status(500).json({ error: msg });
    }
  });

  // GET /api/auth/callback — Callback do OAuth OpenAI
  router.get('/callback', async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      const returnedState = req.query.state as string;
      const error = req.query.error as string;

      if (error) {
        res.status(400).send(`
          <!DOCTYPE html><html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:system-ui;background:#09090B;color:#fff;">
          <div style="text-align:center;"><h1>❌</h1><h2>Erro na autenticação</h2><p style="color:#EF4444;">${error}</p></div>
          </body></html>
        `);
        return;
      }

      if (!code || !state.pendingOAuth) {
        res.status(400).send('Código de autorização não recebido.');
        return;
      }

      if (returnedState !== state.pendingOAuth.state) {
        res.status(400).send('State inválido.');
        return;
      }

      const tokenData = await state.openaiAuth.exchangeCode(code, state.pendingOAuth.codeVerifier, state.pendingOAuth.redirectUri);
      state.pendingOAuth = null;
      state.auth = state.openaiAuth;
      state.provider = 'openai';
      state.isAuthenticated = true;
      state.accountId = tokenData.accountId;
      state.llmClient = new LLMClient(state.openaiAuth);

      res.send(`
        <!DOCTYPE html><html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:system-ui;background:#09090B;color:#fff;">
        <div style="text-align:center;"><h1 style="font-size:3em;">✅</h1><h2>Autenticado!</h2><p style="color:#A1A1AA;">Pode fechar esta aba.</p></div>
        </body></html>
      `);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro no callback';
      res.status(500).send(`Erro: ${msg}`);
    }
  });

  // ─── Anthropic Routes ───

  // POST /api/auth/anthropic/login — Gera URL de auth Anthropic
  router.post('/anthropic/login', (_req: Request, res: Response) => {
    try {
      const { authUrl, codeVerifier, state: oauthState } = state.anthropicAuth.getAuthUrl();
      state.pendingAnthropicOAuth = { codeVerifier, state: oauthState };
      res.json({ authUrl });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro ao iniciar OAuth Anthropic';
      res.status(500).json({ error: msg });
    }
  });

  // POST /api/auth/anthropic/exchange — Troca code por tokens
  router.post('/anthropic/exchange', async (req: Request, res: Response) => {
    try {
      const { code } = req.body as { code: string };

      if (!code) {
        res.status(400).json({ error: 'Código não fornecido' });
        return;
      }

      if (!state.pendingAnthropicOAuth) {
        res.status(400).json({ error: 'Nenhum fluxo OAuth Anthropic pendente. Faça login novamente.' });
        return;
      }

      const { codeVerifier, state: oauthState } = state.pendingAnthropicOAuth;

      const tokenData = await state.anthropicAuth.exchangeCode(code, codeVerifier, oauthState);
      state.pendingAnthropicOAuth = null;
      state.auth = state.anthropicAuth;
      state.provider = 'anthropic';
      state.isAuthenticated = true;
      state.accountId = tokenData.accountId;
      state.llmClient = new LLMClient(state.anthropicAuth);

      res.json({
        success: true,
        accountId: tokenData.accountId,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro na troca de tokens Anthropic';
      console.error('❌ Erro Anthropic exchange:', msg);
      res.status(500).json({ error: msg });
    }
  });

  // ─── Model Routes ───

  // GET /api/auth/model — retorna modelo atual e opcoes
  router.get('/model', (_req: Request, res: Response) => {
    const currentModel = state.llmClient?.getModel() || null;
    const models: Record<string, string[]> = {
      anthropic: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'],
      openai: ['gpt-5-codex'],
    };
    res.json({
      current: currentModel,
      provider: state.provider,
      available: state.provider ? models[state.provider] || [] : [],
    });
  });

  // POST /api/auth/model — troca o modelo
  router.post('/model', (req: Request, res: Response) => {
    const { model } = req.body as { model: string };
    if (!model) {
      res.status(400).json({ error: 'Modelo nao especificado' });
      return;
    }
    if (state.llmClient) {
      state.llmClient.setModel(model);
    }
    res.json({ success: true, model });
  });

  // ─── Common Routes ───

  // GET /api/auth/status
  router.get('/status', (_req: Request, res: Response) => {
    const currentModel = state.llmClient?.getModel() || null;
    res.json({
      authenticated: state.isAuthenticated,
      accountId: state.accountId || undefined,
      provider: state.provider,
      model: currentModel,
    });
  });

  // POST /api/auth/logout
  router.post('/logout', (_req: Request, res: Response) => {
    state.auth.clearTokens();
    state.isAuthenticated = false;
    state.accountId = null;
    state.provider = null;
    state.llmClient = null;
    res.json({ success: true });
  });

  return router;
}
