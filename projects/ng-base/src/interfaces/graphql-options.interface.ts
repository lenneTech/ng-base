import { GraphQLRequestType } from '../enums/graphql-request-type.enum';

/**
 * Options for graphql requests
 */
export interface IGraphQLOptions {
  arguments?: any;
  fields?: any;
  log?: boolean;
  model?: any;
  type?: GraphQLRequestType;
}
