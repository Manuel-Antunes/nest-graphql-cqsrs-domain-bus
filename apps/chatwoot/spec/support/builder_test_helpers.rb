# frozen_string_literal: true

module Resolvers
  class TestBuilderOne
    def self.call(relation, _args, _ctx)
      relation.where(name: 'test_one')
    end
  end

  class TestBuilderTwo
    def self.call(relation, _args, _ctx)
      relation.where(email: 'test_two@example.com')
    end
  end
end
