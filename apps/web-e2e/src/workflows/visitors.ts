import type { Browser, BrowserContextOptions } from '@playwright/test';

import type { VisitorServices } from './visitor';
import { Visitor } from './visitor';

export class Visitors {
  private readonly arrived: Visitor[] = [];

  constructor(
    private readonly browser: Browser,
    private readonly services: VisitorServices,
  ) {}

  async arrive(options: BrowserContextOptions = {}): Promise<Visitor> {
    const context = await this.browser.newContext(options);
    const visitor = new Visitor(await context.newPage(), this.services);
    this.arrived.push(visitor);
    return visitor;
  }

  async leave(): Promise<void> {
    await Promise.all(this.arrived.map((visitor) => visitor.leave()));
  }
}
