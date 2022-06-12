import { Standard } from './standard.class';

/**
 * GraphQL type
 */
export class GraphQLType extends Standard {
  type = '';
  isRequired = false;
  isItemRequired = false;
  isList = false;
  isEnum = false;
  validEnums: string[] = [];
}
