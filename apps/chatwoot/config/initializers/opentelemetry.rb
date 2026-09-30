# frozen_string_literal: true

# OpenTelemetry SDK initialization for Chatwoot Rails + Sidekiq.
#
# Disabled when no OTLP endpoint is configured — keeps local dev / CI
# silent and avoids spamming logs with "exporter failed" warnings when
# no collector is reachable. The infra wires `OTEL_EXPORTER_OTLP_ENDPOINT`
# to the SigNoz collector ALB in every deployed stage.
return if ENV['OTEL_EXPORTER_OTLP_ENDPOINT'].blank?
return if ENV['OTEL_SDK_DISABLED'].present?

# Default service name + deployment env so chatwoot doesn't land on SigNoz
# as `unknown_service` when running locally (the deployed stages set
# `OTEL_SERVICE_NAME` / `OTEL_RESOURCE_ATTRIBUTES` explicitly via infra,
# so this only fills the gap for dev). Setting the env vars is the
# canonical path — `OpenTelemetry::SDK.configure` reads them itself, and
# this way the autoloaded resource detectors pick the same value.
ENV['OTEL_SERVICE_NAME'] ||= 'chatwoot-rails'
ENV['OTEL_RESOURCE_ATTRIBUTES'] = [
  ENV['OTEL_RESOURCE_ATTRIBUTES'],
  "service.name=#{ENV['OTEL_SERVICE_NAME']}",
  "deployment.environment=#{Rails.env}"
].compact.reject(&:empty?).join(',')

require 'opentelemetry/sdk'
require 'opentelemetry/exporter/otlp'
require 'opentelemetry/instrumentation/all'
# Logs signal — pre-1.0 gems are loaded conditionally so the Gemfile
# bump doesn't break boot in environments that haven't bundled them yet.
begin
  # Require paths are `opentelemetry/sdk/logs` (NOT `.../logs/sdk`) and
  # `opentelemetry/exporter/otlp_logs` (underscore, NOT nested `.../otlp/logs`).
  # The previous swapped/nested paths raised LoadError, which the rescue below
  # swallowed — silently setting `logs_signal_available = false` and disabling
  # the ENTIRE logs signal even though the gems were installed. That's why
  # chatwoot shipped traces but never a single log line to the collector.
  require 'opentelemetry/sdk/logs'
  require 'opentelemetry/exporter/otlp_logs'
  logs_signal_available = true
rescue LoadError
  logs_signal_available = false
end

OpenTelemetry::SDK.configure do |c|
  # Service name + resource attributes are read from the standard env vars
  # (`OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`) injected by infra. We
  # don't override here so a single deploy can be re-tagged via env without
  # a code change.
  instrumentation_config = {}
  c.service_name = 'chatwoot'

  # rack-mini-profiler patches Net::HTTP#request via alias_method while OTel
  # uses Module#prepend. With both active the patched methods call each other
  # forever → SystemStackError. Mini-profiler is dev-only, so skip the
  # Net::HTTP instrumentation when it's loaded.
  if Rails.env.development? && ENV['DISABLE_MINI_PROFILER'].blank?
    instrumentation_config['OpenTelemetry::Instrumentation::Net::HTTP'] = { enabled: false }
  end

  c.use_all(instrumentation_config) # auto-enable every available instrumentation gem
end

if logs_signal_available
  # Wire up the OTLP log exporter as a global LoggerProvider, then attach
  # a Rails.logger broadcast so every `Rails.logger.info(...)` call also
  # emits an OpenTelemetry log record. Without this, Rails logs would only
  # land on stdout — SigNoz would show traces and metrics but no log lines
  # for chatwoot.
  log_exporter = OpenTelemetry::Exporter::OTLP::Logs::LogsExporter.new
  log_processor = OpenTelemetry::SDK::Logs::Export::BatchLogRecordProcessor.new(log_exporter)
  logger_provider = OpenTelemetry::SDK::Logs::LoggerProvider.new(
    resource: OpenTelemetry.tracer_provider.instance_variable_get(:@resource)
  )
  logger_provider.add_log_record_processor(log_processor)
  OpenTelemetry.logger_provider = logger_provider

  otel_logger = logger_provider.logger(name: 'chatwoot-rails')

  # Bridge — every record going through Rails.logger is emitted to OTel
  # too, with severity mapped to the OTel severity number.
  severity_text_to_number = {
    'DEBUG' => 5,
    'INFO' => 9,
    'WARN' => 13,
    'ERROR' => 17,
    'FATAL' => 21,
    'UNKNOWN' => 1
  }.freeze

  # Bridge Rails.logger -> OTel. On Rails 7.1+ `Rails.logger` is an
  # ActiveSupport::BroadcastLogger whose #info/#warn/#error fan out to each sink
  # and DO NOT funnel through #add — so the previous `extend(:add)` override
  # never fired and no log records were emitted (traces/metrics shipped, logs
  # didn't). Instead, register a dedicated sink whose OWN #add emits an OTel
  # LogRecord and broadcast to it: the BroadcastLogger calls each sink's level
  # methods, which DO funnel through that sink's #add. Falls back to extending
  # #add directly for a plain (non-broadcast) Logger.
  otel_sink_class = Class.new(ActiveSupport::Logger) do
    def initialize(otel_logger, severity_map)
      super(File::NULL) # no real output device; #add is overridden, never writes
      @otel_logger = otel_logger
      @severity_map = severity_map
    end

    def add(severity, message = nil, progname = nil, &block)
      severity ||= UNKNOWN
      return true if severity < level

      text = message || (block && block.call) || progname
      severity_text = format_severity(severity)
      begin
        @otel_logger.on_emit(
          severity_text: severity_text,
          severity_number: @severity_map.fetch(severity_text.to_s, 9),
          body: text.to_s
        )
      rescue StandardError
        # never let a misbehaving exporter break Rails logging
      end
      true
    end
  end

  otel_sink = otel_sink_class.new(otel_logger, severity_text_to_number)
  otel_sink.level = Rails.logger.level

  if Rails.logger.respond_to?(:broadcast_to)
    Rails.logger.broadcast_to(otel_sink)
  else
    Rails.logger.extend(Module.new do
      define_method(:add) do |severity, message = nil, progname = nil, &block|
        result = super(severity, message, progname, &block)
        otel_sink.add(severity, message, progname, &block)
        result
      end
    end)
  end
end
