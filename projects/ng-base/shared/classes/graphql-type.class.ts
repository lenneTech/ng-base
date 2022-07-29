import { Standard } from './standard.class';

/**
 * GraphQL type
 */
export class GraphQLType extends Standard {
  type = '';
  fields: Record<string, GraphQLType> = {};
  isRequired = false;
  isItemRequired = false;
  isList = false;
  isEnum = false;
  validEnums: string[] = [];
}
