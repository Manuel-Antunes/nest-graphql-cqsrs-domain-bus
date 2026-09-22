import { ROOT_TENANT, Tenant } from './tenant';
import { SchemaPerTenant, SharedSchemaTenants } from './tenant-schemas';

describe('the tenant a request names', () => {
  describe('normalizing what arrived', () => {
    it('takes a name as a name, trimmed and lowercased', () => {
      expect(Tenant.normalize('  Acme  ')).toBe('acme');
      expect(Tenant.normalize('acme')).toBe('acme');
    });

    it('reads the first value when a header repeats', () => {
      expect(Tenant.normalize(['acme', 'globex'])).toBe('acme');
    });

    it('treats the absence of a tenant as the root one', () => {
      expect(Tenant.normalize(undefined)).toBe(ROOT_TENANT);
      expect(Tenant.normalize(null)).toBe(ROOT_TENANT);
      expect(Tenant.normalize('')).toBe(ROOT_TENANT);
      expect(Tenant.normalize('   ')).toBe(ROOT_TENANT);
      expect(Tenant.normalize(42)).toBe(ROOT_TENANT);
    });

    it('treats a producer interpolated nothing as the root one too', () => {
      expect(Tenant.normalize('undefined')).toBe(ROOT_TENANT);
      expect(Tenant.normalize('null')).toBe(ROOT_TENANT);
      expect(Tenant.normalize('UNDEFINED')).toBe(ROOT_TENANT);
    });

    it('says which name is the root one', () => {
      expect(Tenant.isRoot(ROOT_TENANT)).toBe(true);
      expect(Tenant.isRoot('acme')).toBe(false);
    });
  });

  describe('where a tenant rows live', () => {
    it('shared: every tenant reads the connection own schema', () => {
      const schemas = new SharedSchemaTenants();

      expect(schemas.schemaFor(ROOT_TENANT)).toBeUndefined();
      expect(schemas.schemaFor('acme')).toBeUndefined();
    });

    it('per tenant: a schema each, and the root one stays where the connection points', () => {
      const schemas = new SchemaPerTenant('posts');

      expect(schemas.schemaFor('acme')).toBe('posts_acme');
      expect(schemas.schemaFor(ROOT_TENANT)).toBeUndefined();
    });
  });
});
