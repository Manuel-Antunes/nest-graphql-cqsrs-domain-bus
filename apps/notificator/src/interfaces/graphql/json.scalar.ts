import { GraphQLScalarType, valueFromASTUntyped } from 'graphql';

export const GraphQLJSON = new GraphQLScalarType({
  name: 'JSON',
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: (ast, variables) => valueFromASTUntyped(ast, variables),
});
