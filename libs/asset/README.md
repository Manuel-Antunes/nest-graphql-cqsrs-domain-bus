# asset

Files in S3-compatible storage, held by entities as a value. A column declared with `attachment()`
stores an `Asset`; the `AssetAttachmentSubscriber` does everything storage-related on its behalf, on
MikroORM's own events, so no handler ever touches a bucket.

```ts
export const PostSchema = defineEntity({
  name: 'Post',
  properties: {
    id: () => p.uuid().primary(),
    cover: () => attachment({ folder: 'posts/covers', disk: 'public' }).nullable(),
  },
});

post.cover = new Asset({ name: 'tmp/upload.png', size, extname: 'png', mimeType: 'image/png' });
await em.flush();
post.cover.name; // posts/covers/<uuid>.png
post.cover.url;  // ready to serve
```

## Wiring

Once, at the composition root, beside `DatabaseModule`:

```ts
AssetInfrastructureModule.forRoot(assetStorageOptionsFromEnv())
AssetInfrastructureModule.forRootAsync({ useFactory: () => ({ bucket: 'uploads' }) })
```

The module is **global**: the composition root calls `forRoot` once, and the `DiskService` port
(`getDisk('public' | 'private')` hands back a flydrive `Disk`) is injectable anywhere after that. It
also registers the subscriber and opens the ambient `AssetContext` on every request and message. A
service that only needs the `DiskService`, and has no MikroORM connection, passes
`attachments: false`.

`assetStorageOptionsFromEnv()` reads `DRIVE_DISK`, `DRIVE_BUCKET`, `DRIVE_CDN_URL`,
`DRIVE_S3_ENDPOINT`, `DRIVE_S3_PUBLIC_ENDPOINT`, `DRIVE_S3_FORCE_PATH_STYLE`, `DRIVE_AWS_REGION`,
`DRIVE_AWS_ACCESS_KEY_ID` and `DRIVE_AWS_SECRET_ACCESS_KEY`. Both disks are the same bucket; they
differ in visibility, and the public one is served from `DRIVE_CDN_URL` when there is one. A CDN URL
is a base the key is appended to, so it carries the bucket's path when the CDN needs one.

Path-style addressing (`http://host/bucket/key`) is used outside production, and wherever
`DRIVE_S3_FORCE_PATH_STYLE=true` — which an image built for production still needs when its storage
is MinIO behind a network alias, where `bucket.minio` resolves to nothing.

Writes carry **no object ACL** unless `supportsACL: true`: a bucket with `BucketOwnerEnforced`
ownership rejects every `PutObject` that sends one, and who may read what is then the bucket's
policy, not the object's.

## When the browser reaches the storage somewhere else

A signed URL is bound to the host it was signed for. Behind a Docker network the service reaches
MinIO as `minio:9000` while the browser reaches it as `localhost:9000`, so a URL signed for the
first one is useless to the second. `publicEndpoint` (`DRIVE_S3_PUBLIC_ENDPOINT`) is the address
outside the network: operations still go to `endpoint`, and every URL — signed reads, signed
uploads, and unsigned reads when there is no CDN — is built against the public one. On AWS both are
the same endpoint and the option stays unset.

## The lifecycle of an attachment

| when | what the subscriber does |
|---|---|
| load | binds the disk and resolves the URL (signed for a private disk). It never moves an object, not even one whose row says `persisted: false` |
| flush, staged asset | moves the object under `<folder>/<uuid>.<ext>` (copies it with `keepSource`) and recomputes the change set, so the row stores the owned key |
| flush, replaced or cleared | queues the old object for deletion |
| delete | queues the row's object for deletion |
| commit | deletes what was queued |
| rollback | moves every promoted object back to its staging key (deletes the copy with `keepSource`) and reverts the `Asset` in memory |

Inside an explicit transaction the deletes wait for the commit, because a rollback would leave the
row pointing at them. A nested transaction's savepoint fires its own commit, so an attachment
replaced inside one is deleted when the savepoint is released, not when the outer transaction
commits.

The column holds the durable fields only: a URL is derived, a signed one expires, and storing it
would make every load differ from its own snapshot and flush a spurious `UPDATE`.

An embeddable holding an attachment must be mapped flattened (the default). An `object: true`
embeddable is one opaque JSON column, its attachments are never columns of their own, and the
subscriber says so at boot.

## Strategies and the ambient context

Every option may be a function of the owning entity and of the ambient context, evaluated once per
attach or load:

```ts
attachment({ folder: () => new Date().toISOString().slice(0, 7) })
attachment({ folder: (post) => `posts/${post?.slug}` })
attachment({ folder: (_post, { ctx, path }) => `tenants/${ctx.tenantId}/${path.at(-1)}` })
```

`ctx` is `AssetContext`: process-wide globals (`AssetContext.setGlobals`) overlaid with the scope
the middleware (HTTP) or the interceptor (every other transport) opens per call, which carries the
`x-tenant` of the request. A strategy only decides where a **new** object goes; the stored key is
the truth on every read after that.

## Assets that are not uploads

- `Asset.fromUrl(url, folder, name)` downloads the bytes when it is attached.
- `Asset.fromBuffer(contents, { fileName, extname, mimeType })` writes generated bytes straight to
  the owned key.
- `publishDownload(disk, fileName, contents, contentType)` stores a generated file under
  `tmp/downloads/<random>/` and returns a short, **unsigned** URL. It expects that prefix to be
  publicly readable and expired by a lifecycle rule; the random segment is the capability.
- `disk.getSignedUploadUrl(key, { contentType, expiresIn })` is how a browser uploads without the
  bytes crossing the service: it `PUT`s to the URL, and hands the key back as a staged `Asset`. The
  service must check the key is one it issued to that user before attaching it — attaching MOVES the
  object, so a key taken from somebody else would take their file.
- `DiskService.uploadStream` uploads a stream whose length is unknown, as a multipart upload.
  `Disk.putStream` cannot: a single `PutObject` needs a `Content-Length`.

## Testing

`setupTestStorage()` (`@nestposts/asset/infrastructure/testing/test-storage`) starts a MinIO
container with an empty bucket and hands back the options to boot the module with:

```ts
storage = await setupTestStorage();
AssetInfrastructureModule.forRoot(storage.options);
```

MinIO has no object ACLs, so that bucket answers anonymous reads under `tmp/` only, like a deployed
bucket whose download prefix is public, and everything else is read through a signed URL.
