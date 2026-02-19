#!/usr/bin/env node

import * as readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import {
  DatabaseConnector,
  SchemaEngine,
  OpenAIAuth,
  LLMClient,
  ContextBuilder,
  QueryExecutor,
  log,
  loadConfig,
  getDefaultConnection,
  addConnection,
} from '@agentdb/core';
import { ChatREPL } from './chat/repl.js';

// ─── Banner ───

const BANNER = `
${chalk.cyan.bold(`    _                    _   ____  ____  `)}
${chalk.cyan.bold(`   / \\   __ _  ___ _ __ | |_|  _ \\| __ ) `)}
${chalk.cyan.bold(`  / _ \\ / _\` |/ _ \\ '_ \\| __| | | |  _ \\ `)}
${chalk.cyan.bold(` / ___ \\ (_| |  __/ | | | |_| |_| | |_) |`)}
${chalk.cyan.bold(`/_/   \\_\\__, |\\___|_| |_|\\__|____/|____/ `)}
${chalk.cyan.bold(`        |___/                            `)}

${chalk.dim('  Seu banco de dados, sua conversa.')}
${chalk.dim('  v0.1.0')}
`;

// ─── Helpers ───

function askQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─── Main ───

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'config') {
    console.log(BANNER);
    const config = loadConfig();
    log.blank();
    console.log(chalk.bold.cyan('  ⚙  Configuração do AgentDB'));
    log.blank();
    console.log(chalk.bold('  Conexões:'));
    if (config.connections.length === 0) {
      console.log(chalk.dim('    Nenhuma conexão salva.'));
    } else {
      for (const conn of config.connections) {
        const defaultMark = conn.isDefault ? chalk.green(' (padrão)') : '';
        const safeUrl = conn.url.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
        console.log(`    ${chalk.white(conn.name)}: ${chalk.dim(safeUrl)}${defaultMark}`);
      }
    }
    log.blank();
    console.log(chalk.bold('  Autenticação:'));
    if (config.auth) {
      console.log(`    Provider: ${config.auth.provider}`);
      console.log(
        `    Token: ${config.auth.accessToken ? chalk.green('✓ presente') : chalk.red('✗ ausente')}`
      );
    } else {
      console.log(chalk.dim('    Não autenticado.'));
    }
    log.blank();
    return;
  }

  console.log(BANNER);

  // ─── 1. Autenticação ───
  const auth = new OpenAIAuth();

  if (command === 'auth') {
    log.info('Iniciando autenticação OAuth...');
    try {
      const tokenData = await auth.login();
      log.success(`Autenticado com sucesso! (account: ${tokenData.accountId})`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro de autenticação';
      log.error(msg);
      process.exit(1);
    }
    return;
  }

  const hasAuth = auth.loadFromConfig();

  if (!hasAuth) {
    log.info('Nenhum token encontrado. Iniciando autenticação...');
    log.blank();
    try {
      const tokenData = await auth.login();
      log.success(`Autenticado! (account: ${tokenData.accountId})`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro de autenticação';
      log.error(`Falha na autenticação: ${msg}`);
      log.dim('Você pode tentar novamente com: agentdb auth');
      process.exit(1);
    }
  } else {
    log.success('Autenticação carregada.');
  }

  // ─── 2. Conexão com banco ───
  let connectionUrl: string;

  if (command === 'connect' && args[1]) {
    connectionUrl = args[1];
    const connName = connectionUrl.match(/\/([^/?]+)(\?|$)/)?.[1] || 'default';
    addConnection(connName, connectionUrl);
  } else {
    const defaultConn = getDefaultConnection();

    if (defaultConn) {
      const safeUrl = defaultConn.url.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
      const useDefault = await askQuestion(
        chalk.white(
          `  Usar conexão "${chalk.bold(defaultConn.name)}" (${chalk.dim(safeUrl)})? (s/n): `
        )
      );

      if (
        useDefault.toLowerCase() === 's' ||
        useDefault.toLowerCase() === 'sim' ||
        useDefault === ''
      ) {
        connectionUrl = defaultConn.url;
      } else {
        connectionUrl = await askQuestion(
          chalk.white('  Connection string PostgreSQL: ')
        );
      }
    } else {
      log.info('Nenhuma conexão salva.');
      connectionUrl = await askQuestion(
        chalk.white('  Connection string PostgreSQL: ')
      );

      if (!connectionUrl) {
        log.error('Connection string é obrigatória.');
        process.exit(1);
      }

      const connName = connectionUrl.match(/\/([^/?]+)(\?|$)/)?.[1] || 'default';
      addConnection(connName, connectionUrl);
    }
  }

  // ─── 3. Conectar ao banco ───
  const connSpinner = ora({
    text: chalk.dim('Conectando ao banco de dados...'),
    spinner: 'dots',
    color: 'cyan',
  }).start();

  const db = new DatabaseConnector(connectionUrl);

  let dbInfo;
  try {
    dbInfo = await db.connect();
    connSpinner.succeed(
      chalk.green(
        `Conectado a ${chalk.bold(dbInfo.database)} (${chalk.dim(dbInfo.version)})`
      )
    );
  } catch (error) {
    connSpinner.fail(chalk.red('Falha na conexão'));
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    log.error(msg);
    log.dim('Verifique a connection string e se o PostgreSQL está rodando.');
    process.exit(1);
  }

  // ─── 4. Mapear schema ───
  const schemaSpinner = ora({
    text: chalk.dim('Mapeando banco de dados...'),
    spinner: 'dots',
    color: 'cyan',
  }).start();

  const schemaEngine = new SchemaEngine(db);

  try {
    const schema = await schemaEngine.mapDatabase();
    const tableCount = schema.tables.filter((t) => t.type === 'table').length;
    const viewCount = schema.tables.filter((t) => t.type === 'view').length;

    let mapMsg = `${tableCount} tabelas`;
    if (viewCount > 0) mapMsg += ` e ${viewCount} views`;
    mapMsg += ` mapeadas em ${schema.schemas.length} schema${schema.schemas.length > 1 ? 's' : ''}`;

    schemaSpinner.succeed(chalk.green(mapMsg));
  } catch (error) {
    schemaSpinner.fail(chalk.red('Falha ao mapear schema'));
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    log.error(msg);
    log.dim('Conectado, mas não foi possível ler a estrutura do banco.');
    process.exit(1);
  }

  // ─── 5. Configurar agente ───
  const contextBuilder = new ContextBuilder(schemaEngine);
  const systemPrompt = contextBuilder.buildSystemPrompt();

  const llmClient = new LLMClient(auth);
  llmClient.setSystemPrompt(systemPrompt);

  const executor = new QueryExecutor(db);

  // ─── 6. Iniciar chat ───
  const chatRepl = new ChatREPL({
    db,
    schemaEngine,
    llmClient,
    contextBuilder,
    executor,
  });

  await chatRepl.start();
}

// ─── Error Handlers ───

process.on('uncaughtException', (error) => {
  log.error(`Erro inesperado: ${error.message}`);
  log.dim('Se o problema persistir, reporte em: github.com/agentdb/agentdb');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  log.error(`Erro não tratado: ${msg}`);
  process.exit(1);
});

// ─── Run ───

main().catch((error) => {
  log.error(`Erro fatal: ${error.message}`);
  process.exit(1);
});
