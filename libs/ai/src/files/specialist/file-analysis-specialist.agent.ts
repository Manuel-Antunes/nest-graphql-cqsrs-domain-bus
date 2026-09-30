import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { BackendProtocolV2, CompiledSubAgent } from 'deepagents';
import {
  type AnyAgentMiddleware,
  createAgent,
  type ReactAgent,
} from 'langchain';

import { SubAgentMiddleware } from '../../agents/subagent-middleware';
import type { IAgent } from '../../domain/interfaces/agent.interface';
import type { Skill } from '../../domain/skill.entity';
import type {
  IAgentBuilder,
  ISubAgent,
  IWithSkills,
} from '../../interfaces/sub-agent.interface';
import { loggerLangchainMiddleware } from '../../middleware/logger.middleware';
import { AnalyzeAttachmentTool } from './tools/analyze-attachment.tool';
import { AnalyzePdfPageTool } from './tools/analyze-pdf-page.tool';
import { AnalyzeStateFilesTool } from './tools/analyze-state-files.tool';
import { ListPdfPagesTool } from './tools/list-pdf-pages.tool';

@Injectable()
export class FileAnalysisSpecialistAgent
  implements IAgent<unknown>, IAgentBuilder<unknown>, ISubAgent, IWithSkills
{
  static readonly SUBAGENT_NAME = 'file_analysis';
  static readonly SUBAGENT_DESCRIPTION =
    'Subagente especializado em ANÁLISE PROFUNDA de um arquivo anexado (PDF, imagem, áudio, documento). Use quando precisar ir além da análise inicial — ex.: ler em detalhe uma página específica de um PDF (gráficos, tabelas, imagens) ou extrair conteúdo de um arquivo complexo. A DESCOBERTA dos arquivos é sua (supervisor) via `ls /attachments` + `read_file`; passe pra este subagente o CAMINHO do arquivo (ex.: `/attachments/49.pdf`) e o que você precisa que ele analise. Ele NÃO descobre arquivos sozinho.';

  private static readonly SYSTEM_PROMPT = [
    'Você é um Especialista em Análise de Arquivos.',
    '',
    '## Suas Ferramentas',
    '',
    '1. **Anexos da conversa** (o caso normal): use `analyze_attachment` com o caminho do anexo exatamente como ele aparece na tarefa que você recebeu (ex.: `/attachments/abc-file-0.png`) e descreva no `focus` o que precisa ser extraído. Serve para imagens, PDFs, documentos e áudios.',
    '2. **PDFs com imagens**: para detalhes de uma página específica — gráficos, tabelas, diagramas — use `list_pdf_pages` para ver a estrutura e `analyze_pdf_page` para a análise visual da página escolhida, sempre com o caminho do anexo.',
    '3. **Workspace do agente**: `analyze_context_files` só enxerga arquivos gravados no state do agente. Não é o caminho para anexos do usuário.',
    '',
    '## Regras',
    '',
    '- O caminho do anexo é a identidade dele: copie-o VERBATIM da tarefa, nunca o remonte a partir do nome do arquivo.',
    '- Um `focus` específico melhora muito o resultado — a análise é refeita sobre os bytes originais, então pergunte exatamente o que quer saber.',
    '- Se uma ferramenta disser que não encontrou o anexo, relate isso e o caminho que você tentou. Não invente conteúdo nem descreva o arquivo de memória.',
    '',
    'Sua tarefa é analisar documentos e imagens fornecidos, fornecendo resumos, extraindo dados e respondendo perguntas com precisão.',
    'Responda sempre em Português do Brasil.',
  ].join('\n');

  private readonly logger = new Logger(FileAnalysisSpecialistAgent.name);

  constructor(
    @Inject('CHAT_MODEL') private readonly model: BaseChatModel,
    @Inject(AnalyzeAttachmentTool)
    private readonly analyzeAttachmentTool: AnalyzeAttachmentTool,
    @Inject(AnalyzeStateFilesTool)
    private readonly analyzeStateFilesTool: AnalyzeStateFilesTool,
    @Inject(AnalyzePdfPageTool)
    private readonly analyzePdfPageTool: AnalyzePdfPageTool,
    @Inject(ListPdfPagesTool)
    private readonly listPdfPagesTool: ListPdfPagesTool,
  ) {}

  get skills(): Skill[] {
    return [];
  }

  get agent(): ReactAgent {
    return this.build();
  }

  build(backend?: BackendProtocolV2): ReactAgent {
    const tools: StructuredToolInterface[] = [
      this.analyzeAttachmentTool,
      this.analyzeStateFilesTool,
      this.analyzePdfPageTool,
      this.listPdfPagesTool,
    ];
    const middleware: AnyAgentMiddleware[] = [
      ...SubAgentMiddleware.for({ backend }),
      loggerLangchainMiddleware(this.logger),
    ];
    return createAgent({
      name: 'FileAnalysisSpecialist',
      model: this.model,
      middleware,
      tools,
      systemPrompt: FileAnalysisSpecialistAgent.SYSTEM_PROMPT,
    });
  }

  subAgent(backend: BackendProtocolV2): CompiledSubAgent {
    return {
      name: FileAnalysisSpecialistAgent.SUBAGENT_NAME,
      description: FileAnalysisSpecialistAgent.SUBAGENT_DESCRIPTION,
      runnable: this.build(backend),
    };
  }
}
