import { ROOT_TENANT, ROOT_TENANT_SCHEMA, Tenant } from './tenant';

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
    it('a schema each, named after the tenant', () => {
      expect(Tenant.schemaOf('acme')).toBe('tenant_acme');
      expect(Tenant.schemaOf('  Globex ')).toBe('tenant_globex');
    });

    it('and the root tenant has one too, which is where whoever names none reads', () => {
      expect(Tenant.schemaOf(ROOT_TENANT)).toBe(ROOT_TENANT_SCHEMA);
      expect(Tenant.schemaOf('undefined')).toBe('tenant_root');
    });
  });
});
