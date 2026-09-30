require 'rails_helper'

RSpec.describe 'Apollo federation _service' do
  it 'exposes _service.sdl via apollo-federation gem' do
    result = ChatwootSchema.execute('{ _service { sdl } }', context: {})
    expect(result['errors']).to be_nil

    sdl = result.dig('data', '_service', 'sdl')
    expect(sdl).to be_a(String)
    expect(sdl).to include('https://specs.apollo.dev/federation/v2.3')
  end
end

