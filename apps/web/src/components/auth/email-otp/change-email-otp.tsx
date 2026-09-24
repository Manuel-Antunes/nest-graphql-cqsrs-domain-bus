'use client';

import { useEffect, useReducer } from 'react';
import type { EmailOtpAuthClient } from '@better-auth-ui/core/plugins/email-otp';
import { useAuth, useAuthPlugin, useSession } from '@better-auth-ui/react';
import {
  useChangeEmailOtp,
  useRequestEmailChangeOtp,
  useSendVerificationOtp,
} from '@better-auth-ui/react/plugins/email-otp';
import { Button } from '@nestposts/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
} from '@nestposts/ui/components/ui/card';
import { Field, FieldLabel } from '@nestposts/ui/components/ui/field';
import { Input } from '@nestposts/ui/components/ui/input';
import { Skeleton } from '@nestposts/ui/components/ui/skeleton';
import { useSelector } from '@tanstack/react-form';
import { toast } from 'sonner';

import { emailOtpPlugin } from '@/lib/auth/email-otp-plugin';
import { cn } from '@/lib/utils';

import { submitAuthForm, useAuthForm } from '../auth-form';
import { OpenEmailButton } from '../open-email-button';
import { OtpField } from '../otp-field';

type ChangeEmailStep = 'email' | 'currentCode' | 'newCode';

type ChangeEmailState = {
  step: ChangeEmailStep;
  newEmail: string;
};

type ChangeEmailAction =
  | { type: 'currentEmailChallenged'; newEmail: string }
  | { type: 'changeRequested'; newEmail: string }
  | { type: 'restarted' };

const initialChangeEmailState: ChangeEmailState = {
  step: 'email',
  newEmail: '',
};

function changeEmailReducer(
  _state: ChangeEmailState,
  action: ChangeEmailAction,
): ChangeEmailState {
  switch (action.type) {
    case 'currentEmailChallenged':
      return { step: 'currentCode', newEmail: action.newEmail };
    case 'changeRequested':
      return { step: 'newCode', newEmail: action.newEmail };
    case 'restarted':
      return initialChangeEmailState;
  }
}

export type ChangeEmailOtpProps = {
  className?: string;
};

export function ChangeEmailOtp({ className }: ChangeEmailOtpProps) {
  const { authClient, localization } = useAuth();
  const {
    localization: emailOtpLocalization,
    otpLength,
    verifyCurrentEmail,
  } = useAuthPlugin(emailOtpPlugin);

  const otpClient = authClient as EmailOtpAuthClient;
  const { data: session } = useSession(otpClient);
  const currentEmail = session?.user.email;

  const [state, dispatch] = useReducer(
    changeEmailReducer,
    initialChangeEmailState,
  );
  const { mutateAsync: sendVerificationOtp, isPending: isSending } =
    useSendVerificationOtp(otpClient);

  const { mutateAsync: requestEmailChangeOtp, isPending: isRequesting } =
    useRequestEmailChangeOtp(otpClient, {
      onError: () => form.setFieldValue('code', ''),
      onSuccess: (_data, { newEmail }) => {
        form.setFieldValue('code', '');
        dispatch({ type: 'changeRequested', newEmail });
      },
    });

  const { mutateAsync: changeEmailOtp, isPending: isChanging } =
    useChangeEmailOtp(otpClient, {
      onError: () => form.setFieldValue('code', ''),
      onSuccess: () => {
        toast.success(localization.settings.changeEmailSuccess);
        resetFlow();
      },
    });

  const isPending = isSending || isRequesting || isChanging;

  const submitCode = async (completedCode: string) => {
    if (isPending || state.step === 'email') return;

    if (state.step === 'currentCode') {
      await requestEmailChangeOtp({
        newEmail: state.newEmail,
        otp: completedCode,
      });
      return;
    }

    await changeEmailOtp({ newEmail: state.newEmail, otp: completedCode });
  };

  const form = useAuthForm({
    defaultValues: { code: '', email: '' },
    onSubmit: async ({ value }) => {
      if (state.step === 'email') {
        const newEmail = value.email;

        if (verifyCurrentEmail && currentEmail) {
          await sendVerificationOtp(
            { email: currentEmail, type: 'change-email' },
            {
              onSuccess: () =>
                dispatch({ type: 'currentEmailChallenged', newEmail }),
            },
          );
          return;
        }

        await requestEmailChangeOtp({ newEmail });
        return;
      }
      await submitCode(value.code);
    },
  });
  const codeComplete = useSelector(
    form.store,
    (formState) => formState.values.code.length === otpLength,
  );

  const resetFlow = () => {
    form.reset();
    if (currentEmail) form.setFieldValue('email', currentEmail);
    dispatch({ type: 'restarted' });
  };

  useEffect(() => {
    if (currentEmail) form.setFieldValue('email', currentEmail);
  }, [currentEmail, form]);

  const codeTarget =
    state.step === 'currentCode' ? currentEmail : state.newEmail;

  return (
    <div>
      <h2 className="mb-3 font-semibold text-sm">
        {localization.settings.changeEmail}
      </h2>

      <form.AppForm>
        <form.AuthFormRoot>
          <Card className={cn(className)}>
            <CardContent className="flex flex-col gap-6">
              {state.step === 'email' ? (
                <form.AppField name="email">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="email">
                        {localization.auth.email}
                      </FieldLabel>

                      {session ? (
                        <Input
                          key={currentEmail}
                          id="email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          value={field.state.value}
                          placeholder={localization.auth.emailPlaceholder}
                          disabled={isPending}
                          required
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                        />
                      ) : (
                        <Skeleton>
                          <Input className="invisible" />
                        </Skeleton>
                      )}

                      <field.AuthFormFieldError />
                    </Field>
                  )}
                </form.AppField>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-muted-foreground text-sm">
                    {emailOtpLocalization.confirmEmailDescription.replace(
                      '{{email}}',
                      codeTarget ?? '',
                    )}
                  </p>

                  <form.AppField name="code">
                    {(field) => (
                      <OtpField
                        autoFocus
                        disabled={isPending}
                        label={
                          state.step === 'currentCode'
                            ? emailOtpLocalization.confirmCurrentEmail
                            : emailOtpLocalization.confirmNewEmail
                        }
                        length={otpLength}
                        name="otp"
                        value={field.state.value}
                        onChange={field.handleChange}
                        onComplete={() => void submitAuthForm(form)}
                      />
                    )}
                  </form.AppField>

                  <form.AuthFormServerError />

                  {codeTarget && (
                    <OpenEmailButton email={codeTarget} variant="secondary" />
                  )}
                </div>
              )}
            </CardContent>

            <CardFooter className="gap-3">
              {state.step !== 'email' && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={resetFlow}
                >
                  {localization.settings.cancel}
                </Button>
              )}

              <form.AuthFormSubmitButton
                isPending={isPending}
                size="sm"
                disabled={
                  isPending ||
                  !session ||
                  (state.step !== 'email' && !codeComplete)
                }
              >
                {state.step === 'email'
                  ? localization.settings.updateEmail
                  : emailOtpLocalization.verifyCode}
              </form.AuthFormSubmitButton>
            </CardFooter>
          </Card>
        </form.AuthFormRoot>
      </form.AppForm>
    </div>
  );
}
