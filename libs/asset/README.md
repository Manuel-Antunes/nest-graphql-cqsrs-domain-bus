# asset

Files an entity holds, as a value — a port of
[`@jrmc/adonis-attachment`](https://github.com/batosai/adonis-attachment) to Nest and MikroORM, over
[`@nestjs/storage`](https://github.com/nestjs/storage). `NOTICE.md` accounts for what came from where.

```ts
export const UserSchema = defineEntity({
  class: User,
  properties: {
    id: () => p.uuid().primary(),
    avatar: () =>
      attachment({ folder: 'users/avatars', variants: ['thumbnail'] }).nullable(),
  },
});

user.avatar = await Attachment.fromFile(request.file);
await em.flush();

user.avatar.url;                         // with preComputeUrl
await user.avatar.getUrl('thumbnail');   // once the variant is made
```

## The concepts

| | what it is |
|---|---|
| **Storage** | every disk the application stores on, by name: `@nestjs/storage`'s `Storage`, which its `StorageModule` provides |
| **Disk** | `@nestjs/storage`'s `StorageDisk`: `S3Disk` (S3 and every S3-compatible store), `LocalDisk`, `InMemoryDisk`, or a class of your own |
| **Asset** | a file on a disk: path, size, extension, MIME type, metadata, and the reads and URLs that go through its disk |
| **Attachment** | an asset an entity holds in an `attachment()` column, with the variants made of it |
| **Variant** | an asset a converter made of an attachment — a thumbnail, a preview — kept in the attachment's column |
| **Converter** | what makes a variant: `ImageConverter`, `VideoThumbnailConverter`, `PdfThumbnailConverter`, `DocumentThumbnailConverter`, `AutodetectConverter`, or a class of your own |
| **File** | where a pending asset's bytes are: a buffer, a local path, a download, a stream, an upload, or an object already on a disk |

## Wiring

The disks and the attachments are two modules, as `@adonisjs/drive` and `adonis-attachment` are two
packages. **The library knows no provider.** The composition root builds the disks, with whatever
rules its storage has — a CDN, a signing endpoint, credentials — and hands them to `@nestjs/storage`:

```ts
StorageModule.forRootAsync({ useClass: BucketDisks }),   // a StorageOptionsFactory
StorageModule.forRoot({
  default: 'public',
  disks: {
    public: new S3Disk({ bucket, region, publicUrl: 'https://cdn.example.com' }),
    private: new S3Disk({ bucket, region }),
  },
}),
EventEmitterModule.forRoot(),            // optional: see Events
AttachmentModule.forRoot({
  preComputeUrl: true,
  converters: {
    thumbnail: ImageConverter.resize(300).blurhash(),
    preview: AutodetectConverter.resize(720),
  },
}),
```

`apps/posts-api/src/infrastructure/storage/bucket-disks.ts` is a worked example: one S3-compatible
bucket as a `public` and a `private` disk, the public one served from a CDN, and every URL built for
the address the browser reaches the storage at when that is not the service's. Both modules are
global. `AttachmentModule` needs the MikroORM connection; a service that only reads and writes disks
imports `StorageModule` alone and injects `Storage` — or a disk, with `@InjectDisk(name)`.

**A disk with a `publicUrl` serves its files there; any other signs.** That is how an attachment's
URL is resolved — `computeUrl`, and `preComputeUrl` — and it is the whole of what used to be a disk's
visibility.

**An application that bundles this library declares the packages it loads**, as it does for every
library here — a `require` from `apps/<app>/dist` resolves only what that app's `package.json`
names, and the Lambda bundling fails with `Could not resolve "file-type"` otherwise. `file-type` and
`mime-types` wherever the `Attachment` class is reached at all (an entity mapping `attachment()` is
enough); `exifreader`, `blurhash` and `sharp` where `AttachmentModule` runs. `sharp` is native and SST
keeps it external: a function that converts images needs it installed, not bundled.

`AttachmentModule`'s options are `adonis-attachment`'s `config/attachment.ts`. Every column option
set there is the default of every column that does not set its own:

| option | default | |
|---|---|---|
| `converters` | `{}` | the converters variants are made with, by name |
| `folder` | `uploads` | |
| `rename` | `true` | a random UUID with the file's extension |
| `preComputeUrl` | `false` | resolve URLs on load and save |
| `meta` | `false` | read dimensions, EXIF, duration, pages when a file is stored |
| `keepSource` | `false` | leave the object an `Attachment.fromDisk` was made of where it is |
| `signedUrl` | `@nestjs/storage`'s — 15 minutes | the options signed URLs are made with: `expiresIn`, `filename`, `disposition` |
| `bin` | the `PATH` | where `ffmpeg`, `ffprobe`, `pdftoppm`, `pdfinfo` and `soffice` are |
| `timeout` | `30000` | milliseconds an external program may run |
| `queue.concurrency` | `1` | attachments whose variants are made at once |
| `variant` | beside the file | `basePath` and `ignoreFolder`, as Adonis's |
| `secret` | none | what key ids are sealed with; without it there are none |
| `lock` | in process | a lock shared by every process that may make the same variants |

Beside those, `isGlobal`, `context` (the ambient context below, on by default) and `route`.

## Columns

```ts
avatar: () => attachment({ disk: 'private', folder: 'users/:slug', meta: true }).nullable(),
gallery: () => attachments({ folder: 'galleries' }).nullable(),
```

`attachment()` is `@attachment()` and `attachments()` is `@attachments()`: a `json` column holding the
durable fields — disk, path, original name, size, extension, MIME type, metadata, variants — and never
a URL, which is derived and may expire. MikroORM's own property options do what the decorator's
`serializeAs` and `serialize` did: `.serializedName()`, `.hidden()`, `.serializer()`.

Every option may be a strategy, evaluated once per file stored against the entity that holds it,
the property path, the file's original name and the ambient context — synchronous or not:

```ts
attachment({ folder: 'posts/:slug' })                                  // :slug is the entity's slug, slugged
attachment({ folder: () => new Date().toISOString().slice(0, 7) })
attachment({ folder: (post) => `posts/${post?.id}` })
attachment({ folder: (_post, { ctx }) => `tenants/${ctx.tenantId}/covers` })
attachment({ rename: async (_post, { originalName }) => `copy-of-${originalName}` })
attachment({ rename: ':id.jpg' })
```

A strategy only decides where a **new** file goes: the stored path is the truth on every read after
that. `ctx` is `AttachmentContext` — process-wide globals (`AttachmentContext.setGlobals`) overlaid
with the scope a middleware (HTTP) or an interceptor (every other transport) opens per call, carrying
the call's `x-tenant`.

An embeddable holding an attachment must be mapped flattened (the default). An `object: true`
embeddable is one opaque JSON column, its attachments are never columns of their own, and the
subscriber says so at boot.

## Making attachments

The factories of Adonis's `attachmentManager` are static constructors, on `Attachment` and on `Asset`:

```ts
await Attachment.fromBuffer(buffer, 'photo.jpg')
await Attachment.fromBase64('data:image/png;base64,…', 'pixel.png')
await Attachment.fromPath('/tmp/report.pdf')
await Attachment.fromUrl('https://example.com/photo.jpg')
await Attachment.fromStream(stream, 'video.mkv')
await Attachment.fromFile(file)            // multer's, @fastify/multipart's or AdonisJS's shape
await Attachment.fromFiles(files)
Attachment.fromDisk('tmp/uploads/123', { size, mimeType, keepSource: false })
```

Each tells what the file is — by its bytes (`file-type`), or by its name (`mime-types`) — and makes a
**pending** attachment. Nothing is stored until the entity holding it is flushed. `fromDisk` is how a
browser uploads without the bytes crossing the service: it `PUT`s to a URL from
`storage.disk().signedUpload(key, { contentType })`, and hands the key back. Storing it TAKES the object, so the
service must check the key is one it issued to that caller first — `apps/posts-api`'s `UploadArea`.

Outside any entity, `AttachmentManager.store(await Asset.fromBuffer(pdf, 'report.pdf'), { folder:
'reports' })` stores at once.

## The lifecycle, run by one global subscriber

| when | what `AttachmentSubscriber` does |
|---|---|
| load | binds each attachment to its disk, resolves its URLs when `preComputeUrl`, seals its `keyId` |
| flush | stores every pending attachment where its options put it — reading its `meta` first — and recomputes the change set so the row holds the stored path |
| flush, replaced or cleared | queues the old attachment, and its variants, for deletion |
| delete | queues the row's attachments for deletion |
| commit | deletes what was queued, lets go of each source, seals key ids, and queues the variants |
| rollback | deletes what was stored and puts every attachment back as it was, pending |

A store **copies**: the source — a staged upload, a temporary download — is let go of only once the
transaction commits, which is what lets a rollback put everything back. Inside an explicit
transaction nothing is deleted before the commit, because a rollback would leave the row pointing at
it.

## Converters and variants

```ts
ImageConverter.resize(300)
ImageConverter.resize({ width: 400, height: 400, fit: 'cover' }).format('jpeg', { quality: 80 })
ImageConverter.format('avif').blurhash({ componentX: 4, componentY: 3 })
VideoThumbnailConverter.at(2).resize(720)
PdfThumbnailConverter.page(1).resize(720)
DocumentThumbnailConverter.create().resize(720)
AutodetectConverter.resize(1280)
```

Every step answers with a new converter, so one can be shared and specialised. They write `webp`
unless told otherwise, rotate by the EXIF orientation, and strip metadata — GPS included — from
what they write. `sharp` makes the images; `ffmpeg`, Poppler and LibreOffice make the frames and pages
they start from, and are looked for on the `PATH` or where `bin` says. Each package and program is
needed only by the converter that uses it: a process that never converts an image never loads
`sharp`, and one that does without it is told to install it (`MissingPackageException`).

A converter of your own extends `Converter`, as a mail extends `Mail`:

```ts
export class Gif2WebpConverter extends Converter {
  async handle(input: ConverterInput): Promise<ConverterInput> {
    return sharp(input, { animated: true }).webp().toBuffer();
  }
}
```

The variants a column declares are made **after** the transaction that stored the attachment commits,
on `VariantQueue`, one attachment at a time under a lock: the row is read again in the schema it
lives in, the variants are stored beside the attachment and recorded on the row, and the ones they
replace are deleted. A variant made of an attachment since replaced is thrown away.
`await queue.idle()` waits for the queue — what a spec, a script, or a Lambda about to answer needs.

`RegenerateService` makes them again — `entity(post, { variants: ['thumbnail'] })`, or
`all(Post, { attributes: ['cover'], schema: 'tenant_acme' })` — replacing the ones there are.

## Events

With `EventEmitterModule.forRoot()` imported, `AttachmentEventService` emits the generation on
`@nestjs/event-emitter`, the way `@nestjs-modules/mailer`'s `MailerEventService` emits the mailer's.
Without it, nothing is emitted and nothing fails.

| event | payload |
|---|---|
| `AttachmentEvent.VARIANT_STARTED` — `attachment.variant_started` | `VariantGenerationStarted` |
| `AttachmentEvent.VARIANT_COMPLETED` — `attachment.variant_completed` | `VariantGenerationCompleted`, with `generated` |
| `AttachmentEvent.VARIANT_FAILED` — `attachment.variant_failed` | `VariantGenerationFailed`, with `error` |

```ts
@OnEvent(AttachmentEvent.VARIANT_COMPLETED)
onVariants({ entity, primaryKey, generated }: VariantGenerationCompleted) {}
```

## Serving by key id

With a `secret`, every attachment carries a `keyId` — the row, the property and the file, sealed with
AES-256-GCM — and `AttachmentServer.serve(keyId, variant?)` answers with its bytes, making a variant
that does not exist yet on the spot. `route` mounts it as `router.attachments()` was:

```ts
AttachmentModule.forRoot({
  secret: env.ATTACHMENT_SECRET,
  converters: { thumbnail: ImageConverter.resize(300) },
  route: { path: 'attachments', decorators: [AllowAnonymous()] },
})
```

`GET /attachments/:keyId/:name?variant=thumbnail`. The key id is the capability, which is why the
route takes decorators — a global guard would refuse it otherwise. On Fastify, a key id is longer than
the default `maxParamLength` of 100: `new FastifyAdapter({ maxParamLength: 1024 })`.

## Testing

`TestDisks` (`@nestposts/asset/infrastructure/testing/test-disks`) is `@nestjs/storage`'s
`InMemoryDisk`, twice: a `public` disk with URLs under `http://files.test/public`, and a `private` one
whose URLs are signed — `TestDisks.isSigned(storage, url)` checks them. No storage service runs:

```ts
imports: [TestDisks.module(), AttachmentModule.forRoot({})]
```

The converters that run `ffmpeg` and Poppler are covered where those programs work, and skipped
where they do not.
