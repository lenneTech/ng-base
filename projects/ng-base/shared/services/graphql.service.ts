import { Apollo, gql } from 'apollo-angular';
import { Injectable } from '@angular/core';
import { IGraphQLOptions } from '../interfaces/graphql-options.interface';
import { GraphQLRequestType } from '../enums/graphql-request-type.enum';
import { Observable, throwError } from 'rxjs';
import { GraphQLMetaService } from './graphql-meta.service';
import { GraphQLEnum } from '../classes/graphql-enum.class';
import { GraphQLType } from '../classes/graphql-type.class';
import { sha256 } from 'js-sha256';
import { Helper } from '../classes/helper.class';

/**
 * GraphQL service
 */
@Injectable({
  providedIn: 'root',
})
export class GraphQLService {
  /**
   * Include services
   */
  constructor(protected apollo: Apollo, protected graphQLMetaService: GraphQLMetaService) {}

  /**
   * GraphQL request
   */
  public graphQl(graphqlMethodName: string, options: IGraphQLOptions = {}): Observable<any> {
    // Check parameters
    if (!graphqlMethodName) {
      throwError(() => new Error('Missing graphql method name'));
    }

    // Get config
    const config = {
      arguments: null,
      fields: null,
      log: false,
      model: null,
      ...options,
    };

    // Convert class to Object for arguments
    if (typeof config.arguments === 'function') {
      config.arguments = new config.arguments();
    }

    // Convert class to Object for fields
    if (typeof config.fields === 'function') {
      config.fields = new config.fields();
    }

    // Log
    if (config.log) {
      console.log({ config });
    }

    // Send request
    return new Observable((subscriber) => {
      // Get meta
      this.graphQLMetaService.getMeta({ log: config.log }).subscribe((meta) => {
        // Set GraphQLRequestType automatically
        if (!config.type) {
          const types = meta.getRequestTypesViaMethod(graphqlMethodName);
          if (!types?.length) {
            throwError(() => new Error('No GraphQLRequestType detected'));
          }
          config.type = types[0] as GraphQLRequestType;
          if (config.type) {
            throwError(() => new Error('No GraphQLRequestType detected'));
          }
          if (types.length > 1) {
            // eslint-disable-next-line no-console
            console.debug('GraphQLRequestType ' + config.type + ' used for ' + graphqlMethodName, types);
          }
        }

        // Prepare fields
        let fields;
        let allowedFields;

        // Log meta
        if (config.log) {
          console.log({ meta });
        }

        if (config.fields) {
          allowedFields = meta.getFields(graphqlMethodName, { type: config.type });

          // Log meta
          if (config.log) {
            console.log({ allowedFields });
          }

          const fieldsData = this.prepareFields(config.fields, {
            allowed: allowedFields,
          });

          fields = fieldsData.fieldsString;
        }

        if (fields && !fields.startsWith('{')) {
          fields = '{' + fields + '\n}';
        }

        // Log fields
        if (config.log) {
          console.log({ fields });
        }

        // Get allowed args
        const allowedArgs = meta.getArgs(graphqlMethodName, { type: config.type });

        // Log allowed args
        if (config.log) {
          console.log({ allowedArgs });
        }

        const argsData = this.prepareArguments(config.arguments, {
          allowed: allowedArgs,
        });

        // Log args data
        if (config.log) {
          argsData.usedArgs.sort();
          argsData.schemaArgs.sort();
          const filtered = argsData.schemaArgs.filter((field) => !argsData.usedArgs.includes(field));
          const unused = this.graphQLTypeToStringArray(allowedArgs)
            .sort()
            .filter((field) => !argsData.usedArgs.includes(field));
          console.log({ argsData, filtered, unused });
        }

        let args = argsData?.argsString || '';
        if (args === '{}') {
          args = '';
        }

        // Log
        if (config.log) {
          console.log({ graphQL: graphqlMethodName, args, fields, type: config.type });
        }

        // Prepare request
        const request: any = {};

        // Prepare GraphQL
        const gQlFuncBody = fields
          ? ' {\n' + graphqlMethodName + args + fields + '\n}'
          : ' {\n' + graphqlMethodName + args + '\n}';
        let gQlBody = config.type + gQlFuncBody;

        // Handling for variables (e.g. for file uploads)
        if (Object.keys(argsData.variables).length) {
          // Preparations
          request.variables = {};
          let multipart = false;

          // Add surrounding
          gQlBody = config.type + ' Request(';
          for (const [key, item] of Object.entries(argsData.variables)) {
            gQlBody += '\n$' + key + ':' + item.type + ',';
            request.variables[key] = item.value;
            if (item.type.startsWith('Upload')) {
              multipart = true;
            }
          }
          gQlBody = gQlBody.slice(0, -1) + '\n)' + gQlFuncBody;

          // Set Multipart
          if (multipart) {
            request.context = {
              useMultipart: true,
            };
          }
        }
        const documentNode = gql(gQlBody);

        // Log
        if (config.log) {
          console.log({ documentNode });
        }

        // Set document node
        request[config.type] = documentNode;

        // Log
        if (config.log) {
          console.log({ request });
        }

        let func;
        if (config.type === GraphQLRequestType.MUTATION) {
          func = 'mutate';
          request[config.type] = documentNode;
        } else if (config.type === GraphQLRequestType.SUBSCRIPTION) {
          func = 'subscribe';
          request.query = documentNode;
        } else {
          func = config.type;
          request[config.type] = documentNode;
        }

        (this.apollo as any)[func](request).subscribe(
          (result: any) => {
            const data = result?.data?.[graphqlMethodName] !== undefined ? result.data[graphqlMethodName] : result;

            // Direct data
            if (!config.model) {
              subscriber.next(data);
            }

            // Map data as array
            else if (Array.isArray(data)) {
              subscriber.next(
                data.map((item) => {
                  return config.model.map(item);
                })
              );
            }

            // Map data
            else {
              subscriber.next(config.model.map(data));
            }

            if (config.type !== GraphQLRequestType.SUBSCRIPTION) {
              // Done
              subscriber.complete();
            }
          },
          (error: any) => {
            subscriber.error(error);
            subscriber.complete();
          }
        );
      });
    });
  }

  /**
   * Get fields / args from IGraphQLTypeCollection
   */
  protected graphQLTypeToStringArray(graphQLType: GraphQLType, current = '', result = [], cacheNode = []) {
    if (!graphQLType) {
      return result;
    }
    if (current?.includes('.')) {
      cacheNode.push(current.split('.')[1]);
    } else if (current) {
      cacheNode.push(current);
    }
    for (const key of Object.keys(graphQLType.fields)) {
      if (current === key || cacheNode.includes(key)) {
        continue;
      }
      this.graphQLTypeToStringArray(graphQLType.fields[key], current ? current + '.' + key : key, result, cacheNode);
    }
    return result;
  }

  /**
   * Prepare arguments for GraphQL request
   */
  protected prepareArguments(
    args: any,
    options: {
      allowed?: GraphQLType;
      level?: number;
      levelKey?: string;
      parent?: string;
      schemaArgs?: string[];
      usedArgs?: string[];
      variables?: { [key: string]: { type: string; value: any } };
    } = {}
  ): {
    argsString: string;
    schemaArgs: string[];
    usedArgs: string[];
    variables: { [key: string]: { type: string; value: any } };
  } {
    // Init config variables
    const { allowed, levelKey, level, parent, schemaArgs, usedArgs, variables } = {
      allowed: null,
      levelKey: '',
      level: 1,
      parent: '',
      schemaArgs: [],
      usedArgs: [],
      variables: {},
      ...options,
    };

    // Check args
    if (args === undefined || args === null) {
      return { argsString: '', schemaArgs, usedArgs, variables };
    }

    // Init args
    const result = [];

    // Process array
    if (Array.isArray(args)) {
      const allowedKeys = allowed ? Object.keys(allowed.fields) : null;
      for (const item of args) {
        let key = null;
        if (allowed) {
          if (!allowedKeys || allowedKeys.length < 1) {
            break;
          }
          key = allowedKeys.shift();
        }

        // Process value
        result.push(
          this.prepareArguments(item, {
            allowed: key ? allowed.fields[key] : null,
            levelKey: key,
            level: level + 1,
            parent: parent + key + '.',
            schemaArgs,
            usedArgs,
            variables,
          }).argsString
        );
      }

      // Encapsulation of the array result
      if (result.length) {
        // Complete result, encapsulated via round brackets
        if (level === 1) {
          return { argsString: '(' + result.join(', ') + ')', schemaArgs, usedArgs, variables };
        }

        // Deeper result part, encapsulated via square brackets
        else {
          return { argsString: '[' + result.join(', ') + ']', schemaArgs, usedArgs, variables };
        }
      }
    }

    // Process object
    else if (typeof args === 'object') {
      // Check for Upload type for variable handling
      if (allowed?.type === 'Upload') {
        const name = levelKey + '_' + Helper.getUID(6);
        variables[name] = { type: allowed.type + (allowed.isRequired ? '!' : ''), value: args };
        return { argsString: '$' + name, schemaArgs, usedArgs, variables };
      }

      // Check object is empty
      if (args && Object.keys(args).length === 0 && Object.getPrototypeOf(args) === Object.prototype) {
        return { argsString: '{}', schemaArgs, usedArgs, variables };
      }

      // Process all object entries
      for (const [key, value] of Object.entries(args)) {
        // Init data for current entry
        const currentKey = parent + key;
        schemaArgs.push(currentKey);

        // If the allowed key handling is enabled and the current key is not included in the list of allowed keys,
        // the current key will be skipped
        if (allowed && !allowed.fields[key]) {
          continue;
        }

        // Skip value if not exists
        if (value === undefined) {
          continue;
        }

        // Set null e.g. for resetting
        if (value === null) {
          result.push(key + ':' + null);
          continue;
        }

        // Add current key to metadata
        usedArgs.push(currentKey);

        // Process GraphQLEnum
        if (value instanceof GraphQLEnum) {
          result.push(key + ':' + value.value);
          continue;
        }

        if (key === 'password') {
          result.push(key + ':' + `"${sha256(value as string)}"`);
          continue;
        }

        // Process array
        else if (Array.isArray(value)) {
          result.push(
            key +
              ': [' +
              value.map(
                (item) =>
                  this.prepareArguments(item, {
                    allowed: allowed.fields[key],
                    levelKey: key,
                    level: level + 1,
                    parent: currentKey + '.',
                    schemaArgs,
                    usedArgs,
                    variables,
                  }).argsString
              ) +
              ']'
          );
          continue;
        }

        // Prepare additional result string
        let additionalResult = key + ': ';

        // Value is a date object
        if (typeof value === 'object' && Object.prototype.toString.call(value) === '[object Date]') {
          additionalResult += `"""${(value as Date).toString()}"""`;
        }

        // Value is a string
        else if (typeof value === 'string') {
          // Enum (doesn't need quotation marks)
          if (allowed.fields[key].isEnum) {
            additionalResult += value;
          }

          // String
          else {
            additionalResult += `"${value.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
          }
        }

        // Value is a simple boolean or a number
        else if (typeof value === 'boolean' || typeof value === 'number') {
          additionalResult += value;
        }

        // Others
        else {
          const prepareOptions = {
            allowed: allowed.fields[key],
            levelKey: key,
            level: level + 1,
            parent: currentKey + '.',
            schemaArgs,
            usedArgs,
            variables,
          };
          try {
            additionalResult += this.prepareArguments(value, prepareOptions).argsString;
          } catch (e) {
            console.error('Error during preparing arguments', value, prepareOptions);
            throw e;
          }
        }

        // Push deeper part into result array
        result.push(additionalResult);
      }

      // Encapsulation of the object result
      if (result.length) {
        // Complete result, encapsulated via round brackets
        if (level === 1) {
          return { argsString: '(' + result.join(', ') + ')', schemaArgs, usedArgs, variables };
        }

        // Deeper result part, encapsulated via curly brackets
        else {
          return { argsString: '{' + result.join(', ') + '}', schemaArgs, usedArgs, variables };
        }
      }
    }

    // Prepare and process other / unknown values as JSON
    else {
      return { argsString: JSON.stringify(args), schemaArgs, usedArgs, variables };
    }
  }

  /**
   * Prepare fields for GraphQL request
   */
  protected prepareFields(
    fields: any,
    options: {
      allowed?: GraphQLType;
      schemaFields?: string[];
      usedFields?: string[];
      parent?: string;
      spaces?: number;
      tab?: number;
    } = {}
  ): { schemaFields: string[]; fieldsString: string; usedFields: string[] } {
    // Config
    const { allowed, parent, schemaFields, spaces, tab, usedFields } = {
      allowed: null,
      parent: '',
      schemaFields: [],
      spaces: 2,
      tab: 1,
      usedFields: [],
      ...options,
    };

    // Init fields string
    let fieldsString = '';

    // Check fields
    if (!fields) {
      return { fieldsString, schemaFields, usedFields };
    }

    // Process string
    if (typeof fields === 'string') {
      if (allowed && !allowed.fields[fields]) {
        return { fieldsString, schemaFields, usedFields };
      }
      return { fieldsString: '\n' + ' '.repeat(spaces).repeat(tab) + fields, schemaFields, usedFields };
    }

    // Process array
    else if (Array.isArray(fields)) {
      for (const item of fields) {
        if (typeof item === 'object') {
          fieldsString =
            fieldsString +
            this.prepareFields(item, {
              allowed, // item is object or array
              parent,
              spaces,
              schemaFields,
              tab: tab + 1,
              usedFields,
            }).fieldsString;
          continue;
        }
        const currentPath = parent + item;
        schemaFields.push(currentPath);
        if (allowed && !allowed.fields[item]) {
          continue;
        }
        usedFields.push(currentPath);
        fieldsString =
          fieldsString +
          this.prepareFields(item, {
            allowed: null, // item is string
            parent: currentPath + '.',
            spaces,
            schemaFields,
            tab: tab + 1,
            usedFields,
          }).fieldsString;
      }
    }

    // Process object
    else if (typeof fields === 'object') {
      for (const [key, val] of Object.entries(fields)) {
        const currentPath = parent + key;
        schemaFields.push(currentPath);
        if (allowed && !allowed.fields[key]) {
          continue;
        }
        usedFields.push(currentPath);
        if (typeof val !== 'object' || !Object.keys(val).length) {
          fieldsString = fieldsString + '\n' + ' '.repeat(spaces).repeat(tab) + key;
        } else {
          fieldsString =
            fieldsString +
            '\n' +
            ' '.repeat(spaces).repeat(tab) +
            key +
            ' ' +
            '{' +
            this.prepareFields(val, {
              allowed: allowed.fields[key], // val is object or array
              parent: currentPath + '.',
              spaces,
              schemaFields,
              tab: tab + 1,
              usedFields,
            }).fieldsString +
            '\n' +
            ' '.repeat(spaces).repeat(tab) +
            '}';
        }
      }
    }

    // Return result
    return { fieldsString, schemaFields, usedFields };
  }
}
