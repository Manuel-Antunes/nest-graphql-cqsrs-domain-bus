import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import aiConfig from '../config/ai.config';
import {
  ChatModelFactory,
  ChatStoreFactory,
  CheckpointerFactory,
  CheckpointerPoolFactory,
  CriativeChatModelFactory,
  EmbeddingModelFactory,
  LangfuseFactory,
  LogicChatModelFactory,
  Neo4jGraphFactory,
  ResearcherChatModelFactory,
  STTServiceFactory,
  VectorStoreFactory,
} from '../factories';
import { ContentExtractionService } from '../files/analysis/content-extraction.service';
import { FileAnalysisService } from '../files/analysis/file-analysis.service';
import { PdfAnalysisService } from '../files/analysis/pdf-analysis.service';
import { PdfParserService } from '../files/analysis/pdf-parser.service';
import { VisionAnalysisService } from '../files/analysis/vision-analysis.service';
import { AttachmentDrive } from '../files/drive/attachment-drive';
import { AttachmentIngestionService } from '../files/ingestion/attachment-ingestion.service';
import { FileIngestionMiddleware } from '../files/ingestion/file-ingestion.middleware';
import { PrepareDocumentAssetTool } from '../files/ingestion/prepare-document-asset.tool';
import { FileAnalysisSpecialistAgent } from '../files/specialist/file-analysis-specialist.agent';
import { AnalyzeAttachmentTool } from '../files/specialist/tools/analyze-attachment.tool';
import { AnalyzePdfPageTool } from '../files/specialist/tools/analyze-pdf-page.tool';
import { AnalyzeStateFilesTool } from '../files/specialist/tools/analyze-state-files.tool';
import { ListPdfPagesTool } from '../files/specialist/tools/list-pdf-pages.tool';
import { InterruptMessageHumanizer } from '../services/interrupt-message-humanizer.service';
import { PromptService } from '../services/prompt.service';

@Module({
  imports: [ConfigModule.forFeature(aiConfig)],
  providers: [
    ChatModelFactory,
    LangfuseFactory,
    CriativeChatModelFactory,
    LogicChatModelFactory,
    ResearcherChatModelFactory,
    Neo4jGraphFactory,
    CheckpointerPoolFactory,
    CheckpointerFactory,
    ChatStoreFactory,
    STTServiceFactory,
    VectorStoreFactory,
    EmbeddingModelFactory,
    PdfParserService,
    VisionAnalysisService,
    ContentExtractionService,
    PdfAnalysisService,
    FileAnalysisService,
    AttachmentDrive,
    AttachmentIngestionService,
    PrepareDocumentAssetTool,
    FileIngestionMiddleware,
    AnalyzeAttachmentTool,
    AnalyzeStateFilesTool,
    AnalyzePdfPageTool,
    ListPdfPagesTool,
    FileAnalysisSpecialistAgent,
    InterruptMessageHumanizer,
    PromptService,
  ],
  exports: [
    LangfuseFactory.provide,
    ChatModelFactory.provide,
    CriativeChatModelFactory.provide,
    LogicChatModelFactory.provide,
    ResearcherChatModelFactory.provide,
    Neo4jGraphFactory.provide,
    CheckpointerFactory.provide,
    ChatStoreFactory.provide,
    STTServiceFactory.provide,
    VectorStoreFactory.provide,
    EmbeddingModelFactory.provide,
    FileAnalysisService,
    AttachmentDrive,
    FileAnalysisSpecialistAgent,
    AttachmentIngestionService,
    PrepareDocumentAssetTool,
    FileIngestionMiddleware,
    InterruptMessageHumanizer,
    PromptService,
  ],
})
export class AiModule {}
