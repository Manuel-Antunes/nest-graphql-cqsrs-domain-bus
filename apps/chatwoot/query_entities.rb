require 'json'
query = %Q{
  query {
    _entities(representations: [{__typename: "JudgmentCreditor", id: "clhfd4o4m000008mi029l7k3w" }]) {
      ... on JudgmentCreditor {
        contacts {
          nodes {
            id
          }
        }
      }
    }
  }
}
puts JSON.pretty_generate(ChatwootSchema.execute(query))
