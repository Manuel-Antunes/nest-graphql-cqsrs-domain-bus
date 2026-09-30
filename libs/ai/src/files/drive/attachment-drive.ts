import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Storage, type StorageDisk } from '@nestjs/storage';
import { Attachment } from '@nestposts/asset/domain/asset/attachment';

import { AttachmentScope } from '../domain/attachment-scope';
import {
  type AttachmentSidecar,
  SidecarKeys,
} from '../domain/attachment-sidecar';
import { DriveBackend } from './drive.backend';
import { RunScope } from './run-scope';

export interface LoadedAttachment {
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
}

@Injectable()
export class AttachmentDrive {
  private static readonly PUT_ATTEMPTS = 3;
  private static readonly PUT_RETRY_DELAY_MS = 250;

  private readonly logger = new Logger(AttachmentDrive.name);

  constructor(@Inject(Storage) private readonly storage: Storage) {}

  disk(name?: string): StorageDisk {
    return this.storage.disk(name);
  }

  diskNameOf(name?: string): string {
    return name ?? this.storage.defaultDisk;
  }

  backend(diskName?: string): DriveBackend {
    return new DriveBackend({
      disk: this.disk(diskName),
      rootPrefix: (context) =>
        AttachmentScope.rootOf(context.config?.configurable),
    });
  }

  async store(
    attachment: Attachment,
    placement: { disk: string; path: string },
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= AttachmentDrive.PUT_ATTEMPTS; attempt++) {
      try {
        const write = await attachment.store(this.storage, placement);
        await write.commit();
        return true;
      } catch (error) {
        this.logger.error(
          `[store] ${placement.disk}:${placement.path} failed (attempt ${attempt}/${AttachmentDrive.PUT_ATTEMPTS}): ${AttachmentDrive.messageOf(error)}`,
        );
        if (attempt < AttachmentDrive.PUT_ATTEMPTS) {
          await sleep(AttachmentDrive.PUT_RETRY_DELAY_MS * attempt);
        }
      }
    }
    return false;
  }

  publicUrlOf(asset: { disk?: string; path: string }): string | undefined {
    try {
      return this.disk(asset.disk).url(asset.path);
    } catch {
      return undefined;
    }
  }

  async writeSidecar(sidecar: AttachmentSidecar): Promise<void> {
    try {
      await this.disk(sidecar.asset.disk).put(
        SidecarKeys.beside(sidecar.asset.path),
        JSON.stringify(sidecar, null, 2),
        { contentType: 'application/json' },
      );
    } catch (error) {
      this.logger.warn(
        `[writeSidecar] sourceId="${sidecar.sourceId}": ${AttachmentDrive.messageOf(error)}`,
      );
    }
  }

  async sidecar(
    root: string,
    sourceId: string,
    diskName?: string,
  ): Promise<AttachmentSidecar | null> {
    try {
      return JSON.parse(
        await this.disk(diskName).getText(SidecarKeys.of(root, sourceId)),
      ) as AttachmentSidecar;
    } catch {
      return null;
    }
  }

  async catalog(root: string, diskName?: string): Promise<AttachmentSidecar[]> {
    const disk = this.disk(diskName);
    const prefix = SidecarKeys.trim(root);
    const sidecars: AttachmentSidecar[] = [];
    try {
      for await (const entry of disk.listAll({
        prefix: prefix ? `${prefix}/` : '',
      })) {
        if (!SidecarKeys.isSidecar(entry.key)) continue;
        try {
          sidecars.push(JSON.parse(await disk.getText(entry.key)));
        } catch {
          this.logger.warn(`[catalog] unreadable sidecar "${entry.key}"`);
        }
      }
    } catch (error) {
      this.logger.warn(
        `[catalog] "${prefix}": ${AttachmentDrive.messageOf(error)}`,
      );
      return [];
    }
    return sidecars.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }

  async holdsBytesOf(sidecar: AttachmentSidecar): Promise<boolean> {
    try {
      return await this.disk(sidecar.asset.disk).exists(sidecar.asset.path);
    } catch (error) {
      this.logger.warn(
        `[holdsBytesOf] "${sidecar.asset.path}": ${AttachmentDrive.messageOf(error)}`,
      );
      return true;
    }
  }

  async load(
    sourceId: string,
    root = RunScope.attachmentRoot(),
    diskName?: string,
  ): Promise<LoadedAttachment> {
    const sidecar = await this.sidecar(root, sourceId, diskName);
    if (!sidecar) {
      throw new Error(
        `Nenhum anexo encontrado com sourceId="${sourceId}" — verifique o rótulo do anexo na conversa.`,
      );
    }
    const attachment = Attachment.restore(sidecar.asset).bindTo(
      this.disk(sidecar.asset.disk),
    );
    return {
      buffer: await attachment.getBuffer(),
      mimeType: sidecar.mimeType,
      fileName: sidecar.fileName,
    };
  }

  private static messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
