import { ForeignKeyConstraintViolationException } from '@mikro-orm/core';
import { CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { createCqrsTestingModule, freshEm, RecordingEvents, inRequestContext } from '../../../../test/support/cqrs-testing-module';
import { givenAnAuthor, givenAPost, givenAReader } from '../../../../test/support/post-fixtures';
import { PostCreatedEvent } from '../../../domain/post/event/post-created.event';
import { InvalidPostException } from '../../../domain/post/exception/invalid-post.exception';
import { PostAlreadyExistsException } from '../../../domain/post/exception/post-already-exists.exception';
import { Post } from '../../../domain/post/post.entity';
import { PostContent } from '../../../domain/post/vo/post-content';
import { PostTitle } from '../../../domain/post/vo/post-title';
import { PostId } from '../../../domain/post/vo/post-id';
import { UserId } from '../../../domain/user/vo/user-id';
import { UserName } from '../../../domain/user/vo/user-name';
import { PostRequest } from '../../shared/post-request';
import { CreatePostCommand } from './create-post.command';

/**
 * O handler é `{ scope: Scope.REQUEST }`, então não existe "a" instância dele para pegar do módulo:
 * o teste despacha pelo `CommandBus`, que é quem resolve o handler no `ContextId` da `PostRequest` —
 * o mesmo caminho que o `PostMutationResolver` percorre.
 */
describe('CreatePostCommand.Handler', () => {
  let module: TestingModule;
  let commands: CommandBus;
  let events: RecordingEvents;
  /** Todo post precisa de um autor: a relação com `User` é obrigatória. */
  let author: Awaited<ReturnType<typeof givenAnAuthor>>;

  const execute = (command: CreatePostCommand.CreatePost) =>
    inRequestContext(module, () => commands.execute(command, new PostRequest(command.postId)));

  beforeEach(async () => {
    module = await createCqrsTestingModule([CreatePostCommand.Handler]);
    commands = module.get(CommandBus);
    author = await givenAnAuthor(module);
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('publishes PostCreated and returns the id', async () => {
    const id = PostId.generate();

    const result = await execute(new CreatePostCommand.CreatePost(id, ' Nest + GraphQL ', 'oi', author.id, author.name));

    expect(result.equals(id)).toBe(true);
    expect(events.events).toEqual([new PostCreatedEvent(id.value, 'Nest + GraphQL', 'oi', author.id.value, 'manuel', expect.any(Date))]);
  });

  it('saves the post within the command', async () => {
    const id = PostId.generate();
    await execute(new CreatePostCommand.CreatePost(id, 'Nest + GraphQL', 'oi', author.id, author.name));

    const saved = await freshEm(module).findOneOrFail(Post, { id }, { populate: ['tags', 'author'] });

    expect(saved).toMatchObject({
      id,
      title: PostTitle.parse('Nest + GraphQL'),
      content: PostContent.parse('oi'),
      version: 1,
    });
    expect(saved.author.id.equals(author.id)).toBe(true);
    expect(saved.tags.getItems()).toEqual([]);
    expect(saved.createdAt).toEqual(saved.updatedAt);
    expect(saved.getUncommittedEvents()).toEqual([]);
  });

  it('rejects a blank title without saving anything', async () => {
    const id = PostId.generate();

    await expect(execute(new CreatePostCommand.CreatePost(id, '   ', 'oi', author.id, author.name))).rejects.toThrow(InvalidPostException);

    expect(events.events).toEqual([]);
    expect(await freshEm(module).count(Post)).toBe(0);
  });

  it('rejects an id that already exists', async () => {
    const existing = await givenAPost(module);

    await expect(execute(new CreatePostCommand.CreatePost(existing.id, 'outro', 'oi', author.id, author.name))).rejects.toThrow(
      PostAlreadyExistsException,
    );

    expect(events.events).toEqual([]);
    expect(await freshEm(module).count(Post)).toBe(1);
  });

  /**
   * O handler **não** lê o agregado `User`: o autor já veio decidido da borda, e o que segue é só o
   * retrato dele. Quem recusa um id que não é de autor é a chave estrangeira `posts.author_id →
   * authors.id` — e estes dois testes são o que torna essa confiança verificável.
   *
   * Recusar no banco é melhor do que checar antes por duas razões. A primeira é de corretude: um
   * SELECT antes do INSERT tem uma janela em que o autor pode sumir, e a restrição não tem. A segunda
   * é de segurança: a checagem anterior distinguia "não existe" de "é leitor", e isso é um oráculo de
   * quais usuários existem — a FK não distingue, e a mensagem traduzida também não.
   */
  describe('a chave estrangeira é a garantia, e não uma checagem antes', () => {
    it('recusa um authorId que não existe, sem gravar nada', async () => {
      const id = PostId.generate();
      const command = new CreatePostCommand.CreatePost(
        id,
        'Nest + GraphQL',
        'oi',
        UserId.generate(),
        UserName.parse('fantasma'),
      );

      await expect(execute(command)).rejects.toThrow(ForeignKeyConstraintViolationException);
      expect(await freshEm(module).findOne(Post, { id })).toBeNull();
    });

    it('recusa o id de um Reader — a FK aponta para `authors`, não para `users`', async () => {
      const reader = await givenAReader(module);
      const id = PostId.generate();
      const command = new CreatePostCommand.CreatePost(id, 'Nest + GraphQL', 'oi', reader.id, reader.name);

      await expect(execute(command)).rejects.toThrow(ForeignKeyConstraintViolationException);
      expect(await freshEm(module).findOne(Post, { id })).toBeNull();
    });
  });
});
