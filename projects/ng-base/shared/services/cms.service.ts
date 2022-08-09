import { Injectable } from '@angular/core';
import { GraphQLRequestType } from '../enums/graphql-request-type.enum';
import { GraphQLService } from './graphql.service';

@Injectable({
  providedIn: 'root',
})
export class CmsService {
  constructor(private graphQLService: GraphQLService) {}
  /**
   * It calls the graphQLService to delete the object with the id of the object that is currently being edited
   */
  deleteObject(id: string, modelName: string) {
    return new Promise((resolve, reject) => {
      if (confirm('Möchtest du das Objekt wirklich löschen?')) {
        this.graphQLService
          .graphQl('delete' + this.capitalizeFirstLetter(modelName), {
            arguments: { id },
            fields: ['id'],
            type: GraphQLRequestType.MUTATION,
          })
          .subscribe({
            next: (value) => {
              resolve(value);
            },
            error: (err) => {
              reject(err);
              console.error('Error on delete object', err);
            },
          });
      }
    });
  }

  /**
   * It sends a GraphQL mutation to the server to duplicate the object
   */
  async duplicateObject(id: string, modelName: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (confirm('Möchtest du das Objekt wirklich duplizieren?')) {
        this.graphQLService
          .graphQl('duplicate' + this.capitalizeFirstLetter(modelName), {
            arguments: { id },
            fields: ['id'],
            type: GraphQLRequestType.MUTATION,
          })
          .subscribe({
            next: (value) => {
              resolve(value);
            },
            error: (err) => {
              reject(err);
              console.error('Error on duplicate object', err);
            },
          });
      }
    });
  }

  /**
   * It takes a string, capitalizes the first letter, and returns the modified string
   *
   * @param value - The string to capitalize.
   * @returns The first letter of the string is being capitalized and the rest of the string is being returned.
   */
  capitalizeFirstLetter(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  /**
   * Transform first letter to lowercase
   */
  lowerCaseFirstLetter(value: string) {
    return value.charAt(0).toLowerCase() + value.slice(1);
  }
}
