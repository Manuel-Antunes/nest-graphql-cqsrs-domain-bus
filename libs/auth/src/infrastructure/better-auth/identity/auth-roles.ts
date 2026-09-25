import { SYSTEM_USER_ROLE } from '../../../domain/auth/roles';

export class AuthRoles {
  static of(stored: string | readonly string[] | null | undefined): string[] {
    const roles =
      typeof stored === 'string' || stored == null
        ? (stored ?? '').split(',')
        : [...stored];
    return roles.map((role) => role.trim()).filter(Boolean);
  }

  static adding(
    stored: string | readonly string[] | null | undefined,
    role: string,
  ): string {
    const roles = AuthRoles.of(stored);
    return AuthRoles.stored(roles.includes(role) ? roles : [...roles, role]);
  }

  static removing(
    stored: string | readonly string[] | null | undefined,
    role: string,
  ): string {
    return AuthRoles.stored(
      AuthRoles.of(stored).filter((held) => held !== role),
    );
  }

  private static stored(roles: readonly string[]): string {
    return (roles.length > 0 ? roles : [SYSTEM_USER_ROLE]).join(',');
  }
}
