require 'rails_helper'
require 'lighthouse-graphql'
require_relative '../../app/graphql/test_field_resolver'

RSpec.describe '@auth directive' do
  it 'returns a GraphQL error when unauthenticated' do
    sdl = <<~GRAPHQL
      directive @auth(guards: [String!]) on FIELD_DEFINITION
      directive @field(resolver: String!) on FIELD_DEFINITION

      type Query {
        testField: String @field(resolver: "TestFieldResolver") @auth
      }
    GRAPHQL

    schema = Lighthouse::GraphQL::SchemaFactory.build_base_schema(sdl: sdl, federation: false)
    result = schema.execute('{ testField }', context: {})

    expect(result['data']['testField']).to be_nil
    expect(result['errors']).to be_present
    expect(result['errors'].first['message']).to eq('Unauthenticated.')
  end

  it 'resolves successfully when authenticated' do
    sdl = <<~GRAPHQL
      directive @auth(guards: [String!]) on FIELD_DEFINITION
      directive @field(resolver: String!) on FIELD_DEFINITION

      type Query {
        testField: String @field(resolver: "TestFieldResolver") @auth
      }
    GRAPHQL

    schema = Lighthouse::GraphQL::SchemaFactory.build_base_schema(sdl: sdl, federation: false)
    result = schema.execute('{ testField }', context: { current_user: double('user') })

    expect(result['errors']).to be_nil
    expect(result['data']['testField']).to eq('ok')
  end
end

