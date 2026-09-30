FactoryBot.define do
  factory :contact_link do
    contact
    # A main-subgraph client id (uuid). Exequentes and herdeiros share this id space,
    # so the link carries no type.
    client_id { SecureRandom.uuid }
  end
end
