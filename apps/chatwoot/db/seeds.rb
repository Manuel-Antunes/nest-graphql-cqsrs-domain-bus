# loading installation configs
GlobalConfig.clear_cache
ConfigLoader.new.process

# ## Seeds productions
# if Rails.env.production?
#   # Setup Onboarding flow
#   Redis::Alfred.set(Redis::Alfred::CHATWOOT_INSTALLATION_ONBOARDING, true)
# end

# ## Seeds for Local Development
# unless Rails.env.production?

  # Enables creating additional accounts from dashboard
  installation_config = InstallationConfig.find_by(name: 'CREATE_NEW_ACCOUNT_FROM_DASHBOARD')
  installation_config.value = true
  installation_config.save!
  GlobalConfig.clear_cache

  account = Account.first || Account.create!(
    name: 'Acme Inc',
    locale: 16 # Portuguese Brasileiro (pt-BR)
  )

  secondary_account = Account.where.not(id: account.id).first || Account.create!(
    name: 'Acme Org'
  )

  user = User.find_by(email: 'john@acme.inc')
  if user.nil?
    user = User.new(name: 'John', email: 'john@acme.inc', password: 'Password1!', type: 'SuperAdmin')
    user.skip_confirmation!
    user.save!
  else
    user.update!(type: 'SuperAdmin') if user.type != 'SuperAdmin'
  end

  if user.access_token.blank?
    user.create_access_token
    # AccessTokenable#create_access_token bypasses the association builder,
    # so reset the cache to expose the freshly created token to later reads.
    user.association(:access_token).reset
  end

  AccountUser.find_or_create_by!(
    account_id: account.id,
    user_id: user.id
  ) do |au|
    au.role = :administrator
  end

  AccountUser.find_or_create_by!(
    account_id: secondary_account.id,
    user_id: user.id
  ) do |au|
    au.role = :administrator
  end

  web_widget = Channel::WebWidget.find_by(website_url: 'https://acme.inc') || Channel::WebWidget.create!(account: account, website_url: 'https://acme.inc')

  inbox = Inbox.find_by(name: 'Acme Support', account: account) || Inbox.create!(channel: web_widget, account: account, name: 'Acme Support')
  InboxMember.find_or_create_by!(user: user, inbox: inbox)

  # Check if contact inbox exists first to prevent duplicate errors
  contact_inbox = ContactInbox.find_by(inbox: inbox) || ContactInboxWithContactBuilder.new(
    source_id: user.id,
    inbox: inbox,
    hmac_verified: true,
    contact_attributes: { name: 'jane', email: 'jane@example.com', phone_number: '+2320000' }
  ).perform

  conversation = Conversation.find_by(inbox: inbox) || Conversation.create!(
    account: account,
    inbox: inbox,
    status: :open,
    assignee: user,
    contact: contact_inbox.contact,
    contact_inbox: contact_inbox,
    additional_attributes: {}
  )

  if conversation.messages.empty?
    # sample email collect
    Seeders::MessageSeeder.create_sample_email_collect_message conversation

    Message.create!(content: 'Hello', account: account, inbox: inbox, conversation: conversation, sender: contact_inbox.contact,
                    message_type: :incoming)

    # sample location message
    #
    location_message = Message.new(content: 'location', account: account, inbox: inbox, sender: contact_inbox.contact, conversation: conversation,
                                   message_type: :incoming)
    location_message.attachments.new(
      account_id: account.id,
      file_type: 'location',
      coordinates_lat: 37.7893768,
      coordinates_long: -122.3895553,
      fallback_title: 'Bay Bridge, San Francisco, CA, USA'
    )
    location_message.save!

    # sample card
    Seeders::MessageSeeder.create_sample_cards_message conversation
    # input select
    Seeders::MessageSeeder.create_sample_input_select_message conversation
    # form
    Seeders::MessageSeeder.create_sample_form_message conversation
    # articles
    Seeders::MessageSeeder.create_sample_articles_message conversation
    # csat
    Seeders::MessageSeeder.create_sample_csat_collect_message conversation
  end

  CannedResponse.find_or_create_by!(account: account, short_code: 'start') do |c|
    c.content = 'Hello welcome to chatwoot.'
  end

  # Contact custom-attribute DEFINITIONS for the human-handoff flow. Without a
  # definition, Chatwoot stores the value on the contact's `custom_attributes`
  # but NEVER renders it in the "Contact Attributes" sidebar ("No attributes
  # found"). Mirrors the FIXED contract in
  # libs/chat/infrastructure/src/lib/agents/handoff-contact-attributes.contract.ts
  # — keep the keys in sync. Idempotent (unique on key + model + account).
  [
    { key: 'cpf',                   name: 'CPF do contato',          type: :text },
    { key: 'cpf_exequente',         name: 'CPF do exequente',        type: :text },
    { key: 'nome_exequente',        name: 'Nome do exequente',       type: :text },
    { key: 'sindicato',             name: 'Sindicato',               type: :text },
    { key: 'sindicato_id',          name: 'ID do sindicato',         type: :text },
    { key: 'e_o_proprio_exequente', name: 'É o próprio exequente?',  type: :checkbox },
    { key: 'grau_parentesco',       name: 'Grau de parentesco',      type: :text }
  ].each do |attr|
    CustomAttributeDefinition.find_or_create_by!(
      attribute_key: attr[:key],
      attribute_model: :contact_attribute,
      account_id: account.id
    ) do |cad|
      cad.attribute_display_name = attr[:name]
      cad.attribute_display_type = attr[:type]
    end
  end

  ## Integration-test fixtures consumed by the Node side
  ## (`libs/database/src/testing/chatwoot-test-server.ts`).
  ##
  ## Reuse the dev account + the `john@acme.inc` SuperAdmin defined
  ## above. Bots, channels, and assignments are idempotent so a re-run
  ## of `db:seed` never duplicates rows.
  ##
  ## Both bots are `inner_queue` type: when assigned to an inbox they
  ## publish incoming customer messages onto the internal Redis channel
  ## (`Events::Types::AGENT_BOT_INNER_QUEUE`) consumed by the NestJS
  ## generic agents subscriber, rather than POSTing to an outgoing URL.
  ## `natasha` is assigned to the WhatsApp inbox named `NATASHA`
  ## (Channel::EvolutionApi) and `email` to the Email inbox named `email`.

  natasha_bot = AgentBot.find_by(name: 'natasha', account_id: account.id) ||
                AgentBot.create!(
                  name: 'natasha',
                  description: 'Agent bot — assigned to the NATASHA inbox',
                  bot_type: :inner_queue,
                  account: account
                )
  natasha_bot.update!(bot_type: :inner_queue) unless natasha_bot.inner_queue?

  if ENV['EVOLUTION_API_URL'].present? && ENV['EVOLUTION_API_KEY'].present?
    natasha_channel = Channel::EvolutionApi.find_by(
      instance_name: 'NATASHA',
      account_id: account.id
    ) || Channel::EvolutionApi.create!(
      account: account,
      instance_name: 'NATASHA',
      evolution_url: ENV.fetch('EVOLUTION_API_URL'),
      evolution_apikey: ENV.fetch('EVOLUTION_API_KEY')
    )

    natasha_inbox = Inbox.find_by(name: 'NATASHA', account_id: account.id) ||
                    Inbox.create!(
                      name: 'NATASHA',
                      account: account,
                      channel: natasha_channel
                    )

    AgentBotInbox.find_or_create_by!(
      agent_bot_id: natasha_bot.id,
      inbox_id: natasha_inbox.id
    ) do |abi|
      abi.account_id = account.id
      abi.status = :active
    end
  end

  email_bot = AgentBot.find_by(name: 'email', account_id: account.id) ||
              AgentBot.create!(
                name: 'email',
                description: 'Agent bot — assigned to the email inbox',
                bot_type: :inner_queue,
                account: account
              )
  email_bot.update!(bot_type: :inner_queue) unless email_bot.inner_queue?

  email_channel = Channel::Email.find_by(email: 'tests-email@acme.local', account_id: account.id) ||
                  Channel::Email.create!(
                    account: account,
                    email: 'tests-email@acme.local',
                    forward_to_email: 'tests-forward@acme.local'
                  )

  email_inbox = Inbox.find_by(name: 'email', account_id: account.id) ||
                Inbox.create!(
                  name: 'email',
                  account: account,
                  channel: email_channel
                )

  AgentBotInbox.find_or_create_by!(
    agent_bot_id: email_bot.id,
    inbox_id: email_inbox.id
  ) do |abi|
    abi.account_id = account.id
    abi.status = :active
  end

  # Machine-readable markers the Node-side `spawnChatwootTestServer`
  # greps for. Re-uses the `john@acme.inc` SuperAdmin's
  # `api_access_token` (AccessTokenable creates it after_create).
  test_token = user.access_token&.token
  raise 'SuperAdmin api_access_token missing — AccessTokenable did not run' if test_token.blank?

  puts "__TEST_CHATWOOT_ACCOUNT_ID=#{account.id}"
  puts "__TEST_CHATWOOT_TOKEN=#{test_token}"
  puts "__TEST_CHATWOOT_BASE_URL=#{ENV.fetch('FRONTEND_URL', '')}"
  $stdout.flush
# end
