class ContactMergeAction
  include Events::Types
  pattr_initialize [:account!, :base_contact!, :mergee_contact!]

  def perform
    # This case happens when an agent updates a contact email in dashboard,
    # while the contact also update his email via email collect box
    return @base_contact if base_contact.id == mergee_contact.id

    ActiveRecord::Base.transaction do
      validate_contacts
      merge_conversations
      merge_messages
      merge_contact_inboxes
      merge_contact_notes
      merge_contact_links
      merge_calls
      merge_and_remove_mergee_contact
    end
    @base_contact
  end

  private

  def validate_contacts
    return if belongs_to_account?(@base_contact) && belongs_to_account?(@mergee_contact)

    raise StandardError, 'contact does not belong to the account'
  end

  def belongs_to_account?(contact)
    @account.id == contact.account_id
  end

  def merge_conversations
    Conversation.where(contact_id: @mergee_contact.id).update(contact_id: @base_contact.id)
  end

  def merge_contact_notes
    Note.where(contact_id: @mergee_contact.id, account_id: @mergee_contact.account_id).update(contact_id: @base_contact.id)
  end

  def merge_messages
    Message.where(sender: @mergee_contact).update(sender: @base_contact)
  end

  def merge_contact_inboxes
    ContactInbox.where(contact_id: @mergee_contact.id).update(contact_id: @base_contact.id)
  end

  # A contact's linked client (contact_links → a `Client` in the `main` subgraph, an
  # JudgmentCreditor/Heir) must be carried through the merge. It can't just be
  # left on the mergee: contact_links.contact_id is a NOT NULL, unique FK with
  # ON DELETE NO ACTION, while the association is `dependent: :destroy_async`
  # (deferred). Destroying the mergee therefore violates the FK and rolls the
  # whole merge back — which is why merging a contact with a linked client fails.
  #
  # The base contact's link takes preference (same rule as the attribute merge):
  # if the base has no linked client yet, move the mergee's link onto it so the
  # relationship follows the merge; otherwise drop the now-redundant mergee link.
  def merge_contact_links
    mergee_link = @mergee_contact.contact_links.first
    return if mergee_link.nil?

    if @base_contact.contact_links.exists?
      mergee_link.destroy!
    else
      mergee_link.update!(contact_id: @base_contact.id)
    end
  end

  def merge_calls
    # overridden in enterprise/app/actions/enterprise/contact_merge_action.rb
  end

  def merge_and_remove_mergee_contact
    mergable_attribute_keys = %w[identifier name email phone_number additional_attributes custom_attributes]
    base_contact_attributes = base_contact.attributes.slice(*mergable_attribute_keys).compact_blank
    mergee_contact_attributes = mergee_contact.attributes.slice(*mergable_attribute_keys).compact_blank

    # attributes in base contact are given preference
    merged_attributes = mergee_contact_attributes.deep_merge(base_contact_attributes)

    @mergee_contact.reload.destroy!
    Rails.configuration.dispatcher.dispatch(CONTACT_MERGED, Time.zone.now, contact: @base_contact,
                                                                           tokens: [@base_contact.contact_inboxes.filter_map(&:pubsub_token)])
    @base_contact.update!(merged_attributes)
  end
end

ContactMergeAction.prepend_mod_with('ContactMergeAction')
