# asset

This library is a port of [**@jrmc/adonis-attachment**](https://github.com/batosai/adonis-attachment)
5.2 by Jeremy Chaufourier, MIT licensed (see `LICENSE`), from AdonisJS and Lucid to Nest and
MikroORM. A copy of the package was read as the reference; none of it is vendored.

## What came from upstream

| here | upstream | what changed |
|---|---|---|
| `Asset` | `AttachmentBase` | the file on a disk — path, size, extension, MIME type, `meta`, `getDisk`, `getBytes`, `getBuffer`, `getStream`, `getUrl`, `getSignedUrl`, `computeUrl`. A **pending** asset knows where its bytes are (`AssetSource`) instead of holding an `input`, and `store` answers with an `AssetWrite` to commit or undo |
| `Attachment` | `Attachment` | `originalName`, `variants`, `getVariant`, `getUrl(variant)`, `getSignedUrl(variant, options)`, `toJSON` with each variant under its key. The `.trash` rename before a delete is gone: nothing is deleted before the commit |
| `Variant` | `Variant` | `key` and `blurhash` |
| `Asset.from*` / `Attachment.from*` | `attachmentManager.createFrom*` | static constructors — `fromFile`, `fromFiles`, `fromPath`, `fromBuffer`, `fromBase64`, `fromUrl`, `fromStream` — plus `fromDisk`, an object already on a disk, which upstream had no way to attach |
| `AttachmentManager` | `AttachmentManager` | `computeUrl`, `write`, `remove`, the converters; `store` for an asset outside any entity |
| `@nestjs/storage`'s `Storage` and `StorageDisk` | `@adonisjs/drive`, which is flydrive | the disks. A disk's visibility is gone: a disk with a `publicUrl` serves its files there, and any other signs |
| `attachment()` / `attachments()` | `@attachment()` / `@attachments()` | MikroORM property builders over a custom `Type`; `serializeAs` and `serialize` are MikroORM's own `serializedName`, `hidden` and `serializer` |
| `AttachmentSubscriber` | `utils/hooks.ts` and the `services/attachment/*` | one global MikroORM `EventSubscriber` instead of per-model hooks: `onLoad` for `afterFind`, `onFlush` for `beforeSave`/`beforeDelete`, the transaction events for `trx.after('commit' \| 'rollback')` |
| `AttachmentOptions` | `LucidOptions` | `disk`, `folder`, `rename`, `preComputeUrl`, `meta`, `variants`, with `:param` segments slugged as upstream; every option may be a strategy of the entity, the property path, the original name and the ambient context. `keepSource` is this library's |
| `AttachmentModule` options | `defineConfig` | `converters`, `preComputeUrl`, `meta`, `rename`, `bin`, `timeout`, `queue.concurrency`, `variant.basePath`/`ignoreFolder`, plus `folder`, `keepSource`, `signedUrl`, `secret` and `lock` |
| `Converter` and the five converters | `converters/*` | the same five, built by static constructors and refined fluently, each step a new converter. Upstream's `options` object is the converter's own; `bin` and `timeout` arrive in the `ConverterContext` at `handle` time. The image written strips metadata where upstream kept it, GPS included |
| `FFmpeg`, `Poppler`, `Soffice`, `MediaMeta`, `Blurhash`, `FileInspector` | `adapters/*` | the programs run through `execFile` rather than `execa`; `pdftoppm -singlefile` and `pdfinfo -isodates` replace the page-number padding and the date parsing |
| `VariantService`, `VariantGenerator`, `VariantQueue` | `VariantService`, `VariantGeneratorService`, `VariantPersisterService`, `VariantPurgerService`, `DeferQueue` | the row is read and written again through the ORM, in its own schema, and a variant is kept only if its attachment is still the row's. Replaced variants are purged after the row stops pointing at them, not before |
| `RegenerateService` | `RegenerateService` | `entity(entity, options)` and `all(Entity, options)` for `row(...).run()` and `model(...).run()` |
| `AttachmentLock` | the `verrou` lock | an abstract class, held in the process unless the module is given another |
| `AttachmentEventService`, `AttachmentEvent` | `attachment:variant_*` on the Adonis emitter | emitted on `@nestjs/event-emitter`, opt-in, the way `@nestjs-modules/mailer`'s `MailerEventService` emits the mailer's |
| `AttachmentKeys`, `AttachmentServer`, `AttachmentsController` | `setKeyId`, `AttachmentsController`, `router.attachments()` | key ids sealed with AES-256-GCM under the module's `secret`, pointing at the row by entity, schema and primary key; the controller is mounted by the module's `route`, with decorators |
| the exceptions | `errors.ts` | one class each, with upstream's code on `code` |

## What this library adds

The ambient `AttachmentContext` a strategy reads; `TestDisks`; `UploadArea`, the staging area a
browser uploads to before `fromDisk` takes the object; and a legacy reader for columns this library
wrote before `path` existed.

## What upstream had and this does not

The `ace` commands (`make:converter`, variant regeneration), the Edge and Inertia helpers, and
`@adonisjs/core`'s encryption, which key ids no longer depend on.
