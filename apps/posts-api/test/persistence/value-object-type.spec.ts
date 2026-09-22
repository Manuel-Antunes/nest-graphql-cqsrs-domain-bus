import { closeTestDatabase, tableIn, testDatabase } from '@nestposts/database/testing';
import { MikroORM } from '@mikro-orm/core';
import { Tag } from '@nestposts/posts/domain/tag/tag.entity';
import { TagSchema } from '@nestposts/posts/infrastructure/persistence/entities/tag-orm.entity';
import { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';
import { TagName } from '@nestposts/posts/domain/tag/vo/tag-name';
import { valueObjectType } from '@nestposts/database';

describe('valueObjectType', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await testDatabase({ entities: [TagSchema] });
  });

  afterAll(() => closeTestDatabase(orm));

  let seq = 0;
  const givenATag = async (name = `tag-${++seq}`) => {
    const em = orm.em.fork();
    const tag = Tag.create(TagId.generate(), name, new Date());
    await em.persist(tag).flush();
    return tag.id;
  };

  it('hidrata a coluna como value object', async () => {
    const id = await givenATag();

    const tag = await orm.em.fork().findOneOrFail(Tag, { id });

    expect(tag.id).toBeInstanceOf(TagId);
    expect(tag.name).toBeInstanceOf(TagName);
    expect(tag.id.equals(id)).toBe(true);
  });

  it('a coluna no banco continua guardando o texto', async () => {
    const id = await givenATag('texto puro');

    const [row] = await orm.em
      .fork()
      .getConnection()
      .execute(`select id, name from ${tableIn(orm, 'tags')} where id = ?`, [id.value]);

    expect(row).toEqual({ id: id.value, name: 'texto puro' });
  });

  it('a consulta aceita o value object e o texto cru', async () => {
    const id = await givenATag();
    const em = orm.em.fork();

    const byValueObject = await em.findOne(Tag, { id });
    const byRawText = await orm.em.fork().findOne(Tag, { id: id.value as any });

    expect(byValueObject?.id.equals(id)).toBe(true);
    expect(byRawText?.id.equals(id)).toBe(true);
  });

  it('o unique da coluna vale sobre o valor, não sobre o objeto', async () => {
    await givenATag('única');

    await expect(givenATag('única')).rejects.toThrow(/UNIQUE|unique/i);
  });

  it('trocar o value object marca a linha como suja', async () => {
    const id = await givenATag();
    const em = orm.em.fork();

    const tag = await em.findOneOrFail(Tag, { id });
    tag.name = TagName.parse('renomeada');
    await em.flush();

    const again = await orm.em.fork().findOneOrFail(Tag, { id });
    expect(again.name.value).toBe('renomeada');
    expect(again.name).toBeInstanceOf(TagName);
  });

  it('trocar por um value object de valor igual não gera update', async () => {
    const id = await givenATag();
    const em = orm.em.fork();
    const tag = await em.findOneOrFail(Tag, { id });

    tag.name = TagName.parse(tag.name.value);
    em.getUnitOfWork().computeChangeSets();

    expect(em.getUnitOfWork().getChangeSets()).toHaveLength(0);
  });

  it('o cursor de paginação carrega o texto, e volta validado', async () => {
    await givenATag('a');
    await givenATag('b');
    const em = orm.em.fork();

    const page = await em.findByCursor(Tag, { first: 1, orderBy: { name: 'asc', id: 'asc' } });
    const next = await orm.em
      .fork()
      .findByCursor(Tag, { first: 1, after: page.endCursor!, orderBy: { name: 'asc', id: 'asc' } });

    expect(page.items[0].name).toBeInstanceOf(TagName);
    expect(next.items[0].id.equals(page.items[0].id)).toBe(false);
  });

  it('um cursor forjado não vira value object impossível', async () => {
    await givenATag();
    const forged = Buffer.from(JSON.stringify(['a', 'não é uuid'])).toString('base64url');

    await expect(
      orm.em.fork().findByCursor(Tag, { first: 1, after: forged, orderBy: { name: 'asc', id: 'asc' } }),
    ).rejects.toThrow();
  });

  describe('as travessias, uma a uma', () => {
    const TagIdType = valueObjectType(TagId, { columnType: 'varchar(36)' });
    const type = new TagIdType();
    const uuid = '5f7a1c7e-4d0b-4b7a-9e3c-1a2b3c4d5e6f';
    const platform = {} as any;
    const prop = {} as any;

    it('a coluna nula atravessa como nula nos dois sentidos', () => {
      expect(type.convertToDatabaseValue(null as any, platform)).toBeNull();
      expect(type.convertToDatabaseValue(undefined, platform)).toBeUndefined();
      expect(type.convertToJSValue(null as any, platform)).toBeNull();
      expect(type.convertToJSValue(undefined, platform)).toBeUndefined();
      expect(type.toJSON(null as any, platform)).toBeNull();
      expect((type as any).fromJSON(null, platform)).toBeNull();
    });

    it('escrever desembrulha o value object; desembrulhar o que já é cru é a identidade', () => {
      expect(type.convertToDatabaseValue(TagId.parse(uuid), platform)).toBe(uuid);
      expect(type.convertToDatabaseValue(uuid as any, platform)).toBe(uuid);
    });

    it('hidratar envolve o texto, e devolve intacto o que já é value object', () => {
      const already = TagId.parse(uuid);

      expect(type.convertToJSValue(uuid, platform)).toBeInstanceOf(TagId);
      expect(type.convertToJSValue(already as any, platform)).toBe(already);
    });

    it('hidratar não valida — é a escolha, não um descuido', () => {
      expect(() => type.convertToJSValue('não é uuid', platform)).not.toThrow();
    });

    it('o cursor de volta valida, ao contrário da hidratação', () => {
      expect((type as any).fromJSON(uuid, platform)).toBeInstanceOf(TagId);
      expect(() => (type as any).fromJSON('não é uuid', platform)).toThrow();
    });

    it('serializar entrega o texto cru, e não o objeto', () => {
      expect(type.toJSON(TagId.parse(uuid) as any, platform)).toBe(uuid);
    });

    it('o tipo da coluna e o modo de comparação vêm das opções', () => {
      const DateLike = valueObjectType(TagId, { columnType: 'text', compareAs: 'date' });

      expect(type.getColumnType(prop, platform)).toBe('varchar(36)');
      expect(type.compareAsType()).toBe('string');
      expect(new DateLike().getColumnType(prop, platform)).toBe('text');
      expect(new DateLike().compareAsType()).toBe('date');
    });

    it('o tipo gerado se chama como o value object que ele carrega', () => {
      expect(TagIdType.name).toBe('TagIdType');
    });
  });
});
