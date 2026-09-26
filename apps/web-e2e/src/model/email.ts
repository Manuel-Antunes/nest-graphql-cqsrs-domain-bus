export class EmailSender {
  static readonly NAME = 'Nest Posts';
  static readonly ADDRESS = 'no-reply@nestposts.test';

  static get header(): string {
    return `${EmailSender.NAME} <${EmailSender.ADDRESS}>`;
  }
}

export class EmailSubject {
  static readonly VERIFY_EMAIL = 'Verify your email address';
  static readonly RESET_PASSWORD = 'Reset your password';
  static readonly MAGIC_LINK = 'Sign in to Nest Posts';
  static readonly SIGN_IN_CODE = 'Your sign-in code';
  static readonly TWO_FACTOR_CODE = 'Your two-factor code';
  static readonly CONFIRM_EMAIL_CHANGE = 'Confirm your email change';
  static readonly CONFIRM_ACCOUNT_DELETION =
    'Confirm the deletion of your account';
  static readonly SUBSCRIPTION_ACTIVE = 'Your subscription is active';
  static readonly SUBSCRIPTION_CANCELED = 'Your subscription was canceled';
  static readonly SUBSCRIPTION_ENDED = 'Your subscription has ended';

  static invitation(inviter: string, organization: string): string {
    return `${inviter} invited you to ${organization}`;
  }

  static postIsLive(title: string): string {
    return `Your post “${title}” is live`;
  }
}
