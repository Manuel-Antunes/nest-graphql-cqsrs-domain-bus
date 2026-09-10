import { instanceToPlain, plainToInstance } from 'class-transformer';
import { GraphQLID, GraphQLString } from 'graphql';
import { PostContent } from '../../domain/post/vo/post-content';
import { PostId } from '../../domain/post/vo/post-id';
import { PostTitle } from '../../domain/post/vo/post-title';
import { TagId } from '../../domain/tag/vo/tag-id';
import { TagName } from '../../domain/tag/vo/tag-name';
import { UserId } from '../../domain/user/vo/user-id';
import { PageInfo } from './connection';
import { CreatePostInput } from './create-post.input';
import { PostView } from './post.view';
import { TagView } from './tag.view';
import { UpdatePostInput } from './update-post.input';

/**
 * Os DTOs do protocolo depois de virarem classes geradas.
 *
 * O que estes testes defendem é a fronteira: **por dentro** os campos são value objects, **por fora**
 * o que sai é exatamente o que saía antes — o cliente do GraphQL não pode notar a mudança. O
 * `schema.gql` gerado é a outra metade desta garantia, e a subida do `test:e2e` o regera.
 */
describe('DTOs do protocolo', () => {
  // O que o protocolo carrega é o texto: os ids do spec são o valor no fio.
  const id = PostId.generate().value;
  const tagId = TagId.generate().value;
  const authorId = UserId.generate().value;
  const createdAt = new Date('2024-01-15T10:30:00.000Z');
  const updatedAt = new Date('2024-01-20T15:45:00.000Z');

  const viewOf = () =>
    new PostView({
      id,
      title: '  Nest + GraphQL  ',
      content: 'conteúdo',
      authorId,
      createdAt,
      updatedAt,
      version: 2,
      tags: [new TagView({ id: tagId, name: 'Untagged' })],
    });

  describe('PostView', () => {
    it('monta os value objects a partir dos valores crus', () => {
      // Arrange / Act
      const view = viewOf();

      // Assert
      expect(view.id).toBeInstanceOf(PostId);
      expect(view.title).toBeInstanceOf(PostTitle);
      expect(view.content).toBeInstanceOf(PostContent);
      expect(view.authorId).toBeInstanceOf(UserId);
      expect(view.createdAt).toBe(createdAt);
      expect(view.version).toBe(2);
    });

    it('normaliza pelo schema do domínio na travessia', () => {
      // Arrange / Act
      const view = viewOf();

      // Assert
      expect(view.title.value).toBe('Nest + GraphQL');
    });

    it('serializa exatamente no shape do protocolo', () => {
      // Arrange
      const view = viewOf();

      // Act
      const plain = instanceToPlain(view, { excludeExtraneousValues: true });

      // Assert
      expect(plain).toEqual({
        id,
        title: 'Nest + GraphQL',
        content: 'conteúdo',
        authorId,
        createdAt,
        updatedAt,
        version: 2,
      });
    });

    it('os scalars do GraphQL enxergam o primitivo', () => {
      // Arrange
      const view = viewOf();

      // Act / Assert — é o caminho que o graphql-js percorre ao serializar um campo
      expect(GraphQLID.serialize(view.id)).toBe(id);
      expect(GraphQLString.serialize(view.title)).toBe('Nest + GraphQL');
      expect(GraphQLID.serialize(view.authorId)).toBe(authorId);
    });

    it('volta de um objeto cru pelo class-transformer', () => {
      // Arrange
      const plain = instanceToPlain(viewOf(), { excludeExtraneousValues: true });

      // Act
      const view = plainToInstance(PostView, plain);

      // Assert
      expect(view.id).toBeInstanceOf(PostId);
      expect(view.id.equals(id)).toBe(true);
      expect(view.title.value).toBe('Nest + GraphQL');
    });

    it('as tags ficam fora do schema — elas são do resolver, não do shape', () => {
      // Arrange
      const view = viewOf();

      // Act
      const plain = instanceToPlain(view, { excludeExtraneousValues: true });

      // Assert
      expect(view.tags[0]).toBeInstanceOf(TagView);
      expect(plain).not.toHaveProperty('tags');
    });
  });

  describe('TagView', () => {
    it('monta os value objects e volta a colapsar', () => {
      // Arrange / Act
      const tag = new TagView({ id: tagId, name: '  Untagged  ' });

      // Assert
      expect(tag.id).toBeInstanceOf(TagId);
      expect(tag.name).toBeInstanceOf(TagName);
      expect(instanceToPlain(tag)).toEqual({ id: tagId, name: 'Untagged' });
      expect(GraphQLString.serialize(tag.name)).toBe('Untagged');
    });
  });

  describe('CreatePostInput', () => {
    it('materializa os args crus que o Nest entrega', () => {
      // Arrange — é o objeto cru que chega no `@Args('input')`
      const args = { title: '  Nest + GraphQL  ', content: 'oi' } as any;

      // Act
      const input = new CreatePostInput(args);

      // Assert
      expect(input.title).toBeInstanceOf(PostTitle);
      expect(input.title.value).toBe('Nest + GraphQL');
      expect(input.content.value).toBe('oi');
    });

    it('não lança num valor inválido — quem valida é o domínio', () => {
      // Arrange / Act
      const input = new CreatePostInput({ title: '   ', content: 'oi' } as any);

      // Assert
      expect(input.title.isValid()).toBe(false);
      expect(input.title.value).toBe('   ');
    });

    it('reconstruir um DTO já montado é idempotente', () => {
      // Arrange
      const input = new CreatePostInput({ title: 'Olá', content: 'oi' } as any);

      // Act
      const again = new CreatePostInput(input);

      // Assert
      expect(again.title.value).toBe('Olá');
    });
  });

  describe('UpdatePostInput', () => {
    it('deixa passar os campos ausentes como "manter o valor atual"', () => {
      // Arrange / Act
      const input = new UpdatePostInput({ id } as any);

      // Assert
      expect(input.id).toBeInstanceOf(PostId);
      expect(input.title).toBeUndefined();
      expect(input.content).toBeUndefined();
    });

    it('preserva o null explícito', () => {
      // Arrange / Act
      const input = new UpdatePostInput({ id, title: null, content: 'novo' } as any);

      // Assert
      expect(input.title).toBeNull();
      expect(input.content).toBeInstanceOf(PostContent);
    });

    it('um id que não é uuid não passa do assertValid', () => {
      // Arrange
      const input = new UpdatePostInput({ id: 'não é uuid' } as any);

      // Act / Assert
      expect(() => input.id.assertValid()).toThrow();
    });
  });

  describe('PageInfo', () => {
    it('mantém o shape da spec de Relay', () => {
      // Arrange / Act
      const pageInfo = new PageInfo({
        hasNextPage: true,
        hasPreviousPage: false,
        startCursor: 'MQ==',
        endCursor: null,
      });

      // Assert
      expect(instanceToPlain(pageInfo, { excludeExtraneousValues: true })).toEqual({
        hasNextPage: true,
        hasPreviousPage: false,
        startCursor: 'MQ==',
        endCursor: null,
      });
    });
  });
});
