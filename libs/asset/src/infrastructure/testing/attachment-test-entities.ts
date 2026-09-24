import type { InferEntity } from '@nestposts/database';
import { defineEntity, p } from '@nestposts/database';

import { attachment } from '../database/types/attachment-database.type';

export class TestDocument {
  props: Record<string, unknown>;

  constructor(props: Record<string, unknown> = {}) {
    this.props = props ?? {};
  }

  get label() {
    return this.props.label as string;
  }
  set label(value: string) {
    this.props.label = value;
  }
  get asset() {
    return this.props.asset;
  }
  set asset(value: unknown) {
    this.props.asset = value;
  }
  get status() {
    return this.props.status as string;
  }
  set status(value: string) {
    this.props.status = value;
  }
}

export class TestDocuments {
  props: Record<string, unknown>;

  constructor(props: Record<string, unknown> = {}) {
    this.props = props ?? {};
  }

  get identification() {
    return this.props.identification as TestDocument;
  }
  set identification(value: TestDocument) {
    this.props.identification = value;
  }
}

export const TestDocumentEmbeddable = defineEntity({
  name: 'TestDocument',
  embeddable: true,
  forceConstructor: true,
  constructorParams: ['props' as never],
  class: TestDocument,
  properties: {
    label: () => p.string(),
    asset: () =>
      attachment({
        folder: 'cases/documents',
        preComputeUrl: true,
        disk: 'private',
      }).nullable(),
    status: () => p.string().nullable(),
  },
});

export const TestDocumentsEmbeddable = defineEntity({
  name: 'TestDocuments',
  embeddable: true,
  forceConstructor: true,
  constructorParams: ['props' as never],
  class: TestDocuments,
  properties: {
    identification: () => p.embedded(TestDocumentEmbeddable).nullable(),
  },
});

export const TestPostSchema = defineEntity({
  name: 'TestPost',
  tableName: 'attachment_test_post',
  properties: {
    id: () => p.uuid().primary().defaultRaw('gen_random_uuid()'),
    title: () => p.string(),
    cover: () =>
      attachment({ folder: 'posts/covers', disk: 'public' }).nullable(),
    avatar: () =>
      attachment({
        folder: 'posts/avatars',
        disk: 'private',
        preComputeUrl: true,
      }).nullable(),
    manual: () =>
      attachment({
        folder: 'posts/manual',
        disk: 'private',
        preComputeUrl: false,
      }).nullable(),
    sourced: () =>
      attachment({
        folder: 'posts/sourced',
        disk: 'private',
        keepSource: true,
      }).nullable(),
    documents: () => p.embedded(TestDocumentsEmbeddable).nullable(),
  },
});

export type ITestPost = InferEntity<typeof TestPostSchema>;

const sameNameClass = () => {
  const factory = () => class Clash {};
  return factory();
};

export class ClashLeft extends sameNameClass() {}
export class ClashRight extends sameNameClass() {}
Object.defineProperty(ClashLeft, 'name', { value: 'Clash' });
Object.defineProperty(ClashRight, 'name', { value: 'Clash' });

export const ClashLeftSchema = defineEntity({
  name: 'ClashLeft',
  tableName: 'attachment_clash_left',
  class: ClashLeft,
  properties: {
    id: () => p.uuid().primary().defaultRaw('gen_random_uuid()'),
    file: () => attachment({ folder: 'clash/left', disk: 'public' }).nullable(),
  },
});

export const ClashRightSchema = defineEntity({
  name: 'ClashRight',
  tableName: 'attachment_clash_right',
  class: ClashRight,
  properties: {
    id: () => p.uuid().primary().defaultRaw('gen_random_uuid()'),
    file: () =>
      attachment({ folder: 'clash/right', disk: 'public' }).nullable(),
  },
});

export const StrategyPostSchema = defineEntity({
  name: 'StrategyPost',
  tableName: 'attachment_strategy_post',
  properties: {
    id: () => p.uuid().primary().defaultRaw('gen_random_uuid()'),
    slug: () => p.string(),
    byDate: () =>
      attachment({
        folder: () => 'archive/2026/08',
        disk: 'public',
      }).nullable(),
    byEntity: () =>
      attachment({
        folder: (post: { slug: string } | undefined) => `posts/${post?.slug}`,
        disk: 'public',
      }).nullable(),
    byTenant: () =>
      attachment({
        folder: (_post, { ctx, path }) =>
          `tenants/${ctx.tenantId}/${String(path[path.length - 1])}`,
        disk: 'private',
        keepSource: (_post, { ctx }) => ctx.keepEverything === true,
      }).nullable(),
  },
});

export const ATTACHMENT_TEST_ENTITIES = [
  TestPostSchema,
  StrategyPostSchema,
  TestDocumentsEmbeddable,
  TestDocumentEmbeddable,
  ClashLeftSchema,
  ClashRightSchema,
];
