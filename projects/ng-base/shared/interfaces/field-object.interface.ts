/**
 * GraphQL field object
 */
export interface IFieldObject {
  [key: string]: string | string[] | IFieldObject;
}
