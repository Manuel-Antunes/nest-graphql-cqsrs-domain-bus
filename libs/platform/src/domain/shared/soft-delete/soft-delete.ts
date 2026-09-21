import { ValidatedDto } from "@nestposts/validated-dto/mixins";
import { AlreadyDeletedException } from "./already-deleted.exception";
import { NotDeletedException } from "./not-deleted.exception";
import { SoftDeletionSchema } from "./schemas/soft-deletion.schema";

export const SOFT_DELETABLE = Symbol.for("domain:soft-deletable");

export interface SoftDeletableEntity {
  readonly [SOFT_DELETABLE]: true;
  isDeleted(): boolean;
  applyDeletion(at: Date): void;
  applyRestoration(): void;
}

export class SoftDeletion extends ValidatedDto(SoftDeletionSchema) {
  static alive(): SoftDeletion {
    return new SoftDeletion({ deletedAt: null });
  }

  static isSoftDeletable(entity: unknown): entity is SoftDeletableEntity {
    return (
      typeof entity === "object" &&
      entity !== null &&
      (entity as any)[SOFT_DELETABLE] === true
    );
  }

  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  at(): Date | null {
    return this.deletedAt;
  }

  override toString(): string {
    return this.isDeleted
      ? `apagado em ${this.deletedAt?.toISOString()}`
      : "vivo";
  }
}

export function WithSoftDelete<
  TBase extends abstract new (...args: any[]) => object,
>(Base: TBase) {
  abstract class SoftDeletable extends Base {
    deleted: SoftDeletion = SoftDeletion.alive();

    isDeleted(): boolean {
      return this.deleted.isDeleted;
    }

    get deletedAt(): Date | null {
      return this.deleted.at();
    }

    softDelete(now: Date): void {
      if (this.isDeleted()) {
        throw new AlreadyDeletedException(this);
      }
      this.applyDeletion(now);
    }

    restore(_now: Date): void {
      if (!this.isDeleted()) {
        throw new NotDeletedException(this);
      }
      this.applyRestoration();
    }

    applyDeletion(at: Date): void {
      this.deleted.deletedAt = at;
    }

    applyRestoration(): void {
      this.deleted.deletedAt = null;
    }
  }

  Object.defineProperty(SoftDeletable.prototype, SOFT_DELETABLE, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  return SoftDeletable;
}
