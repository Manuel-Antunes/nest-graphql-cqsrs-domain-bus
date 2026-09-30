/**
 * Document Helper - utilities for document display and formatting
 */

// Constants for document processing
const PDF_PREFIX = 'PDF:';
const TIMESTAMP_PATTERN = /_\d{14}(?=\.pdf$)/; // Format: _YYYYMMDDHHMMSS before .pdf extension

/**
 * Checks if a document is a PDF based on its external link
 */
export const isPdfDocument = (
  externalLink: string | null | undefined
): boolean => {
  if (!externalLink) return false;
  return externalLink.startsWith(PDF_PREFIX);
};

/**
 * Formats the display link for documents
 * For PDF documents: removes 'PDF:' prefix and timestamp suffix
 * For regular URLs: returns as-is
 */
export const formatDocumentLink = (
  externalLink: string | null | undefined
): string => {
  if (!externalLink) return '';

  if (isPdfDocument(externalLink)) {
    // Remove 'PDF:' prefix
    const fullName = externalLink.substring(PDF_PREFIX.length);
    // Remove timestamp suffix if present
    return fullName.replace(TIMESTAMP_PATTERN, '');
  }

  return externalLink;
};
