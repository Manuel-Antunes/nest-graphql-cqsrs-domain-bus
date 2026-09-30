# frozen_string_literal: true

module Resolvers
  # Scopes the `contacts` query to the current account's resolved contacts
  # (mirrors Api::V1::Accounts::ContactsController#resolved_contacts), then
  # applies optional label / unassigned filters. Replaces the unscoped
  # `Contact.all` that @paginate would otherwise produce.
  class ContactsBuilder
    def self.call(_relation, args, ctx)
      account = GraphqlAuthorization.current_account!(ctx)

      scoped = account.contacts.resolved_contacts(use_crm_v2: account.feature_enabled?('crm_v2'))

      labels = args[:labels] || args['labels']
      scoped = scoped.tagged_with(labels, any: true) if labels.present?

      if args[:unassigned] || args['unassigned']
        # Contacts NOT linked to any judgment creditor or heir (contact_links).
        scoped = scoped.left_joins(:contact_links).where(contact_links: { id: nil })
      end

      scoped
    end
  end
end
