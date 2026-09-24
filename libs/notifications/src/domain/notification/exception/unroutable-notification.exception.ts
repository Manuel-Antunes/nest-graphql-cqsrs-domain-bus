export class UnroutableNotificationException extends Error {
  constructor(
    readonly type: string,
    readonly channels: readonly string[],
  ) {
    super(
      `${type} goes through ${channels.map((channel) => `"${channel}"`).join(', ')}, which nobody gave this on-demand notifiable a route for`,
    );
    this.name = 'UnroutableNotificationException';
  }
}
