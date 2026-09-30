import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { WebPDFLoader } from '@langchain/community/document_loaders/web/pdf';
import { Inject, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';

import { VisionAnalysisService } from './vision-analysis.service';

@Injectable()
export class ContentExtractionService {
  constructor(
    @Inject(VisionAnalysisService)
    private readonly vision: VisionAnalysisService,
  ) {}

  async extractContent(
    filename: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const extension = filename.split('.').pop()?.toLowerCase();

    if (extension === 'pdf' || mimeType === 'application/pdf') {
      const blob = new Blob([new Uint8Array(buffer)]);
      const loader = new WebPDFLoader(blob);
      const docs = await loader.load();
      return docs.map((d) => d.pageContent).join('\n');
    }

    if (
      extension === 'docx' ||
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const blob = new Blob([new Uint8Array(buffer)]);
      const loader = new DocxLoader(blob);
      const docs = await loader.load();
      return docs.map((d) => d.pageContent).join('\n');
    }

    if (extension === 'csv' || mimeType === 'text/csv') {
      const blob = new Blob([new Uint8Array(buffer)]);
      const loader = new CSVLoader(blob);
      const docs = await loader.load();
      return docs.map((d) => d.pageContent).join('\n');
    }

    if (
      extension === 'xlsx' ||
      mimeType ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetNames = workbook.SheetNames;
      const content = sheetNames
        .map((name) => {
          const sheet = workbook.Sheets[name];
          const data = XLSX.utils.sheet_to_csv(sheet);
          return `### Planilha: ${name}\n${data}`;
        })
        .join('\n\n');
      return content;
    }

    if (extension === 'txt' || mimeType === 'text/plain') {
      return buffer.toString('utf-8');
    }

    if (
      ['jpg', 'jpeg', 'png', 'webp'].includes(extension || '') ||
      mimeType?.startsWith('image/')
    ) {
      return this.vision.analyzeImage({ filename, buffer, mimeType });
    }

    return (
      buffer.toString('utf-8').slice(0, 2000) +
      '... [Conteúdo truncado ou formato não suportado]'
    );
  }
}
