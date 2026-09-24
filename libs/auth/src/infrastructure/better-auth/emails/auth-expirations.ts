const MINUTE = 60;

export const AuthExpirations = {
  emailVerificationSeconds: 60 * MINUTE,
  passwordResetSeconds: 60 * MINUTE,
  magicLinkSeconds: 5 * MINUTE,
  emailOtpSeconds: 5 * MINUTE,
  twoFactorOtpMinutes: 5,
  accountDeletionSeconds: 24 * 60 * MINUTE,
  invitationSeconds: 48 * 60 * MINUTE,
} as const;

export const inMinutes = (seconds: number): number =>
  Math.max(1, Math.round(seconds / MINUTE));
