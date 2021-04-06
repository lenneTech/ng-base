import { IGraphQLOptions } from './graphql-options.interface';

/**
 * GraphQL extra options for errors and loading indicator
 */
export interface IGraphQLPlusOptions extends IGraphQLOptions {
  ignoreErrors?: boolean;
  excludedErrors?: string | string[];
  loading?: boolean;
}
