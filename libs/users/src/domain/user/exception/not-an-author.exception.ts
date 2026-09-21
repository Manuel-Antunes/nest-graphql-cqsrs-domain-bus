import type { UserId } from '../vo/user-id';

export class NotAnAuthorException extends Error {
  constructor(readonly userId?: UserId) {
    super(userId ? `user ${userId} não é autor: não escreve posts` : 'o autor informado não existe ou não pode escrever');
    this.name = 'NotAnAuthorException';
  }
}
