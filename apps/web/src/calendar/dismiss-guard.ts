const DISMISS_SUPPRESS_MS = 300;

let lastDismissedAt = 0;

export function markEventDialogDismissed(): void {
  lastDismissedAt = Date.now();
}

export function wasEventDialogJustDismissed(): boolean {
  return Date.now() - lastDismissedAt < DISMISS_SUPPRESS_MS;
}
