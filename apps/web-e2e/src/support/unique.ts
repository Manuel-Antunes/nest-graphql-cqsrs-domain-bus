export class Unique {
  static suffix(): string {
    return `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  }

  static email(name: string, domain = 'example.com'): string {
    return `${name.toLowerCase()}-${Unique.suffix()}@${domain}`;
  }
}
