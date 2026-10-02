export class Dates {
  private static readonly UNITS: readonly [
    Intl.RelativeTimeFormatUnit,
    number,
  ][] = [
    ['year', 365 * 24 * 60 * 60],
    ['month', 30 * 24 * 60 * 60],
    ['week', 7 * 24 * 60 * 60],
    ['day', 24 * 60 * 60],
    ['hour', 60 * 60],
    ['minute', 60],
  ];

  static relative(iso: string, now: Date = new Date()): string {
    const seconds = (new Date(iso).getTime() - now.getTime()) / 1000;
    if (!Number.isFinite(seconds)) return iso;
    const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    for (const [unit, size] of Dates.UNITS) {
      if (Math.abs(seconds) >= size) {
        return format.format(Math.round(seconds / size), unit);
      }
    }
    return 'just now';
  }
}
