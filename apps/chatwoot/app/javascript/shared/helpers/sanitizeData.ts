export const labelSanitizePattern = /[^a-zA-Z0-9_-]/g;
export const spacesPattern = /\s+/g;

/**
 * Sanitizes a label by removing unwanted characters and replacing spaces with hyphens.
 *
 * @param label - The label to sanitize.
 * @returns The sanitized label.
 *
 * @example
 * const label = 'My Label 123';
 * const sanitizedLabel = sanitizeLabel(label); // 'my-label-123'
 */
export const sanitizeLabel = (label: string | undefined | null = ''): string => {
  if (!label) return '';

  return label
    .trim()
    .toLowerCase()
    .replace(spacesPattern, '-')
    .replace(labelSanitizePattern, '');
};
