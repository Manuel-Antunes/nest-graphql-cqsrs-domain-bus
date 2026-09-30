class MigrateEvolutionChannelApiRows < ActiveRecord::Migration[7.1]
  WEBHOOK_PATTERN = '%/chatwoot/webhook/%'.freeze

  def up
    apikey = ENV.fetch('EVOLUTION_API_KEY', nil)

    Channel::Api.where('webhook_url ILIKE ?', WEBHOOK_PATTERN).find_each do |old_channel|
      base, _, instance_segment = old_channel.webhook_url.to_s.partition('/chatwoot/webhook/')
      instance = URI.decode_www_form_component(instance_segment.split('?').first.to_s)

      next if base.blank? || instance.blank?

      new_channel = Channel::EvolutionApi.new(
        account_id: old_channel.account_id,
        webhook_url: old_channel.webhook_url,
        evolution_url: base,
        evolution_apikey: apikey,
        instance_name: instance,
        identifier: old_channel.identifier,
        hmac_token: old_channel.hmac_token,
        hmac_mandatory: old_channel.hmac_mandatory,
        additional_attributes: (old_channel.additional_attributes || {}).merge(
          'migrated_from_channel_api' => true,
          'migrated_at' => Time.zone.now.iso8601
        )
      )
      new_channel.save!(validate: false)

      Inbox.where(channel_type: 'Channel::Api', channel_id: old_channel.id)
           .update_all(channel_type: 'Channel::EvolutionApi', channel_id: new_channel.id)

      old_channel.delete
    end
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end
