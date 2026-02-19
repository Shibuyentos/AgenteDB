import * as readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import {
  DatabaseConnector,
  SchemaEngine,
  LLMClient,
  ContextBuilder,
  QueryExecutor,
  type ExecutionResult,
  log,
} from '@agentdb/core';

export class ChatREPL {
  private db: DatabaseConnector;
  private schemaEngine: SchemaEngine;
  private llmClient: LLMClient;
  private contextBuilder: ContextBuilder;
  private executor: QueryExecutor;
  private isRunning: boolean = false;
  private rl: readline.Interface | null = null;
  private lastResult: ExecutionResult | null = null;
  private totalTokens: number = 0;

  constructor(deps: {
    db: DatabaseConnector;
    schemaEngine: SchemaEngine;
    llmClient: LLMClient;
    contextBuilder: ContextBuilder;
    executor: QueryExecutor;
  }) {
    this.db = deps.db;
    this.schemaEngine = deps.schemaEngine;
    this.llmClient = deps.llmClient;
    this.contextBuilder = deps.contextBuilder;
    this.executor = deps.executor;
  }

  async start(): Promise<void> {
    this.isRunning = true;

    const schema = this.schemaEngine.getSchemaMap();
    if (schema) {
      const tableCount = schema.tables.filter((t) => t.type === 'table').length;
      const viewCount = schema.tables.filter((t) => t.type === 'view').length;
      const schemaCount = schema.schemas.length;

      log.blank();
      log.agent(
        `AgentDB conectado a: ${chalk.bold(schema.database)} (${chalk.dim(schema.version)})`
      );
      log.dim(
        `${tableCount} tabelas${viewCount > 0 ? ` e ${viewCount} views` : ''} mapeadas em ${schemaCount} schema${schemaCount > 1 ? 's' : ''}`
      );
      log.dim(
        `Modo: ${this.executor.isReadOnly() ? chalk.yellow('somente leitura') : chalk.green('leitura/escrita')} | Digite ${chalk.bold('/help')} para comandos`
      );
      log.blank();
    }

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.white('▶ '),
      terminal: true,
    });

    this.rl.on('close', () => {
      this.isRunning = false;
    });

    return new Promise<void>((resolve) => {
      if (!this.rl) return resolve();

      this.rl.prompt();

      this.rl.on('line', async (line: string) => {
        const input = line.trim();

        if (!input) {
          this.rl?.prompt();
          return;
        }

        try {
          if (input.startsWith('/')) {
            await this.processCommand(input);
          } else {
            await this.processInput(input);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Erro inesperado';
          log.error(msg);
        }

        if (this.isRunning) {
          this.rl?.prompt();
        } else {
          resolve();
        }
      });
    });
  }

  private async processInput(input: string): Promise<void> {
    const spinner = ora({
      text: chalk.dim('Pensando...'),
      spinner: 'dots',
      color: 'cyan',
    }).start();

    try {
      const response = await this.llmClient.chat(input);
      spinner.stop();

      this.totalTokens += response.tokensUsed.total;

      const sql = this.executor.extractSQL(response.content);

      if (sql) {
        const textWithoutSQL = response.content
          .replace(/```sql\s*\n[\s\S]*?```/gi, '')
          .replace(/```\s*\n[\s\S]*?```/g, '')
          .trim();

        if (textWithoutSQL) {
          log.agent(textWithoutSQL);
        }

        log.sql(sql);

        if (this.executor.isDestructiveQuery(sql)) {
          if (this.executor.isReadOnly()) {
            log.warn(
              'Modo somente leitura ativo. Use /write para habilitar escrita.'
            );
            return;
          }

          const confirmed = await this.askConfirmation(
            'Executar esta query destrutiva? (s/n): '
          );
          if (!confirmed) {
            log.dim('Execução cancelada.');
            return;
          }
        }

        const execSpinner = ora({
          text: chalk.dim('Executando query...'),
          spinner: 'dots',
          color: 'yellow',
        }).start();

        const result = await this.executor.execute(sql);
        execSpinner.stop();

        this.lastResult = result;

        if (result.error) {
          log.error(`Erro SQL: ${result.error}`);

          const retrySpinner = ora({
            text: chalk.dim('Analisando erro e tentando corrigir...'),
            spinner: 'dots',
            color: 'yellow',
          }).start();

          try {
            const fixResponse = await this.llmClient.chat(
              `A query retornou um erro:\n${result.error}\n\nPor favor, corrija a query.`
            );
            retrySpinner.stop();

            this.totalTokens += fixResponse.tokensUsed.total;

            const fixedSQL = this.executor.extractSQL(fixResponse.content);
            if (fixedSQL) {
              log.agent('Tentando query corrigida:');
              log.sql(fixedSQL);

              const fixResult = await this.executor.execute(fixedSQL);
              this.lastResult = fixResult;

              if (fixResult.error) {
                log.error(`Erro persistente: ${fixResult.error}`);
              } else {
                this.showQueryResult(fixResult);
                await this.sendResultToLLM(fixResult);
              }
            } else {
              log.agent(fixResponse.content);
            }
          } catch (retryError) {
            retrySpinner.stop();
            const msg = retryError instanceof Error ? retryError.message : 'Erro';
            log.error(`Não foi possível corrigir: ${msg}`);
          }
        } else {
          this.showQueryResult(result);
          await this.sendResultToLLM(result);
        }
      } else {
        log.agent(response.content);
      }
    } catch (error) {
      spinner.stop();

      if (error instanceof Error) {
        if (
          error.message.includes('connection') ||
          error.message.includes('ECONNREFUSED')
        ) {
          log.warn('Conexão com o banco perdida. Tentando reconectar...');
          try {
            await this.db.connect();
            log.success('Reconectado! Tente novamente.');
          } catch {
            log.error('Falha ao reconectar. Use /reconnect.');
          }
        } else {
          log.error(error.message);
        }
      } else {
        log.error('Erro inesperado ao processar mensagem.');
      }
    }
  }

  private showQueryResult(result: ExecutionResult): void {
    if (result.rows.length > 0) {
      log.table(result.rows);
    }
    log.dim(
      `${result.rowCount} linha${result.rowCount !== 1 ? 's' : ''} | ${result.duration}ms`
    );
  }

  private async sendResultToLLM(result: ExecutionResult): Promise<void> {
    if (result.rows.length === 0) return;

    const rowsToSend = result.rows.slice(0, 20);
    const message = `Resultado da query (${result.rowCount} linhas, ${result.duration}ms):\n${JSON.stringify(rowsToSend, null, 2)}`;

    const spinner = ora({
      text: chalk.dim('Analisando resultados...'),
      spinner: 'dots',
      color: 'cyan',
    }).start();

    try {
      const summaryResponse = await this.llmClient.chat(message);
      spinner.stop();

      this.totalTokens += summaryResponse.tokensUsed.total;
      log.agent(summaryResponse.content);
    } catch {
      spinner.stop();
    }
  }

  private async processCommand(command: string): Promise<void> {
    const parts = command.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    switch (cmd) {
      case 'help':
        this.showHelp();
        break;
      case 'tables':
        this.showTables();
        break;
      case 'describe':
      case 'desc':
        this.describeTable(args);
        break;
      case 'relations':
      case 'rel':
        this.showRelations(args);
        break;
      case 'search':
        this.searchSchema(args);
        break;
      case 'sql':
        await this.executeDirect(args);
        break;
      case 'write':
        this.toggleWriteMode();
        break;
      case 'clear':
        this.clearHistory();
        break;
      case 'reconnect':
        await this.reconnect();
        break;
      case 'export':
        this.exportResult(args);
        break;
      case 'stats':
        this.showStats();
        break;
      case 'quit':
      case 'exit':
        await this.quit();
        break;
      default:
        log.warn(`Comando desconhecido: /${cmd}. Digite /help para ver comandos.`);
        break;
    }
  }

  private showHelp(): void {
    log.blank();
    console.log(chalk.bold.cyan('  Comandos disponíveis:'));
    log.blank();
    console.log(`  ${chalk.bold('/help')}                    Mostra esta ajuda`);
    console.log(`  ${chalk.bold('/tables')}                  Lista todas as tabelas`);
    console.log(`  ${chalk.bold('/describe')} ${chalk.dim('<tabela>')}        Mostra estrutura de uma tabela`);
    console.log(`  ${chalk.bold('/relations')} ${chalk.dim('<tabela>')}       Mostra tabelas relacionadas`);
    console.log(`  ${chalk.bold('/search')} ${chalk.dim('<termo>')}           Busca tabelas/colunas`);
    console.log(`  ${chalk.bold('/sql')} ${chalk.dim('<query>')}              Executa SQL direto (sem LLM)`);
    console.log(`  ${chalk.bold('/write')}                   Toggle modo escrita`);
    console.log(`  ${chalk.bold('/clear')}                   Limpa histórico de conversa`);
    console.log(`  ${chalk.bold('/reconnect')}               Reconecta e remapeia schema`);
    console.log(`  ${chalk.bold('/export')} ${chalk.dim('<json|csv>')}        Exporta último resultado`);
    console.log(`  ${chalk.bold('/stats')}                   Mostra estatísticas da sessão`);
    console.log(`  ${chalk.bold('/quit')}                    Sai do AgentDB`);
    log.blank();
  }

  private showTables(): void {
    const schema = this.schemaEngine.getSchemaMap();
    if (!schema) {
      log.warn('Schema não mapeado. Use /reconnect.');
      return;
    }

    log.blank();
    console.log(chalk.bold.cyan(`  Tabelas em ${schema.database}:`));
    log.blank();

    let currentSchema = '';
    for (const table of schema.tables) {
      if (table.schema !== currentSchema) {
        currentSchema = table.schema;
        console.log(chalk.bold.white(`  📁 ${currentSchema}`));
      }

      const typeIcon = table.type === 'view' ? '👁' : '📋';
      const rowInfo =
        table.estimatedRowCount > 0
          ? chalk.dim(` (~${table.estimatedRowCount} rows)`)
          : '';
      const colCount = chalk.dim(`${table.columns.length} cols`);

      console.log(
        `     ${typeIcon} ${chalk.white(table.name)} ${colCount}${rowInfo}`
      );
    }
    log.blank();
  }

  private describeTable(tableName: string): void {
    if (!tableName) {
      log.warn('Uso: /describe <nome_da_tabela>');
      return;
    }

    const results = this.schemaEngine.searchTables(tableName);
    if (results.length === 0) {
      log.warn(`Tabela "${tableName}" não encontrada.`);
      return;
    }

    const table = results[0];
    log.blank();
    console.log(
      chalk.bold.cyan(`  ${table.schema}.${table.name}`) +
        (table.type === 'view' ? chalk.dim(' [VIEW]') : '') +
        (table.comment ? chalk.dim(` — ${table.comment}`) : '')
    );
    log.blank();

    console.log(chalk.bold('  Colunas:'));
    for (const col of table.columns) {
      const markers: string[] = [];
      if (col.isPrimaryKey) markers.push(chalk.yellow('PK'));
      const fk = table.foreignKeys.find((f) => f.column === col.name);
      if (fk) markers.push(chalk.blue(`FK→${fk.referencedTable}.${fk.referencedColumn}`));
      if (!col.nullable && !col.isPrimaryKey) markers.push(chalk.red('NOT NULL'));
      if (col.defaultValue) markers.push(chalk.dim(`default=${col.defaultValue}`));

      const markersStr = markers.length > 0 ? ` ${markers.join(' ')}` : '';
      console.log(`    ${chalk.white(col.name)} ${chalk.dim(col.type)}${markersStr}`);
    }

    if (table.indexes.length > 0) {
      log.blank();
      console.log(chalk.bold('  Índices:'));
      for (const idx of table.indexes) {
        const type = idx.isPrimary
          ? chalk.yellow('PRIMARY')
          : idx.isUnique
            ? chalk.green('UNIQUE')
            : chalk.dim('INDEX');
        console.log(`    ${type} ${chalk.white(idx.name)} (${idx.columns.join(', ')})`);
      }
    }

    if (table.foreignKeys.length > 0) {
      log.blank();
      console.log(chalk.bold('  Foreign Keys (saída):'));
      for (const fk of table.foreignKeys) {
        console.log(
          `    → ${chalk.white(fk.column)} → ${fk.referencedSchema}.${fk.referencedTable}.${fk.referencedColumn}`
        );
      }
    }

    if (table.referencedBy.length > 0) {
      log.blank();
      console.log(chalk.bold('  Referenciada por:'));
      for (const ref of table.referencedBy) {
        console.log(
          `    ← ${ref.referencedSchema}.${ref.referencedTable}.${ref.referencedColumn}`
        );
      }
    }

    if (table.estimatedRowCount > 0) {
      log.blank();
      log.dim(`Rows estimados: ~${table.estimatedRowCount}`);
    }

    log.blank();
  }

  private showRelations(tableName: string): void {
    if (!tableName) {
      log.warn('Uso: /relations <nome_da_tabela>');
      return;
    }

    const results = this.schemaEngine.searchTables(tableName);
    if (results.length === 0) {
      log.warn(`Tabela "${tableName}" não encontrada.`);
      return;
    }

    const table = results[0];
    const related = this.schemaEngine.findRelatedTables(table.schema, table.name);

    log.blank();
    console.log(
      chalk.bold.cyan(`  Tabelas relacionadas a ${table.schema}.${table.name}:`)
    );
    log.blank();

    if (related.length === 0) {
      log.dim('Nenhuma tabela relacionada encontrada.');
    } else {
      for (const rel of related) {
        const direction = table.foreignKeys.some(
          (fk) =>
            fk.referencedSchema === rel.schema &&
            fk.referencedTable === rel.name
        )
          ? '→'
          : '←';
        console.log(
          `    ${direction} ${chalk.white(`${rel.schema}.${rel.name}`)} (${rel.columns.length} colunas)`
        );
      }
    }
    log.blank();
  }

  private searchSchema(query: string): void {
    if (!query) {
      log.warn('Uso: /search <termo>');
      return;
    }

    const results = this.schemaEngine.searchTables(query);

    log.blank();
    if (results.length === 0) {
      log.dim(`Nenhum resultado para "${query}".`);
    } else {
      console.log(chalk.bold.cyan(`  Resultados para "${query}":`));
      log.blank();
      for (const table of results) {
        console.log(`    📋 ${chalk.white(`${table.schema}.${table.name}`)}`);
        const matchCols = table.columns.filter((c) =>
          c.name.toLowerCase().includes(query.toLowerCase())
        );
        for (const col of matchCols) {
          console.log(`       └ ${chalk.dim(col.name)} (${col.type})`);
        }
      }
    }
    log.blank();
  }

  private async executeDirect(sql: string): Promise<void> {
    if (!sql) {
      log.warn('Uso: /sql <query>');
      return;
    }

    log.sql(sql);

    const spinner = ora({
      text: chalk.dim('Executando...'),
      spinner: 'dots',
      color: 'yellow',
    }).start();

    const result = await this.executor.execute(sql);
    spinner.stop();

    this.lastResult = result;

    if (result.error) {
      log.error(`Erro SQL: ${result.error}`);
    } else {
      this.showQueryResult(result);
    }
  }

  private toggleWriteMode(): void {
    const newMode = !this.executor.isReadOnly();
    this.executor.setReadOnlyMode(newMode);

    if (newMode) {
      log.info('Modo somente leitura ' + chalk.bold.yellow('ATIVADO'));
    } else {
      log.warn('Modo escrita ' + chalk.bold.green('ATIVADO') + ' — cuidado!');
    }
  }

  private clearHistory(): void {
    this.llmClient.clearHistory();
    log.success('Histórico de conversa limpo.');
  }

  private async reconnect(): Promise<void> {
    const spinner = ora({
      text: chalk.dim('Reconectando...'),
      spinner: 'dots',
      color: 'cyan',
    }).start();

    try {
      await this.db.disconnect();
    } catch {
      // Ignora
    }

    try {
      const info = await this.db.connect();
      spinner.text = chalk.dim('Remapeando schema...');
      const schema = await this.schemaEngine.mapDatabase();

      const systemPrompt = this.contextBuilder.buildSystemPrompt();
      this.llmClient.setSystemPrompt(systemPrompt);

      spinner.stop();
      log.success(
        `Reconectado a ${info.database} — ${schema.tables.length} tabelas mapeadas.`
      );
    } catch (error) {
      spinner.stop();
      const msg = error instanceof Error ? error.message : 'Erro ao reconectar';
      log.error(msg);
    }
  }

  private exportResult(format: string): void {
    if (!this.lastResult || this.lastResult.rows.length === 0) {
      log.warn('Nenhum resultado disponível para exportar.');
      return;
    }

    const fmt = (format || 'json').toLowerCase();

    if (fmt === 'json') {
      const json = JSON.stringify(this.lastResult.rows, null, 2);
      console.log(json);
      log.dim(`${this.lastResult.rows.length} linhas exportadas como JSON.`);
    } else if (fmt === 'csv') {
      const headers = Object.keys(this.lastResult.rows[0]);
      const lines = [headers.join(',')];
      for (const row of this.lastResult.rows) {
        const values = headers.map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          const str = String(val);
          return str.includes(',') || str.includes('"')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        });
        lines.push(values.join(','));
      }
      console.log(lines.join('\n'));
      log.dim(`${this.lastResult.rows.length} linhas exportadas como CSV.`);
    } else {
      log.warn(`Formato "${fmt}" não suportado. Use: json ou csv`);
    }
  }

  private showStats(): void {
    const history = this.llmClient.getHistory();

    log.blank();
    console.log(chalk.bold.cyan('  📊 Estatísticas da sessão:'));
    log.blank();
    console.log(`    Mensagens no histórico: ${history.length}`);
    console.log(`    Tokens totais usados:   ${this.totalTokens}`);
    console.log(
      `    Modo:                   ${this.executor.isReadOnly() ? 'Somente leitura' : 'Leitura/Escrita'}`
    );
    if (this.lastResult) {
      console.log(
        `    Última query:           ${this.lastResult.rowCount} linhas (${this.lastResult.duration}ms)`
      );
    }
    log.blank();
  }

  private async quit(): Promise<void> {
    log.blank();
    log.dim('Desconectando...');

    try {
      await this.db.disconnect();
    } catch {
      // Ignora
    }

    log.success('Até logo! 👋');
    this.isRunning = false;
    this.rl?.close();
  }

  private askConfirmation(question: string): Promise<boolean> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(chalk.yellow(`  ${question}`), (answer: string) => {
        rl.close();
        resolve(
          answer.trim().toLowerCase() === 's' ||
            answer.trim().toLowerCase() === 'sim'
        );
      });
    });
  }
}
