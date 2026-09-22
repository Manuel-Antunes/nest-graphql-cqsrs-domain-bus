export const AUTHOR_ROLE = 'author';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string | null;
}

export interface Session {
  expiresAt: number;
  user: SessionUser;
  activeOrganizationId: string | null;
}

export function isAuthor(session: Session | null): boolean {
  return session?.user.role?.split(',').some((role) => role.trim() === AUTHOR_ROLE) ?? false;
}
