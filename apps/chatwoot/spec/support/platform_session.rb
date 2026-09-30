RSpec.configure do |config|
  config.before do |example|
    next if example.metadata[:platform_session]

    allow_any_instance_of(OmniAuth::Strategies::BetterAuth).to receive(:detached_token?).and_return(false) # rubocop:disable RSpec/AnyInstance
  end
end
