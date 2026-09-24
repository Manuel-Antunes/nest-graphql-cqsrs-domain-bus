'use client';

import { useEffect, useState } from 'react';
import type { OrganizationAuthClient } from '@better-auth-ui/core/plugins/organization';
import { useAuth, useAuthPlugin } from '@better-auth-ui/react';
import { useCheckSlug } from '@better-auth-ui/react/plugins/organization';
import {
  Field,
  FieldError,
  FieldLabel,
} from '@nestposts/ui/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@nestposts/ui/components/ui/input-group';
import { Spinner } from '@nestposts/ui/components/ui/spinner';
import { useDebouncer } from '@tanstack/react-pacer';
import { Check, X } from 'lucide-react';

import { organizationPlugin } from '@/lib/auth/organization-plugin';

export type SlugFieldProps = {
  value: string;
  onChange: (value: string) => void;
  currentSlug?: string;
  disabled?: boolean;
  id?: string;
};

export function sanitizeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function SlugField({
  value,
  onChange,
  currentSlug,
  disabled,
  id = 'slug',
}: SlugFieldProps) {
  const { authClient, localization: authLocalization } =
    useAuth<OrganizationAuthClient>();
  const {
    localization,
    checkSlug: checkSlugEnabled,
    slugPrefix,
  } = useAuthPlugin(organizationPlugin);

  const [slugError, setSlugError] = useState<string>();

  const {
    mutate: checkSlug,
    data: checkSlugData,
    error: checkSlugError,
    reset: resetCheckSlug,
  } = useCheckSlug(authClient);

  const debouncer = useDebouncer(
    (next: string) => {
      if (!checkSlugEnabled || !next.trim() || next.trim() === currentSlug)
        return;

      checkSlug({ slug: next.trim() });
    },
    { wait: 500 },
  );

  useEffect(() => {
    setSlugError(undefined);

    if (!checkSlugEnabled) return;

    resetCheckSlug();
    debouncer.maybeExecute(value);
  }, [checkSlugEnabled, value, debouncer.maybeExecute, resetCheckSlug]);

  return (
    <Field data-invalid={!!slugError}>
      <FieldLabel htmlFor={id}>{localization.slug}</FieldLabel>

      <InputGroup>
        {slugPrefix && (
          <InputGroupAddon align="inline-start">{slugPrefix}</InputGroupAddon>
        )}

        <InputGroupInput
          id={id}
          name="slug"
          value={value}
          onChange={(e) => {
            onChange(sanitizeSlug(e.target.value));
            setSlugError(undefined);
          }}
          onInvalid={(e) => {
            e.preventDefault();
            setSlugError(authLocalization.auth.fieldRequired);
          }}
          aria-invalid={!!slugError}
          placeholder={localization.slugPlaceholder}
          required
          disabled={disabled}
        />

        {checkSlugEnabled && !!value.trim() && value.trim() !== currentSlug && (
          <InputGroupAddon align="inline-end">
            {checkSlugData?.status ? (
              <Check className="size-4 text-foreground" />
            ) : checkSlugError ? (
              <X className="size-4 text-destructive" />
            ) : (
              <Spinner />
            )}
          </InputGroupAddon>
        )}
      </InputGroup>

      <FieldError>{slugError}</FieldError>
    </Field>
  );
}
