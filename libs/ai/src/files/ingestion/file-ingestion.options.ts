export interface FileIngestionOptions {
  attachmentPathPrefix: string;
  mode: 'eager' | 'lazy';
  diskName?: string;
  rootPrefix?: string;
  inlineImageDataUri?: boolean;
  postAnalysisInstructions?: string | (() => Promise<string> | string);
}
