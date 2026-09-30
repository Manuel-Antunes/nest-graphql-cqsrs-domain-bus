# When working with experimental extensions, which doesn't have support on all providers
# This monkey patch will help us to ignore the extensions when dumping the schema
# Additionally we will also ignore the tables associated with those features and exentions

# Once the feature stabilizes, we can remove the tables/extension from the ignore list
# Ensure you write appropriate migrations when you do that.

module ActiveRecord
  module ConnectionAdapters
    module PostgreSQL
      class SchemaDumper < ConnectionAdapters::SchemaDumper
        cattr_accessor :ignore_extentions, default: []

        private

        def extensions(stream)
          extensions = @connection.extensions
          return unless extensions.any?

          stream.puts '  # These extensions should be enabled to support this database'
          extensions.sort.each do |extension|
            stream.puts "  enable_extension #{extension.inspect}" unless ignore_extentions.include?(extension)
          end
          stream.puts
        end

        def schemas(stream)
          schema_names = @connection.schema_search_path.split(',').map { |name| name.strip.delete('"') } - ['public', '$user']
          return if schema_names.empty?

          schema_names.sort.each do |name|
            stream.puts "  create_schema #{name.inspect}, if_not_exists: true"
          end
          stream.puts
        end
      end
    end
  end
end
