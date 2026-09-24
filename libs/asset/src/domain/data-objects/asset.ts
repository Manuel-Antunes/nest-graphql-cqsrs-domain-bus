import { Expose } from 'class-transformer';
import type { Disk } from 'flydrive';

import { resolveAttachmentOptions } from '../context/resolve-attachment-options';
import { UrlNotLoadedError } from '../errors/url-not-loaded.error';
import type { AssetProps, IAsset } from '../schemas/asset.schema';
import type {
  AttachmentOptions,
  ResolvedAttachmentOptions,
} from '../schemas/attachment-options.schema';

const randomKey = (): string => globalThis.crypto.randomUUID();

/**
 * A file in storage, as the value an entity holds.
 *
 * A new `Asset` is **staged**: it names an object someone uploaded somewhere temporary. Attaching it
 * moves (or copies) that object under the key its attachment options produce, and from then on it is
 * `persisted` and owns that key. The attachment subscriber does this on flush; nothing else has to.
 */
export class Asset implements IAsset {
  private _url?: string;
  private _disk?: Disk;
  private _attachmentOptions?: ResolvedAttachmentOptions;
  private props: AssetProps;

  /**
   * `props` is optional because class-transformer rebuilds an instance it walks into by calling its
   * constructor with no arguments.
   */
  constructor(props?: AssetProps) {
    this.props = props ?? ({} as AssetProps);
    if (props?.url) {
      this._url = props.url;
    }
    this.hideCollaborators();
  }

  private hideCollaborators(): void {
    for (const key of ['_disk', '_attachmentOptions'] as const) {
      Object.defineProperty(this, key, {
        value: undefined,
        writable: true,
        enumerable: false,
        configurable: true,
      });
    }
  }

  private get disk(): Disk {
    if (!this._disk) {
      throw new Error('Disk not set');
    }
    return this._disk;
  }

  private get attachmentOptions(): ResolvedAttachmentOptions {
    if (!this._attachmentOptions) {
      throw new Error('Attachment options not set');
    }
    return this._attachmentOptions;
  }

  @Expose()
  get size() {
    return this.props.size;
  }

  @Expose()
  get mimeType() {
    return this.props.mimeType;
  }

  @Expose()
  get name() {
    if (!this.props.name) {
      throw new Error('Asset name not set');
    }
    return this.props.name;
  }

  @Expose()
  get persisted() {
    return this.props.persisted || false;
  }

  @Expose()
  get extname() {
    return this.props.extname;
  }

  /** The object's URL, signed for a private disk. Throws {@link UrlNotLoadedError} until computed. */
  @Expose()
  get url() {
    if (!this._url) {
      throw new UrlNotLoadedError();
    }
    return this._url;
  }

  /** Resolves {@link url} from the disk, when the attachment asks for `preComputeUrl`. */
  public async computeUrl() {
    if (!this.attachmentOptions?.preComputeUrl) {
      return;
    }

    const disk = this.disk;
    const visibility = await disk.getVisibility(this.name);
    this._url =
      visibility === 'private'
        ? await disk.getSignedUrl(this.name)
        : await disk.getUrl(this.name);
  }

  /**
   * The write path: binds the disk and, when the asset is still staged, promotes it into its owned
   * key. `preComputeUrl` defaults to `true`.
   */
  public async initializeAttachment(
    disk: Disk,
    declared: AttachmentOptions = {},
  ) {
    const resolved = resolveAttachmentOptions(declared);
    const options: ResolvedAttachmentOptions = {
      ...resolved,
      preComputeUrl: resolved.preComputeUrl ?? true,
    };
    this._disk = disk;
    this._attachmentOptions = options;
    if (!this.props.persisted) {
      await this.attach();
    }
    if (options.preComputeUrl) {
      await this.computeUrl();
    }
  }

  /**
   * The read path: binds the disk and resolves the URL without ever touching storage, even for an
   * asset that claims `persisted: false`.
   */
  public async bindAttachment(disk: Disk, declared: AttachmentOptions = {}) {
    const options = resolveAttachmentOptions(declared);
    this._disk = disk;
    this._attachmentOptions = {
      ...options,
      preComputeUrl: options.preComputeUrl ?? true,
    };
    if (this._attachmentOptions.preComputeUrl) {
      await this.computeUrl();
    }
  }

  /** Undoes an attach in memory, once the object was put back under `previousName`. */
  public revertAttachment(previousName: string) {
    this.props.name = previousName;
    this.props.persisted = false;
    this._url = undefined;
  }

  /** What the database column holds. The URL is derived, and a signed one expires, so it is left out. */
  public toPersistence(): AssetProps {
    return {
      name: this.props.name,
      size: this.props.size,
      extname: this.props.extname,
      mimeType: this.props.mimeType,
      persisted: this.persisted,
    };
  }

  private generateName(): string {
    const folder = this.attachmentOptions?.folder;
    return `${folder ? `${folder}/` : ''}${randomKey()}.${this.extname}`;
  }

  private async attach(): Promise<void> {
    const oldName = String(this.props.name);
    const newName = this.generateName();
    this.props.persisted = true;
    if (this.attachmentOptions.keepSource) {
      await this.disk.copy(oldName, newName);
    } else {
      await this.disk.move(oldName, newName);
    }
    this.props.name = newName;
    this._url = undefined;
    await this.computeUrl();
  }

  /** A staged copy of another asset's data. */
  static fromAsset(asset: IAsset) {
    return new Asset({ ...asset, persisted: false });
  }

  /**
   * An asset whose bytes only exist in memory, such as a generated report. The bytes are written
   * straight to the owned key when the asset is attached.
   */
  static fromBuffer(
    contents: Buffer,
    props: { fileName: string; extname: string; mimeType: string },
  ) {
    const asset = new Asset({
      name: `unattached/${randomKey()}/${props.fileName}`,
      extname: props.extname,
      mimeType: props.mimeType,
      size: contents.byteLength,
      persisted: false,
    });

    asset.initializeAttachment = async (disk, declared = {}) => {
      const resolved = resolveAttachmentOptions(declared);
      asset._disk = disk;
      asset._attachmentOptions = {
        ...resolved,
        preComputeUrl: resolved.preComputeUrl ?? true,
      };

      const name = asset.generateName();
      await disk.put(name, contents);

      asset.props.name = name;
      asset.props.persisted = true;
      asset._url = undefined;
      await asset.computeUrl();
    };

    return asset;
  }

  /**
   * An asset downloaded from `url` when it is attached: the bytes are put under
   * `<folder>/<name>.<extension>` and then promoted like any staged upload.
   */
  static fromUrl(
    url: string,
    folder = 'tmp',
    name = '',
    autoInitialize = false,
  ) {
    const key = name || randomKey();
    const asset = new Asset({
      extname: 'tmp',
      mimeType: 'tmp',
      size: 0,
      name: `${folder}/${key}.tmp`,
      url: autoInitialize ? url : undefined,
    });
    const initializeAttachment = asset.initializeAttachment.bind(asset);
    asset.initializeAttachment = async (disk, declared) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Could not download ${url}: ${response.status} ${response.statusText}`,
        );
      }
      const contents = Buffer.from(await response.arrayBuffer());
      const mimeType = (
        response.headers.get('content-type') ?? 'application/octet-stream'
      )
        .split(';')[0]
        .trim();
      const extname = mimeType.split('/')[1] ?? 'tmp';

      asset.props = {
        ...asset.props,
        extname,
        mimeType,
        size: contents.byteLength,
        name: `${folder}/${key}.${extname}`,
      };
      await disk.put(asset.name, contents);
      await initializeAttachment(disk, { ...declared, preComputeUrl: true });
    };
    return asset;
  }

  toJSON() {
    return {
      ...this.props,
      url: this._url,
    };
  }
}
