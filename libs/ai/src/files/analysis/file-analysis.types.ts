export interface FileAnalysisInput {
  filename: string;
  buffer: Buffer;
  mimeType: string;
  hint?: string;
}

export interface PdfPageImage {
  name: string;
  mimeType: 'image/png';
  buffer: Buffer;
}

export interface PdfPageData {
  pageNumber: number;
  text: string;
  images: PdfPageImage[];
}

export interface PdfPageOverview {
  pageNumber: number;
  textLength: number;
  imageCount: number;
}
