import { MikroORM } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import { PostId } from '../../domain/post/vo/post-id';
import type { Author } from '../../domain/user/author.entity';
import { AUTHOR_ROLE } from '../../domain/user/user.entity';
import { Users } from '../../domain/user/user.factory';
import { UserId } from '../../domain/user/vo/user-id';
import { PostSchema } from '../../infrastructure/persistence/sqlite/entities/post-orm.entity';
import { TagSchema } from '../../infrastructure/persistence/sqlite/entities/tag-orm.entity';
import {
  AuthorSchema,
  ReaderSchema,
  UserSchema,
} from '../../infrastructure/persistence/sqlite/entities/user-orm.entity';
import { CreatePostInput } from '../../dto/graphql/create-post.input';
import { UpdatePostInput } from '../../dto/graphql/update-post.input';
import { PostInputMapper } from './post-input.mapper';

/**
 * Protocolo → aplicação. O salto é curto, mas concentra três decisões que o resolver não repete:
 *
 * 1. **o autor vem por parâmetro, não pelo input** — é o que impede alguém publicar em nome de outro
 *    escrevendo outro nome no corpo. O que segue para o command é o retrato (id e nome), e não o
 *    agregado;
 * 2. **o id de um post novo nasce aqui** (`PostId.generate()`), e é ele que vira a chave da
 *    `PostRequest` que a mutation abre;
 * 3. **o `id` do update passa por `assertValid()`** — um id que não é UUID não chega ao command.
 *
 * O `@Args` do @nestjs/graphql entrega **objeto cru**: ele não instancia a classe do `@InputType`. É
 * por isso que os testes abaixo passam literais em vez de instâncias — é o que o resolver recebe de
 * verdade, e o mapper é quem materializa os value objects.
 */
describe('PostInputMapper', () => {
  let orm: MikroORM;
  const mapper = new PostInputMapper();

  beforeAll(async () => {
    orm = await MikroORM.init(
      defineConfig({
        dbName: ':memory:',
        entities: [PostSchema, TagSchema, UserSchema, ReaderSchema, AuthorSchema],
      }),
    );
  });

  afterAll(() => orm.close());

  const authorId = UserId.parse('9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60');
  const postId = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');

  const anAuthor = (name = 'manuel'): Author => {
    const user = Users.register(
      authorId,
      { email: 'manuel@example.com', name },
      AUTHOR_ROLE,
      new Date('2026-09-08T12:00:00.000Z'),
    );
    if (!user.canWritePosts()) {
      throw new Error('AUTHOR_ROLE precisa nascer Author');
    }
    return user;
  };

  /** Como o resolver recebe: objeto cru, sem passar pelo construtor do `@InputType`. */
  const rawCreate = (input: { title: string; content: string }) => input as unknown as CreatePostInput;
  const rawUpdate = (input: Record<string, unknown>) => input as unknown as UpdatePostInput;

  describe('toCreateCommand', () => {
    it('materializa os value objects do input cru e entrega o valor ao command', () => {
      // Act
      const command = mapper.toCreateCommand(rawCreate({ title: '  Nest + GraphQL  ', content: ' oi ' }), anAuthor());

      // Assert — o command fala em primitivos; a normalização já aconteceu na travessia
      expect(command.title).toBe('Nest + GraphQL');
      expect(command.content).toBe('oi');
    });

    /**
     * A regra que o mapper existe para não deixar ninguém esquecer: o autor é **o da sessão**. Nada no
     * `CreatePostInput` sequer tem onde escrever outro nome — e é isso que o teste fixa.
     */
    it('o autor sai do parâmetro, e o que segue é o retrato: id e nome', () => {
      // Act
      const command = mapper.toCreateCommand(rawCreate({ title: 't', content: 'c' }), anAuthor('Manuel Antunes'));

      // Assert
      expect(command.authorId.equals(authorId)).toBe(true);
      expect(command.authorName.value).toBe('Manuel Antunes');
      expect(Object.keys(rawCreate({ title: 't', content: 'c' }))).not.toContain('author');
    });

    it('gera um id novo por chamada — é a chave da PostRequest que a mutation abre', () => {
      // Act
      const first = mapper.toCreateCommand(rawCreate({ title: 't', content: 'c' }), anAuthor());
      const second = mapper.toCreateCommand(rawCreate({ title: 't', content: 'c' }), anAuthor());

      // Assert
      expect(first.postId).toBeInstanceOf(PostId);
      expect(first.postId.equals(second.postId)).toBe(false);
    });

    /**
     * Construir um DTO não lança — quem valida é o domínio, no command handler. O mapper deixa passar
     * o título em branco e o `PostTitle` do agregado é quem recusa, com a mensagem do domínio.
     */
    it('não valida: um título em branco atravessa e é o domínio que recusa depois', () => {
      // Act / Assert
      expect(() => mapper.toCreateCommand(rawCreate({ title: '   ', content: 'c' }), anAuthor())).not.toThrow();
    });
  });

  describe('toUpdateCommand', () => {
    it('leva o id como value object e os dois campos opcionais como valor', () => {
      // Act
      const command = mapper.toUpdateCommand(
        rawUpdate({ id: postId.value, title: '  editado  ', content: ' novo ' }),
      );

      // Assert
      expect(command.postId.equals(postId)).toBe(true);
      expect(command.title).toBe('editado');
      expect(command.content).toBe('novo');
    });

    it('ausente e null querem dizer o mesmo: manter o valor atual', () => {
      // Act
      const semNada = mapper.toUpdateCommand(rawUpdate({ id: postId.value }));
      const comNull = mapper.toUpdateCommand(rawUpdate({ id: postId.value, title: null, content: null }));

      // Assert
      expect(semNada.title).toBeUndefined();
      expect(semNada.content).toBeUndefined();
      expect(comNull.title).toBeUndefined();
      expect(comNull.content).toBeUndefined();
    });

    it('só o título muda, e o conteúdo fica de fora do command', () => {
      // Act
      const command = mapper.toUpdateCommand(rawUpdate({ id: postId.value, title: 'só o título' }));

      // Assert
      expect(command.title).toBe('só o título');
      expect(command.content).toBeUndefined();
    });

    /** `assertValid()` é a exceção à regra de "o mapper não valida": um id impossível para aqui. */
    it('um id que não é UUID não chega ao command', () => {
      // Act / Assert
      expect(() => mapper.toUpdateCommand(rawUpdate({ id: 'nem-uuid', title: 't' }))).toThrow();
    });
  });
});
