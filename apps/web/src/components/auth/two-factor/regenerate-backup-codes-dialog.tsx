'use client';

import { useState } from 'react';
import type { TwoFactorAuthClient } from '@better-auth-ui/core/plugins/two-factor';
import { useAuth, useAuthPlugin } from '@better-auth-ui/react';
import { useGenerateBackupCodes } from '@better-auth-ui/react/plugins/two-factor';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@nestposts/ui/components/ui/alert-dialog';
import {
  Field,
  FieldError,
  FieldLabel,
} from '@nestposts/ui/components/ui/field';
import { Input } from '@nestposts/ui/components/ui/input';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';

import { twoFactorPlugin } from '@/lib/auth/two-factor-plugin';
import { useTwoFactorPasswordRequirement } from '@/lib/auth/use-two-factor-password';

import { useAuthForm } from '../auth-form';
import { BackupCodes } from './backup-codes';

export type RegenerateBackupCodesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RegenerateBackupCodesDialog({
  open,
  onOpenChange,
}: RegenerateBackupCodesDialogProps) {
  const { authClient, localization } = useAuth();
  const { localization: twoFactorLocalization } =
    useAuthPlugin(twoFactorPlugin);
  const { isPending: isResolvingPasswordRequirement, requiresPassword } =
    useTwoFactorPasswordRequirement();

  const [codes, setCodes] = useState<string[]>([]);

  const {
    mutateAsync: generateBackupCodes,
    isPending: isGenerating,
    reset: resetGeneration,
  } = useGenerateBackupCodes(authClient as TwoFactorAuthClient, {
    onSuccess: (data) => {
      setCodes(data.backupCodes);
      toast.success(twoFactorLocalization.backupCodesRegenerated);
    },
  });

  const isPending = isGenerating || isResolvingPasswordRequirement;

  const form = useAuthForm({
    defaultValues: { password: '' },
    onSubmit: async ({ value }) => {
      if (codes.length) {
        handleOpenChange(false);
        return;
      }
      await generateBackupCodes(
        requiresPassword ? { password: value.password } : {},
      );
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);

    if (!nextOpen) {
      setCodes([]);
      form.reset();
      resetGeneration();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <form.AppForm>
          <form.AuthFormRoot className="flex flex-col gap-6">
            <AlertDialogHeader>
              <AlertDialogMedia>
                <KeyRound />
              </AlertDialogMedia>

              <AlertDialogTitle>
                {twoFactorLocalization.backupCodes}
              </AlertDialogTitle>

              <AlertDialogDescription>
                {codes.length || !requiresPassword
                  ? twoFactorLocalization.backupCodesDescription
                  : twoFactorLocalization.passwordConfirmation}
              </AlertDialogDescription>
            </AlertDialogHeader>

            {codes.length ? (
              <BackupCodes codes={codes} />
            ) : (
              requiresPassword && (
                <form.AppField name="password">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="regenerate-backup-codes-password">
                        {localization.auth.password}
                      </FieldLabel>

                      <Input
                        id="regenerate-backup-codes-password"
                        name={field.name}
                        type="password"
                        autoComplete="current-password"
                        autoFocus
                        required
                        placeholder={localization.auth.passwordPlaceholder}
                        disabled={isPending}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                      />

                      <FieldError />
                    </Field>
                  )}
                </form.AppField>
              )
            )}

            <AlertDialogFooter>
              {!codes.length && (
                <AlertDialogCancel disabled={isPending}>
                  {localization.settings.cancel}
                </AlertDialogCancel>
              )}

              <form.AuthFormSubmitButton
                isPending={isPending}
                disabled={isPending}
              >
                {codes.length
                  ? twoFactorLocalization.done
                  : twoFactorLocalization.regenerateBackupCodes}
              </form.AuthFormSubmitButton>
            </AlertDialogFooter>
          </form.AuthFormRoot>
        </form.AppForm>
      </AlertDialogContent>
    </AlertDialog>
  );
}
