'use server';

import { z } from 'zod';

import { WebAuth } from '@/lib/auth/server';
import type { Session } from '@/lib/auth/session';

export interface SignInState {
  status: 'idle' | 'error' | 'ok';
  message?: string;
  code?: string;
  email?: string;
  next?: string;
}

const credentials = z.object({
  email: z.email('Informe um e-mail válido.'),
  password: z.string().min(8, 'A senha tem pelo menos 8 caracteres.'),
  name: z.string().optional(),
});

interface ApiFailure {
  body?: { code?: string; message?: string };
  message?: string;
}

function failureOf(error: unknown, email: string): SignInState {
  const failure = error as ApiFailure;
  return {
    status: 'error',
    code: failure.body?.code ?? 'InvalidCredentials',
    message: failure.body?.message ?? failure.message ?? 'Credenciais inválidas.',
    email,
  };
}

async function authenticate(
  formData: FormData,
  sign: (input: { email: string; password: string; name: string }) => Promise<unknown>,
): Promise<SignInState> {
  const parsed = credentials.safeParse({
    email: String(formData.get('email') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
    name: String(formData.get('name') ?? '').trim() || undefined,
  });

  if (!parsed.success) {
    return {
      status: 'error',
      code: 'ValidationError',
      message: parsed.error.issues[0]?.message ?? 'Credenciais inválidas.',
      email: String(formData.get('email') ?? ''),
    };
  }

  try {
    await sign({
      email: parsed.data.email,
      password: parsed.data.password,
      name: parsed.data.name ?? parsed.data.email,
    });
  } catch (error) {
    return failureOf(error, parsed.data.email);
  }

  return { status: 'ok', next: String(formData.get('next') ?? '/feed') };
}

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const auth = await WebAuth.auth();
  return authenticate(formData, ({ email, password }) =>
    auth.signInWithPassword({ email, password }),
  );
}

export async function signUp(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const auth = await WebAuth.auth();
  return authenticate(formData, ({ email, password, name }) =>
    auth.signUpWithPassword({ email, password, name }),
  );
}

export async function signOut(): Promise<void> {
  const auth = await WebAuth.auth();
  await auth.signOut().catch(() => undefined);
}

export async function currentSession(): Promise<Session | null> {
  return WebAuth.session();
}

/**
 * Asks Better Auth what the session is now.
 *
 * There is no refresh token to exchange: the cookie IS the session, and it either still resolves to
 * a row or it does not.
 */
export async function refreshSession(): Promise<Session | null> {
  return WebAuth.session();
}
