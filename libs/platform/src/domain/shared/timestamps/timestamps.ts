import { AutoMap } from '@automapper/classes';

export function WithTimestamps<
  TBase extends abstract new (...args: any[]) => object,
>(Base: TBase) {
  abstract class Timestamped extends Base {
    @AutoMap()
    createdAt!: Date;
    @AutoMap()
    updatedAt!: Date;

    stampCreation(at: Date): void {
      this.createdAt = at;
      this.updatedAt = at;
    }

    touch(at: Date): void {
      this.updatedAt = at;
    }
  }

  return Timestamped;
}
