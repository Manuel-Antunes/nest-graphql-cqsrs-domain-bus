require Rails.root.join('lib/redis/config')
require Rails.root.join('lib/sidekiq/send_reply_success_publisher_middleware')

schedule_file = 'config/schedule.yml'

Sidekiq.configure_client do |config|
  config.redis = Redis::Config.app
end

# Logs whenever a job is pulled off Redis for execution.
class ChatwootDequeuedLogger
  def call(_worker, job, queue)
    payload = job['args'].first
    Sidekiq.logger.info("Dequeued #{job['wrapped']} #{payload['job_id']} from #{queue}")
    yield
  end
end

Sidekiq.configure_server do |config|
  config.redis = Redis::Config.app

  # Outgoing WhatsApp bubbles are spaced by scheduling the Evolution/api-inbox
  # webhook with a per-message `wait` (~1.5s each — see WebhookListener). The
  # scheduler's default ~5s average poll is too coarse for that: it would batch
  # several past-due jobs into one poll and let workers pick them up out of
  # order, reintroducing the reordering the delay is meant to prevent. Poll far
  # more often so a sub-second/1.5s wait resolves promptly and sequentially.
  config[:average_scheduled_poll_interval] = ENV.fetch('SIDEKIQ_SCHEDULED_POLL_INTERVAL_SECONDS', '0.5').to_f

  config.server_middleware do |chain|
    chain.add Sidekiq::SendReplySuccessPublisherMiddleware

    if ActiveModel::Type::Boolean.new.cast(ENV.fetch('ENABLE_SIDEKIQ_DEQUEUE_LOGGER', false))
      chain.add ChatwootDequeuedLogger
    end
  end

  # skip the default start stop logging
  if Rails.env.production?
    config.logger.formatter = Sidekiq::Logger::Formatters::JSON.new
    config[:skip_default_job_logging] = true
    config.logger.level = Logger.const_get(ENV.fetch('LOG_LEVEL', 'info').upcase.to_s)
  end
end

# https://github.com/ondrejbartas/sidekiq-cron
Rails.application.reloader.to_prepare do
  Sidekiq::Cron::Job.load_from_hash YAML.load_file(schedule_file) if File.exist?(schedule_file) && Sidekiq.server?
end
