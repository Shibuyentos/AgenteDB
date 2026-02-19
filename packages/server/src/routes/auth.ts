import { Router, type Request, type Response } from 'express';
import { createApiError } from '../middleware/error-handler.js';
import type { ServerState } from '../index.js';

export function createAuthRoutes(state: ServerState): Router {
  const router = Router();

  // POST /api/auth/login — Inicia fluxo OAuth
  router.post('/login', async (req: Request, res: Response) => {
    try {
      // Inicia o processo headless: gera URL e já sobe o listener na 1455
      const { authUrl, waitForCompletion } = await state.auth.startHeadlessAuth();

      // Inicia a espera pelo callback em background (sem await aqui para não travar o request)
      waitForCompletion()
        .then((tokenData) => {
          state.isAuthenticated = true;
          state.accountId = tokenData.accountId;
          console.log('✅ Autenticação via callback (headless) concluída!');
        })
        .catch((err) => {
          console.error('❌ Erro no fluxo headless de auth:', err.message);
        });

      // Retorna a URL para o frontend abrir
      res.json({ authUrl });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro ao iniciar OAuth';
      console.error(msg);
      // Se der erro ao subir o servidor (ex: porta em uso), retorna aqui
      res.status(500).json({ error: msg });
    }
  });

  // GET /api/auth/callback — Callback do OAuth
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

      const tokenData = await state.auth.exchangeCode(code, state.pendingOAuth.codeVerifier, state.pendingOAuth.redirectUri);
      state.pendingOAuth = null;
      state.isAuthenticated = true;
      state.accountId = tokenData.accountId;

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

  // GET /api/auth/status
  router.get('/status', (_req: Request, res: Response) => {
    res.json({
      authenticated: state.isAuthenticated,
      accountId: state.accountId || undefined,
    });
  });

  // POST /api/auth/logout
  router.post('/logout', (_req: Request, res: Response) => {
    state.auth.clearTokens();
    state.isAuthenticated = false;
    state.accountId = null;
    res.json({ success: true });
  });

  return router;
}
