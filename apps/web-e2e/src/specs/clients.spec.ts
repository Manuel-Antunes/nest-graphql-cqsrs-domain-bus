import { expect, test } from '../fixtures/test';
import {
  ClientsWithContacts,
  RegisterClient,
} from '../infrastructure/graphql/operations/clients.operations';
import {
  CreateSupportContact,
  LinkSupportContact,
  SupportContacts,
} from '../infrastructure/graphql/operations/support.operations';
import { ClientDrafts } from '../model/client';
import { Unique } from '../support/unique';

/**
 * **A client is the platform's; its contacts are Chatwoot's; the gateway joins them.**
 *
 * A client lives in its organization's tenant, owned by the `posts` subgraph; a Chatwoot contact is
 * linked to it by id, and the `chatwoot` subgraph contributes `Client.contacts`. The Clients screen
 * registers the one, creates and links the other, and opens a contact in the embedded dashboard.
 */
const DASHBOARD = { timeout: 120_000 };

test.describe('clients and their Chatwoot contacts', () => {
  test.describe.configure({ timeout: 240_000 });

  test('a client registered on the platform lists the Chatwoot contact created for it, which opens inside the embedded Chatwoot', async ({
    app,
    graphql,
    registration,
    authentication,
    organizations,
    chatwootRecords,
  }) => {
    const owner = await registration.freshAccount('Clients');
    const organization = `Clients ${Unique.suffix()}`;
    const client = ClientDrafts.fresh('Maria Oliveira');
    const contact = ClientDrafts.contactOf(client);

    await authentication.signIn(owner);
    await organizations.create(organization);
    await app.clients.open();
    await app.clients.register(client);
    await app.clients.openClient(client.name);
    await app.clients.createContact(contact);

    const { clients } = await graphql.data(ClientsWithContacts);
    const registered = clients.edges
      .map((edge) => edge.node)
      .find((node) => node.name === client.name);
    expect(registered?.contacts.nodes).toEqual([
      expect.objectContaining({
        name: contact.name,
        client: { id: registered?.id },
      }),
    ]);
    expect(await chatwootRecords.clientLinkedTo(contact.name)).toBe(
      registered?.id,
    );

    await app.clients.openInChatwoot(contact.name);
    const account = await chatwootRecords.accountOf(organization);
    await expect
      .poll(() => app.support.framedPath(), DASHBOARD)
      .toMatch(new RegExp(`^/app/accounts/${account?.id}/contacts/\\d+`));
    await expect(app.support.frame.getByText(contact.name).first()).toBeVisible(
      DASHBOARD,
    );
  });

  test('another organization neither sees a client nor reaches its contacts', async ({
    app,
    graphql,
    registration,
    authentication,
    organizations,
  }) => {
    const owner = await registration.freshAccount('Walls');
    const suffix = Unique.suffix();
    const acme = `Acme ${suffix}`;
    const globex = `Globex ${suffix}`;
    const acmeClient = ClientDrafts.fresh('Acme Client');
    const acmeContact = ClientDrafts.contactOf(acmeClient);
    const globexClient = ClientDrafts.fresh('Globex Client');

    await authentication.signIn(owner);
    await organizations.create(acme);
    const { createClient } = await graphql.data(RegisterClient, {
      input: { name: acmeClient.name, cpf: acmeClient.cpf },
    });
    const { createContact } = await graphql.data(CreateSupportContact, {
      input: { name: acmeContact.name, email: acmeContact.email },
    });
    await graphql.data(LinkSupportContact, {
      input: {
        contactId: createContact?.contact?.id ?? '',
        clientId: createClient.id,
      },
    });

    await organizations.create(globex);
    const { clients } = await graphql.data(ClientsWithContacts);
    expect(clients.edges.map((edge) => edge.node.name)).not.toContain(
      acmeClient.name,
    );
    const searched = await graphql.data(SupportContacts, {
      where: { column: 'NAME', operator: 'CONTAINS', value: acmeContact.name },
    });
    expect(searched.contacts.data).toEqual([]);

    await app.clients.open();
    await expect(app.clients.row(acmeClient.name)).toHaveCount(0);
    await app.clients.register(globexClient);
    await app.clients.openClient(globexClient.name);
    await app.clients.searchContacts(acmeContact.name);
    await expect(app.clients.noContactMatches).toBeVisible();
  });

  test('a CPF is one client per organization, and a malformed one is refused before it is stored', async ({
    graphql,
    registration,
    authentication,
    organizations,
  }) => {
    const owner = await registration.freshAccount('Cpf');
    const suffix = Unique.suffix();
    const client = ClientDrafts.fresh('Same Person');

    await authentication.signIn(owner);
    await organizations.create(`Acme ${suffix}`);
    await graphql.data(RegisterClient, {
      input: { name: client.name, cpf: ClientDrafts.formatted(client.cpf) },
    });

    const twice = await graphql.execute(RegisterClient, {
      input: { name: `${client.name} again`, cpf: client.cpf },
    });
    expect(twice.errors?.[0]?.extensions?.code).toBe('CONFLICT');

    const malformed = await graphql.execute(RegisterClient, {
      input: { name: 'Nobody', cpf: '123.456.789-00' },
    });
    expect(malformed.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');

    await organizations.create(`Globex ${suffix}`);
    const elsewhere = await graphql.data(RegisterClient, {
      input: { name: client.name, cpf: client.cpf },
    });
    expect(elsewhere.createClient.cpf).toBe(client.cpf);
  });

  test('clients belong to an organization: outside one, the screen says so', async ({
    app,
    accounts,
    authentication,
  }) => {
    await authentication.signIn(accounts.reader);
    await app.clients.open();

    await expect(app.clients.belongsToAnOrganization).toBeVisible();
  });
});
