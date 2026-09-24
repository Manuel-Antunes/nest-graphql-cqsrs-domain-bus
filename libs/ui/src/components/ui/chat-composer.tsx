'use client';

import * as React from 'react';
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@nestposts/ui/components/ui/attachment';
import { Button } from '@nestposts/ui/components/ui/button';
import { formatFileSize } from '@nestposts/ui/lib/format-file-size';
import { cn } from '@nestposts/ui/lib/utils';
import {
  File as FileIcon,
  FileText,
  Film,
  Loader2,
  Music,
  Paperclip,
  Send,
  Square,
  X,
} from 'lucide-react';

export interface ChatComposerProps {
  onSend: (text: string, files?: File[]) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  allowAttachments?: boolean;
  accept?: string;
  draft?: string | null;
  onDraftApplied?: () => void;
  composerSize?: 'default' | 'sm';
  className?: string;
}

function iconForFile(file: File) {
  if (file.type.startsWith('video/')) return <Film />;
  if (file.type.startsWith('audio/')) return <Music />;
  if (file.type.startsWith('text/') || file.type === 'application/pdf')
    return <FileText />;
  return <FileIcon />;
}

function ComposerAttachment({
  file,
  size,
  onRemove,
  disabled,
}: {
  file: File;
  size: 'xs' | 'sm';
  onRemove: () => void;
  disabled?: boolean;
}) {
  const isImage = file.type.startsWith('image/');
  const [previewUrl, setPreviewUrl] = React.useState<string>();

  React.useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <Attachment size={size} orientation="horizontal" state="done">
      <AttachmentMedia variant={isImage ? 'image' : 'icon'}>
        {isImage && previewUrl ? (
          <img src={previewUrl} alt="" />
        ) : (
          iconForFile(file)
        )}
      </AttachmentMedia>

      <AttachmentContent>
        <AttachmentTitle>{file.name}</AttachmentTitle>
        <AttachmentDescription>
          {formatFileSize(file.size)}
        </AttachmentDescription>
      </AttachmentContent>

      <AttachmentActions>
        <AttachmentAction
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remover ${file.name}`}
        >
          <X />
        </AttachmentAction>
      </AttachmentActions>
    </Attachment>
  );
}

export function ChatComposer({
  onSend,
  placeholder = 'Digite uma mensagem…',
  label,
  disabled = false,
  isStreaming = false,
  onStop,
  allowAttachments = false,
  accept,
  draft,
  onDraftApplied,
  composerSize = 'default',
  className,
}: ChatComposerProps) {
  const [value, setValue] = React.useState('');
  const [files, setFiles] = React.useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = React.useState(0);

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const locked = disabled || isStreaming;
  const canStop = isStreaming && !!onStop;
  const hasContent = value.trim().length > 0 || files.length > 0;

  React.useEffect(() => {
    if (draft == null) return;
    setValue(draft);
    onDraftApplied?.();
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [draft, onDraftApplied]);

  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, composerSize === 'sm' ? 120 : 160)}px`;
  }, [value, composerSize]);

  const addFiles = (incoming: FileList | null) => {
    if (!allowAttachments || !incoming?.length) return;
    setFiles((prev) => [...prev, ...Array.from(incoming)]);
    setFileInputKey((k) => k + 1);
  };

  const send = () => {
    if (!hasContent || locked) return;
    onSend(value.trim(), allowAttachments ? files : undefined);
    setValue('');
    setFiles([]);
    textareaRef.current?.focus();
  };

  return (
    <div
      className={cn('w-full', className)}
      onDragOver={
        allowAttachments
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
            }
          : undefined
      }
      onDrop={
        allowAttachments
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              addFiles(event.dataTransfer.files);
            }
          : undefined
      }
    >
      {allowAttachments && (
        <input
          key={fileInputKey}
          ref={fileInputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(event) => addFiles(event.target.files)}
          title="Selecionar arquivos"
        />
      )}

      {files.length > 0 && (
        <AttachmentGroup className="mb-2">
          {files.map((file, index) => (
            <ComposerAttachment
              key={`${file.name}-${file.lastModified}-${index}`}
              file={file}
              size={composerSize === 'sm' ? 'xs' : 'sm'}
              disabled={locked}
              onRemove={() =>
                setFiles((prev) => prev.filter((_, i) => i !== index))
              }
            />
          ))}
        </AttachmentGroup>
      )}

      <div
        className={cn(
          'gemeo-glass flex w-full items-end gap-1 rounded-3xl transition-opacity',
          composerSize === 'sm' ? 'py-1.5 pr-1.5 pl-2' : 'py-2 pr-2 pl-3',
          locked && 'opacity-70',
        )}
      >
        {allowAttachments && (
          <Button
            type="button"
            variant="ghost"
            size={composerSize === 'sm' ? 'icon-sm' : 'icon'}
            className="shrink-0 rounded-full"
            disabled={locked}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Anexar arquivos"
          >
            <Paperclip
              className={composerSize === 'sm' ? 'size-4' : 'size-4'}
            />
          </Button>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          onPaste={
            allowAttachments
              ? (event) => addFiles(event.clipboardData.files)
              : undefined
          }
          rows={1}
          disabled={locked}
          aria-label={label ?? placeholder}
          placeholder={isStreaming ? 'Respondendo…' : placeholder}
          className={cn(
            'flex-1 resize-none border-0 bg-transparent px-2 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed',
            composerSize === 'sm' ? 'py-1.5 text-sm' : 'py-2 text-[14px]',
          )}
        />

        {canStop ? (
          <Button
            type="button"
            variant="destructive"
            size={composerSize === 'sm' ? 'icon-sm' : 'icon'}
            className="shrink-0 rounded-full"
            onClick={onStop}
            aria-label="Cancelar resposta"
          >
            <Square className="size-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="brand"
            size={composerSize === 'sm' ? 'icon-sm' : 'icon'}
            className="shrink-0 rounded-full"
            onClick={send}
            disabled={locked || !hasContent}
            aria-label="Enviar mensagem"
          >
            {isStreaming ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
