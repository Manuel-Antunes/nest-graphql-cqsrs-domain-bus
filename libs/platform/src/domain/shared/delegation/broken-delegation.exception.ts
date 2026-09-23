import type { Type } from '@nestjs/common';

export class BrokenDelegationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrokenDelegationException';
  }

  static missingMember(
    delegate: Type<object>,
    member: PropertyKey,
  ): BrokenDelegationException {
    return new BrokenDelegationException(
      `${delegate.name} does not declare ${String(member)}: nothing to delegate to`,
    );
  }

  static notDelegated(delegate: Type<object>): BrokenDelegationException {
    return new BrokenDelegationException(
      `${delegate.name} backs no delegation: there is nothing to cast it into`,
    );
  }

  static alreadyDelegated(delegate: Type<object>): BrokenDelegationException {
    return new BrokenDelegationException(
      `${delegate.name} already backs a delegation: a delegate answers for one capability`,
    );
  }
}
