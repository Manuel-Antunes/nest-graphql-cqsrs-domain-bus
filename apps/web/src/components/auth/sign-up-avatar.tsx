'use client';

import { type ChangeEvent, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@better-auth-ui/react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@nestposts/ui/components/ui/avatar';
import { Button } from '@nestposts/ui/components/ui/button';
import { Field, FieldLabel } from '@nestposts/ui/components/ui/field';
import { User2 } from 'lucide-react';

export type SignUpAvatarProps = {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
};

export function SignUpAvatar({ file, onChange, disabled }: SignUpAvatarProps) {
  const { localization } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : undefined),
    [file],
  );

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.files?.[0] ?? null);
    event.target.value = '';
  }

  return (
    <Field>
      <FieldLabel htmlFor="avatar">
        {localization.settings.avatar}
        <span className="text-muted-foreground">
          {localization.auth.optional}
        </span>
      </FieldLabel>

      <input
        ref={inputRef}
        id="avatar"
        name="avatar"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="hidden"
        disabled={disabled}
        onChange={handleFileChange}
      />

      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="ghost"
          className="h-auto w-auto rounded-full p-0"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Avatar className="size-12 rounded-full bg-muted text-foreground">
            <AvatarImage src={preview} alt={file?.name} />
            <AvatarFallback className="text-muted-foreground!">
              <User2 className="size-4" />
            </AvatarFallback>
          </Avatar>
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {file
            ? localization.settings.changeAvatar
            : localization.settings.uploadAvatar}
        </Button>

        {file && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            {localization.settings.deleteAvatar}
          </Button>
        )}
      </div>
    </Field>
  );
}
