export const SYSTEM_ADMIN_ROLE = 'admin';

export const SYSTEM_USER_ROLE = 'user';

export const SYSTEM_ROLES = [SYSTEM_ADMIN_ROLE, SYSTEM_USER_ROLE] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];
