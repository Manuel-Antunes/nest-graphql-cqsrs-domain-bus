import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import type { ClientDraft, ContactDraft } from '../model/client';
import { WebPage } from './web-page';

/** `/clients`: the organization's clients, each opened in a sheet with its Chatwoot contacts. */
export class ClientsPage extends WebPage {
  constructor(page: Page) {
    super(page, '/clients');
  }

  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Clients', exact: true });
  }

  get belongsToAnOrganization(): Locator {
    return this.page.getByText('Clients belong to an organization');
  }

  row(name: string): Locator {
    return this.page.getByRole('row').filter({ hasText: name });
  }

  get sheet(): Locator {
    return this.page.getByRole('dialog');
  }

  linkedContact(name: string): Locator {
    return this.sheet.getByRole('listitem').filter({ hasText: name });
  }

  get noContactMatches(): Locator {
    return this.sheet.getByText(
      "No contact in this organization's Chatwoot matches.",
    );
  }

  async register(client: ClientDraft): Promise<void> {
    await this.page.getByRole('button', { name: 'New client' }).click();
    const form = this.page.getByRole('dialog', { name: 'New client' });
    await form.getByLabel('Full name').fill(client.name);
    await form.getByLabel('CPF').pressSequentially(client.cpf);
    await form.getByRole('button', { name: 'Register client' }).click();
    await expect(form).toBeHidden();
    await expect(this.row(client.name)).toBeVisible();
  }

  async openClient(name: string): Promise<void> {
    await this.row(name).getByRole('button', { name }).click();
    await expect(this.sheet.getByRole('heading', { name })).toBeVisible();
  }

  async createContact(contact: ContactDraft): Promise<void> {
    await this.sheet.getByLabel('Contact name').fill(contact.name);
    await this.sheet.getByLabel('Contact email').fill(contact.email);
    await this.sheet
      .getByRole('button', { name: 'Create in Chatwoot and link' })
      .click();
    await expect(this.linkedContact(contact.name)).toBeVisible();
  }

  async searchContacts(term: string): Promise<void> {
    await this.sheet
      .getByPlaceholder('Search Chatwoot contacts by name or email')
      .fill(term);
  }

  async openInChatwoot(contact: string): Promise<void> {
    await this.linkedContact(contact)
      .getByRole('link', { name: 'Open in Chatwoot' })
      .click();
    await this.page.waitForURL(
      /\/atendimento\/app\/accounts\/\d+\/contacts\/\d+/,
    );
  }
}
