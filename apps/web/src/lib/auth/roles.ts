export const SYSTEM_ROLES = ['user', 'author', 'admin'] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];
