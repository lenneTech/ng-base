import { Standard } from './standard.class';

/**
 * GraphQL type
 */
export class GraphQLType extends Standard {
  type = '';
  isEnum = false;
  validEnums: string[] = [];
}
