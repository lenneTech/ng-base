/**
 * GraphQL fields object
 */
export interface GraphQLFieldsObject {
  [key: string]: boolean | (string | GraphQLFieldsObject)[] | GraphQLFieldsObject;
}
