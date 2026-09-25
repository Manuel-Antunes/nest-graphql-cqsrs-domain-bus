import { AuthRoles } from './auth-roles';

describe('AuthRoles', () => {
  it('adds a role beside the ones already held, once', () => {
    expect(AuthRoles.adding('user', 'author')).toBe('user,author');
    expect(AuthRoles.adding('admin, user', 'author')).toBe('admin,user,author');
    expect(AuthRoles.adding('user,author', 'author')).toBe('user,author');
  });

  it('removes only the role asked for, and falls back to user when none is left', () => {
    expect(AuthRoles.removing('admin,author', 'author')).toBe('admin');
    expect(AuthRoles.removing('author', 'author')).toBe('user');
    expect(AuthRoles.removing('user', 'author')).toBe('user');
  });

  it('reads a role list whether Better Auth hands it over as text or as an array', () => {
    expect(AuthRoles.of(['admin', 'author'])).toEqual(['admin', 'author']);
    expect(AuthRoles.of(null)).toEqual([]);
    expect(AuthRoles.adding(null, 'author')).toBe('author');
  });
});
