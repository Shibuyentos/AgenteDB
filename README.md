# AgentDB

Converse com seu banco de dados. Conecte qualquer PostgreSQL, pergunte em portugues, receba respostas inteligentes.

## Features

- Chat em linguagem natural com seu banco de dados
- Mapeamento automatico de schema, tabelas e relacoes
- Resultados formatados com export (JSON, CSV)
- Auth via OAuth (usa sua assinatura do ChatGPT, sem custo extra)
- Visualizacao de grafo de relacoes
- Query editor com syntax highlighting
- Dark/Light mode
- Atalhos de teclado e command palette
- CLI funcional (modo terminal)

## Quick Start

### Com Docker (recomendado)

```bash
docker compose up -d
```

Acesse http://localhost:3001

### Manual

```bash
npm install
npm run dev
```

Acesse http://localhost:5173

### CLI

```bash
npm run cli
```

## Autenticacao

Na primeira execucao, faca login com sua conta OpenAI.
O AgentDB usa OAuth PKCE (mesmo fluxo do Codex CLI) para
autenticar com sua assinatura existente do ChatGPT.

Alternativa: use uma API key da OpenAI.

## Atalhos

| Atalho       | Acao                  |
|--------------|-----------------------|
| Ctrl+K       | Command Palette       |
| Ctrl+E       | Query Editor          |
| Ctrl+J       | Focar no Chat         |
| Ctrl+B       | Toggle Sidebar        |
| Ctrl+Enter   | Enviar / Executar     |
| Ctrl+L       | Limpar chat           |

## Comandos CLI

| Comando | Descricao |
|---------|-----------|
| `/help` | Mostra ajuda |
| `/tables` | Lista todas as tabelas |
| `/describe <tabela>` | Mostra estrutura de uma tabela |
| `/relations <tabela>` | Mostra tabelas relacionadas |
| `/search <termo>` | Busca tabelas/colunas |
| `/sql <query>` | Executa SQL direto (sem LLM) |
| `/write` | Toggle modo escrita |
| `/clear` | Limpa historico de conversa |
| `/quit` | Sai do AgentDB |

## Arquitetura

```
agentdb/
  packages/
    core/       - Logica de negocio (auth, db, agent, utils)
    server/     - API Express + WebSocket
    web/        - Frontend React + Tailwind + Vite
    cli/        - CLI original
```

## Como funciona

1. Voce pergunta em linguagem natural
2. O AgentDB envia o schema do banco + sua pergunta pro GPT-4o
3. O GPT-4o gera SQL otimizado
4. O AgentDB executa a query no seu banco (read-only por padrao)
5. Os resultados sao resumidos e exibidos

## Requisitos

- Node.js 22 ou superior
- PostgreSQL (qualquer versao suportada)
- Conta OpenAI (para autenticacao OAuth)

## Roadmap

- [ ] MySQL, SQLite, SQL Server
- [ ] Multiplas conexoes simultaneas
- [ ] Graficos inline (charts)
- [ ] Historico persistente
- [ ] Plugins/extensoes
- [ ] App desktop (Tauri)

## License

MIT
