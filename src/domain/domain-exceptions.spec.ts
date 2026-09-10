import { z } from 'zod';
import { PostAlreadyExistsException } from './post/exception/post-already-exists.exception';
import { PostNotFoundException } from './post/exception/post-not-found.exception';
import { PostNotWrittenByException } from './post/exception/post-not-written-by.exception';
import { InvalidPostException } from './post/exception/invalid-post.exception';
import { PostId } from './post/vo/post-id';
import { AlreadyDeletedException } from './shared/already-deleted.exception';
import { NotDeletedException } from './shared/not-deleted.exception';
import { InvalidTagException } from './tag/exception/invalid-tag.exception';
import { TagAlreadyExistsException } from './tag/exception/tag-already-exists.exception';
import { TagNotFoundException } from './tag/exception/tag-not-found.exception';
import { TagId } from './tag/vo/tag-id';
import { InvalidUserException } from './user/exception/invalid-user.exception';
import { NotAnAuthorException } from './user/exception/not-an-author.exception';
import { UserId } from './user/vo/user-id';

/**
 * As exceções do domínio como **dados**, e não só como falhas.
 *
 * Elas são lidas em três lugares diferentes, e cada um depende de uma metade distinta:
 *
 * - o `DomainExceptionFilter` roteia pelo **`name`** — se ele mudar, uma recusa de negócio vira 500;
 * - o cliente do GraphQL lê a **mensagem**, então ela precisa nomear o que foi recusado;
 * - quem trata a exceção lê o **campo tipado** (`postId`, `userId`) sem reparsear a mensagem.
 *
 * O caso do {@link NotAnAuthorException} é o que mais pede teste: ele tem duas formas de propósito, e
 * a sem id é vaga **para não virar um oráculo** de quais usuários existem.
 */
describe('exceções do domínio', () => {
  const postId = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');
  const tagId = TagId.parse('5f7a1c7e-4d0b-4b7a-9e3c-1a2b3c4d5e6f');
  const userId = UserId.parse('9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60');

  describe('Post', () => {
    it('PostNotFound nomeia o id e guarda o value object', () => {
      // Arrange / Act
      const error = new PostNotFoundException(postId);

      // Assert
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('PostNotFoundException');
      expect(error.message).toBe(`post ${postId.value} não existe`);
      expect(error.postId).toBe(postId);
    });

    it('PostAlreadyExists nomeia o id que colidiu', () => {
      // Arrange / Act
      const error = new PostAlreadyExistsException(postId);

      // Assert
      expect(error.name).toBe('PostAlreadyExistsException');
      expect(error.message).toBe(`post ${postId.value} já existe`);
      expect(error.postId).toBe(postId);
    });

    it('PostNotWrittenBy carrega os dois lados da recusa: o post e quem tentou', () => {
      // Arrange / Act
      const error = new PostNotWrittenByException(postId, userId);

      // Assert
      expect(error.name).toBe('PostNotWrittenByException');
      expect(error.message).toBe(`post ${postId.value} não foi escrito por ${userId.value}`);
      expect(error.postId).toBe(postId);
      expect(error.userId).toBe(userId);
    });

    it('InvalidPost.fromZod junta as issues numa mensagem por campo', () => {
      // Arrange
      const result = z.object({ title: z.string().min(1, 'title não pode ser vazio') }).safeParse({ title: '' });

      // Act
      const error = InvalidPostException.fromZod(result.error!);

      // Assert
      expect(error).toBeInstanceOf(InvalidPostException);
      expect(error.name).toBe('InvalidPostException');
      expect(error.message).toContain('title não pode ser vazio');
    });
  });

  describe('Tag', () => {
    it('TagNotFound e TagAlreadyExists nomeiam o id', () => {
      // Assert
      expect(new TagNotFoundException(tagId).message).toBe(`tag ${tagId.value} não existe`);
      expect(new TagNotFoundException(tagId).tagId).toBe(tagId);
      expect(new TagAlreadyExistsException(tagId).message).toBe(`tag ${tagId.value} já existe`);
      expect(new TagAlreadyExistsException(tagId).name).toBe('TagAlreadyExistsException');
    });

    it('InvalidTag.fromZod traduz as issues', () => {
      // Arrange
      const result = z.string().min(1, 'nome da tag não pode ser vazio').safeParse('');

      // Act / Assert
      expect(InvalidTagException.fromZod(result.error!).message).toContain('nome da tag não pode ser vazio');
    });
  });

  describe('User', () => {
    /**
     * A forma **com id** é a guarda de borda: quem a recebe é o próprio usuário, então a mensagem pode
     * nomeá-lo.
     */
    it('NotAnAuthor com id nomeia quem tentou escrever', () => {
      // Arrange / Act
      const error = new NotAnAuthorException(userId);

      // Assert
      expect(error.name).toBe('NotAnAuthorException');
      expect(error.message).toBe(`user ${userId.value} não é autor: não escreve posts`);
      expect(error.userId).toBe(userId);
    });

    /**
     * A forma **sem id** é a violação da chave estrangeira traduzida. Ela dispara tanto para um id
     * inexistente quanto para um id de leitor, e a mensagem não distingue os dois de propósito —
     * distinguir transformaria a recusa num oráculo de quais usuários existem.
     */
    it('NotAnAuthor sem id não diz qual dos dois casos foi', () => {
      // Arrange / Act
      const error = new NotAnAuthorException();

      // Assert
      expect(error.message).toBe('o autor informado não existe ou não pode escrever');
      expect(error.message).not.toContain(userId.value);
      expect(error.userId).toBeUndefined();
    });

    it('InvalidUser aceita mensagem direta e também a de um ZodError', () => {
      // Arrange
      const result = z.object({ email: z.email('email inválido') }).safeParse({ email: 'x' });

      // Assert
      expect(new InvalidUserException('promoção impossível').message).toBe('promoção impossível');
      expect(new InvalidUserException('x').name).toBe('InvalidUserException');
      expect(InvalidUserException.fromZod(result.error!).message).toContain('email inválido');
    });
  });

  describe('soft delete', () => {
    it('as duas recusas imprimem a identidade da entidade', () => {
      // Arrange / Act
      const already = new AlreadyDeletedException(`post ${postId.value}`);
      const notYet = new NotDeletedException(`post ${postId.value}`);

      // Assert
      expect(already.name).toBe('AlreadyDeletedException');
      expect(already.message).toBe(`já está apagado: post ${postId.value}`);
      expect(already.entity).toBe(`post ${postId.value}`);
      expect(notYet.name).toBe('NotDeletedException');
      expect(notYet.message).toBe(`não está apagado: post ${postId.value}`);
      expect(notYet.entity).toBe(`post ${postId.value}`);
    });
  });
});
