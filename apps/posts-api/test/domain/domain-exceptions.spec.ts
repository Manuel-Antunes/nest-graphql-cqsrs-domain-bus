import { AlreadyDeletedException } from '@nestposts/platform/domain/shared/soft-delete/already-deleted.exception';
import { NotDeletedException } from '@nestposts/platform/domain/shared/soft-delete/not-deleted.exception';
import { InvalidPostException } from '@nestposts/posts/domain/post/exception/invalid-post.exception';
import { PostAlreadyExistsException } from '@nestposts/posts/domain/post/exception/post-already-exists.exception';
import { PostNotFoundException } from '@nestposts/posts/domain/post/exception/post-not-found.exception';
import { PostNotWrittenByException } from '@nestposts/posts/domain/post/exception/post-not-written-by.exception';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { InvalidTagException } from '@nestposts/posts/domain/tag/exception/invalid-tag.exception';
import { TagAlreadyExistsException } from '@nestposts/posts/domain/tag/exception/tag-already-exists.exception';
import { TagNotFoundException } from '@nestposts/posts/domain/tag/exception/tag-not-found.exception';
import { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';
import { InvalidUserException } from '@nestposts/users/domain/user/exception/invalid-user.exception';
import { NotAnAuthorException } from '@nestposts/users/domain/user/exception/not-an-author.exception';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { z } from 'zod';

describe('exceções do domínio', () => {
  const postId = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');
  const tagId = TagId.parse('5f7a1c7e-4d0b-4b7a-9e3c-1a2b3c4d5e6f');
  const userId = UserId.parse('9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60');

  describe('Post', () => {
    it('PostNotFound nomeia o id e guarda o value object', () => {
      const error = new PostNotFoundException(postId);

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('PostNotFoundException');
      expect(error.message).toBe(`post ${postId.value} não existe`);
      expect(error.postId).toBe(postId);
    });

    it('PostAlreadyExists nomeia o id que colidiu', () => {
      const error = new PostAlreadyExistsException(postId);

      expect(error.name).toBe('PostAlreadyExistsException');
      expect(error.message).toBe(`post ${postId.value} já existe`);
      expect(error.postId).toBe(postId);
    });

    it('PostNotWrittenBy carrega os dois lados da recusa: o post e quem tentou', () => {
      const error = new PostNotWrittenByException(postId, userId);

      expect(error.name).toBe('PostNotWrittenByException');
      expect(error.message).toBe(
        `post ${postId.value} não foi escrito por ${userId.value}`,
      );
      expect(error.postId).toBe(postId);
      expect(error.userId).toBe(userId);
    });

    it('InvalidPost nomeia a invariante e guarda o ZodError como causa', () => {
      const result = z
        .object({ title: z.string().min(1, 'title não pode ser vazio') })
        .safeParse({ title: '' });

      const error = new InvalidPostException('post inválido', {
        cause: result.error,
      });

      expect(error).toBeInstanceOf(InvalidPostException);
      expect(error.name).toBe('InvalidPostException');
      expect(error.message).toBe('post inválido');
      expect(error.cause).toBe(result.error);
    });
  });

  describe('Tag', () => {
    it('TagNotFound e TagAlreadyExists nomeiam o id', () => {
      expect(new TagNotFoundException(tagId).message).toBe(
        `tag ${tagId.value} não existe`,
      );
      expect(new TagNotFoundException(tagId).tagId).toBe(tagId);
      expect(new TagAlreadyExistsException(tagId).message).toBe(
        `tag ${tagId.value} já existe`,
      );
      expect(new TagAlreadyExistsException(tagId).name).toBe(
        'TagAlreadyExistsException',
      );
    });

    it('InvalidTag guarda as issues na causa', () => {
      const result = z
        .string()
        .min(1, 'nome da tag não pode ser vazio')
        .safeParse('');

      const error = new InvalidTagException('nome de tag inválido', {
        cause: result.error,
      });

      expect(error.message).toBe('nome de tag inválido');
      expect(error.cause).toBe(result.error);
    });
  });

  describe('User', () => {
    it('NotAnAuthor com id nomeia quem tentou escrever', () => {
      const error = new NotAnAuthorException(userId);

      expect(error.name).toBe('NotAnAuthorException');
      expect(error.message).toBe(
        `user ${userId.value} não é autor: não escreve posts`,
      );
      expect(error.userId).toBe(userId);
    });

    it('NotAnAuthor sem id não diz qual dos dois casos foi', () => {
      const error = new NotAnAuthorException();

      expect(error.message).toBe(
        'o autor informado não existe ou não pode escrever',
      );
      expect(error.message).not.toContain(userId.value);
      expect(error.userId).toBeUndefined();
    });

    it('InvalidUser aceita mensagem direta e, quando há, a causa que a originou', () => {
      const result = z
        .object({ email: z.email('email inválido') })
        .safeParse({ email: 'x' });

      const doDominio = new InvalidUserException('promoção impossível');
      const doParse = new InvalidUserException('user inválido', {
        cause: result.error,
      });

      expect(doDominio.message).toBe('promoção impossível');
      expect(doDominio.name).toBe('InvalidUserException');
      expect(doDominio.cause).toBeUndefined();
      expect(doParse.cause).toBe(result.error);
    });
  });

  describe('soft delete', () => {
    it('as duas recusas imprimem a identidade da entidade', () => {
      const already = new AlreadyDeletedException(`post ${postId.value}`);
      const notYet = new NotDeletedException(`post ${postId.value}`);

      expect(already.name).toBe('AlreadyDeletedException');
      expect(already.message).toBe(`já está apagado: post ${postId.value}`);
      expect(already.entity).toBe(`post ${postId.value}`);
      expect(notYet.name).toBe('NotDeletedException');
      expect(notYet.message).toBe(`não está apagado: post ${postId.value}`);
      expect(notYet.entity).toBe(`post ${postId.value}`);
    });
  });
});
