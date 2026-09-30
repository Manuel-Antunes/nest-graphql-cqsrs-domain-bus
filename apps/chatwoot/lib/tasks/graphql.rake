require "graphql/rake_task"
GraphQL::RakeTask.new(schema_name: "ChatwootSchema")

# $ rake graphql:schema:dump
# Schema IDL dumped to ./schema.graphql
# Schema JSON dumped to ./schema.json

namespace :graphql do
  namespace :federation do
    # Dump the Apollo Federation SUBGRAPH SDL — the exact document the gateway
    # introspects via `_service { sdl }`.
    #
    # Unlike `graphql:schema:dump` (`ChatwootSchema.to_definition`), this
    # EXCLUDES the federation machinery (`_Service`, `_Entity`, `_Any`, the
    # `_entities`/`_service` query fields) that is illegal in a composable
    # subgraph SDL and breaks `composeServices`. The gateway's `graphql:generate`
    # composes this offline with the other subgraphs.
    desc "Dump the Apollo Federation subgraph SDL to schema.graphql"
    task dump: :environment do
      path = ENV.fetch("FEDERATION_SDL_PATH", Rails.root.join("schema.graphql").to_s)
      File.write(path, ChatwootSchema.federation_sdl)
      puts "Federation subgraph SDL dumped to #{path}"
    end
  end
end
