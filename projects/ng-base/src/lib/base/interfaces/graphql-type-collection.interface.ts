import { GraphQLType } from '../classes/graphql-type.class';

/**
 * Interface of GraphQL type collection
 */
export interface IGraphQLTypeCollection {
  [key: string]: IGraphQLTypeCollection | GraphQLType;
}
