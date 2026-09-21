import { instanceToPlain, plainToInstance } from 'class-transformer';
import { GraphQLID, GraphQLString } from 'graphql';
import { PostContent } from '@nestposts/posts/domain/post/vo/post-content';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { PostTitle } from '@nestposts/posts/domain/post/vo/post-title';
import { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';
import { TagName } from '@nestposts/posts/domain/tag/vo/tag-name';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { PageInfo } from './connection';
import { CreatePostInput } from './create-post.input';
import { PostView } from './post.view';
import { TagView } from './tag.view';
import { UpdatePostInput } from './update-post.input';

describe('DTOs do protocolo', () => {
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
      const view = viewOf();

      expect(view.id).toBeInstanceOf(PostId);
      expect(view.title).toBeInstanceOf(PostTitle);
      expect(view.content).toBeInstanceOf(PostContent);
      expect(view.authorId).toBeInstanceOf(UserId);
      expect(view.createdAt).toBe(createdAt);
      expect(view.version).toBe(2);
    });

    it('normaliza pelo schema do domínio na travessia', () => {
      const view = viewOf();

      expect(view.title.value).toBe('Nest + GraphQL');
    });

    it('serializa exatamente no shape do protocolo', () => {
      const view = viewOf();

      const plain = instanceToPlain(view, { excludeExtraneousValues: true });

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
      const view = viewOf();

      expect(GraphQLID.serialize(view.id)).toBe(id);
      expect(GraphQLString.serialize(view.title)).toBe('Nest + GraphQL');
      expect(GraphQLID.serialize(view.authorId)).toBe(authorId);
    });

    it('volta de um objeto cru pelo class-transformer', () => {
      const plain = instanceToPlain(viewOf(), { excludeExtraneousValues: true });

      const view = plainToInstance(PostView, plain);

      expect(view.id).toBeInstanceOf(PostId);
      expect(view.id.equals(id)).toBe(true);
      expect(view.title.value).toBe('Nest + GraphQL');
    });

    it('as tags ficam fora do schema — elas são do resolver, não do shape', () => {
      const view = viewOf();

      const plain = instanceToPlain(view, { excludeExtraneousValues: true });

      expect(view.tags[0]).toBeInstanceOf(TagView);
      expect(plain).not.toHaveProperty('tags');
    });
  });

  describe('TagView', () => {
    it('monta os value objects e volta a colapsar', () => {
      const tag = new TagView({ id: tagId, name: '  Untagged  ' });

      expect(tag.id).toBeInstanceOf(TagId);
      expect(tag.name).toBeInstanceOf(TagName);
      expect(instanceToPlain(tag)).toEqual({ id: tagId, name: 'Untagged' });
      expect(GraphQLString.serialize(tag.name)).toBe('Untagged');
    });
  });

  describe('CreatePostInput', () => {
    it('materializa os args crus que o Nest entrega', () => {
      const args = { title: '  Nest + GraphQL  ', content: 'oi' } as any;

      const input = new CreatePostInput(args);

      expect(input.title).toBeInstanceOf(PostTitle);
      expect(input.title.value).toBe('Nest + GraphQL');
      expect(input.content.value).toBe('oi');
    });

    it('não lança num valor inválido — quem valida é o domínio', () => {
      const input = new CreatePostInput({ title: '   ', content: 'oi' } as any);

      expect(input.title.isValid()).toBe(false);
      expect(input.title.value).toBe('   ');
    });

    it('reconstruir um DTO já montado é idempotente', () => {
      const input = new CreatePostInput({ title: 'Olá', content: 'oi' } as any);

      const again = new CreatePostInput(input);

      expect(again.title.value).toBe('Olá');
    });
  });

  describe('UpdatePostInput', () => {
    it('deixa passar os campos ausentes como "manter o valor atual"', () => {
      const input = new UpdatePostInput({ id } as any);

      expect(input.id).toBeInstanceOf(PostId);
      expect(input.title).toBeUndefined();
      expect(input.content).toBeUndefined();
    });

    it('preserva o null explícito', () => {
      const input = new UpdatePostInput({ id, title: null, content: 'novo' } as any);

      expect(input.title).toBeNull();
      expect(input.content).toBeInstanceOf(PostContent);
    });

    it('um id que não é uuid não passa do assertValid', () => {
      const input = new UpdatePostInput({ id: 'não é uuid' } as any);

      expect(() => input.id.assertValid()).toThrow();
    });
  });

  describe('PageInfo', () => {
    it('mantém o shape da spec de Relay', () => {
      const pageInfo = new PageInfo({
        hasNextPage: true,
        hasPreviousPage: false,
        startCursor: 'MQ==',
        endCursor: null,
      });

      expect(instanceToPlain(pageInfo, { excludeExtraneousValues: true })).toEqual({
        hasNextPage: true,
        hasPreviousPage: false,
        startCursor: 'MQ==',
        endCursor: null,
      });
    });
  });
});
