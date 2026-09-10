import { MikroORM } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import { Tag } from '../../../../domain/tag/tag.entity';
import { TagSchema } from '../entities/tag-orm.entity';
import { TagId } from '../../../../domain/tag/vo/tag-id';
import { TagName } from '../../../../domain/tag/vo/tag-name';
import { valueObjectType } from './value-object-type';

/**
 * A ponte entre o value object e a coluna, exercitada onde ela realmente vive: uma entidade de
 * verdade, num SQLite de verdade.
 *
 * A `Tag` serve porque tem os dois casos num agregado minúsculo — um value object na **chave
 * primária** (`TagId`) e outro numa coluna comum (`TagName`). O que estes testes travam é a promessa
 * do `valueObjectType`: por dentro é objeto, no banco é texto, e nenhum dos dois lados precisa saber
 * do outro.
 */
describe('valueObjectType', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init(
      defineConfig({ dbName: ':memory:', entities: [TagSchema], ensureDatabase: { create: true } }),
    );
  });

  afterAll(() => orm.close(true));

  // `TagName` é único no banco, e o SQLite em memória é o mesmo para todo o arquivo: cada teste
  // semeia o seu próprio nome.
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
      .execute('select id, name from tags where id = ?', [id.value]);

    // Nada de `{"value":…}` na coluna: o que o banco vê é o mesmo texto de sempre.
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

    // Instância nova, mesmo valor: é o `compareAsType()` que impede um UPDATE inútil aqui.
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

  /**
   * As quatro travessias vistas de perto, sem o ORM no meio.
   *
   * Os testes acima provam que a ponte funciona **em uso**; estes cobrem as bordas que o uso normal
   * nunca visita e que são justamente as que quebram calado: uma coluna nula, um valor que já é
   * value object (o ORM re-hidrata o mesmo objeto em alguns caminhos) e a assimetria deliberada entre
   * `convertToJSValue`, que **não valida**, e `fromJSON`, que valida — porque um cursor é dado do
   * cliente e o banco não é.
   */
  describe('as travessias, uma a uma', () => {
    const TagIdType = valueObjectType(TagId, { columnType: 'varchar(36)' });
    const type = new TagIdType();
    const uuid = '5f7a1c7e-4d0b-4b7a-9e3c-1a2b3c4d5e6f';
    /**
     * O `Type` do MikroORM recebe a `Platform` (e, no `getColumnType`, a `EntityProperty`) em todo
     * método. Nenhuma das travessias daqui olha para elas, então o teste passa um duplo vazio — é o
     * que deixa visível que a conversão depende só do value object.
     */
    const platform = {} as any;
    const prop = {} as any;

    it('a coluna nula atravessa como nula nos dois sentidos', () => {
      // Assert
      expect(type.convertToDatabaseValue(null as any, platform)).toBeNull();
      expect(type.convertToDatabaseValue(undefined, platform)).toBeUndefined();
      expect(type.convertToJSValue(null as any, platform)).toBeNull();
      expect(type.convertToJSValue(undefined, platform)).toBeUndefined();
      expect(type.toJSON(null as any, platform)).toBeNull();
      expect((type as any).fromJSON(null, platform)).toBeNull();
    });

    it('escrever desembrulha o value object; desembrulhar o que já é cru é a identidade', () => {
      // Assert
      expect(type.convertToDatabaseValue(TagId.parse(uuid), platform)).toBe(uuid);
      expect(type.convertToDatabaseValue(uuid as any, platform)).toBe(uuid);
    });

    it('hidratar envolve o texto, e devolve intacto o que já é value object', () => {
      // Arrange
      const already = TagId.parse(uuid);

      // Act / Assert
      expect(type.convertToJSValue(uuid, platform)).toBeInstanceOf(TagId);
      expect(type.convertToJSValue(already as any, platform)).toBe(already);
    });

    /**
     * Hidratar **não** valida: o banco é fonte confiável, e revalidar toda coluna de toda linha
     * custaria um `safeParse` por leitura. Quem valida é a fronteira.
     */
    it('hidratar não valida — é a escolha, não um descuido', () => {
      // Act / Assert
      expect(() => type.convertToJSValue('não é uuid', platform)).not.toThrow();
    });

    /** Um cursor vem do cliente. Aqui o `parse` vale a pena, e um valor impossível para na porta. */
    it('o cursor de volta valida, ao contrário da hidratação', () => {
      // Assert
      expect((type as any).fromJSON(uuid, platform)).toBeInstanceOf(TagId);
      expect(() => (type as any).fromJSON('não é uuid', platform)).toThrow();
    });

    it('serializar entrega o texto cru, e não o objeto', () => {
      // Assert
      expect(type.toJSON(TagId.parse(uuid) as any, platform)).toBe(uuid);
    });

    it('o tipo da coluna e o modo de comparação vêm das opções', () => {
      // Arrange
      const DateLike = valueObjectType(TagId, { columnType: 'text', compareAs: 'date' });

      // Assert
      expect(type.getColumnType(prop, platform)).toBe('varchar(36)');
      expect(type.compareAsType()).toBe('string');
      expect(new DateLike().getColumnType(prop, platform)).toBe('text');
      expect(new DateLike().compareAsType()).toBe('date');
    });

    /** O nome sai da classe do value object: é o que aparece em erro de schema e em log. */
    it('o tipo gerado se chama como o value object que ele carrega', () => {
      // Assert
      expect(TagIdType.name).toBe('TagIdType');
    });
  });
});
