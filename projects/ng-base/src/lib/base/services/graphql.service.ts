import { Apollo, gql } from 'apollo-angular';
import { Injectable } from '@angular/core';
import { IGraphQLOptions } from '../interfaces/graphql-options.interface';
import { GraphQLRequestType } from '../enums/graphql-request-type.enum';
import { Observable, throwError } from 'rxjs';
import { GraphQLMetaService } from './graphql-meta.service';
import { GraphQLEnum } from '../classes/graphql-enum.class';
import { GraphQLType } from '../classes/graphql-type.class';

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
  public graphQl(graphql: string, options: IGraphQLOptions = {}): Observable<any> {
    // Check arguments
    if (!graphql) {
      throwError('Missing graphql argument');
    }

    // Get config
    const config = {
      arguments: null,
      fields: null,
      log: false,
      model: null,
      type: GraphQLRequestType.QUERY,
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
        // Prepare fields
        let fields;
        let allowedFields;

        if (config.fields) {
          allowedFields = meta.getFields(graphql, { type: config.type });

          fields = this.prepareFields(config.fields, {
            allowed: allowedFields,
          });
        }

        // Log
        if (config.log) {
          console.log({ fields });
        }

        if (fields && !fields.startsWith('{')) {
          fields = '{' + fields + '\n}';
        }

        // Get allowed args
        const allowedArgs = meta.getArgs(graphql, { type: config.type });
        const args =
          this.prepareArguments(config.arguments, {
            allowed: allowedArgs,
          }) || '';

        // Log
        if (config.log) {
          console.log({ graphQL: graphql, args, fields, type: config.type });
        }

        // Prepare request
        const documentNode = fields
          ? gql(config.type + '{\n' + graphql + args + fields + '\n}')
          : gql(config.type + '{\n' + graphql + args + '\n}');

        const request: any = {};
        request[config.type] = documentNode;

        // Log
        if (config.log) {
          console.log({ request });
        }

        const func = config.type === GraphQLRequestType.MUTATION ? 'mutate' : config.type;
        (this.apollo as any)[func](request).subscribe(
          (result: any) => {
            const data = result?.data?.[graphql] !== undefined ? result.data[graphql] : result;

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

            // Done
            subscriber.complete();
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
   * Prepare arguments for GraphQL request
   */
  protected prepareArguments(args: any, options: { level?: number; allowed?: any } = {}): string {
    // Config
    const { level, allowed } = {
      level: 1,
      allowed: null,
      ...options,
    };

    // Check args
    if (!args) {
      return '';
    }

    // Process args
    const result = [];

    // Process array
    if (Array.isArray(args)) {
      const allowedKeys = allowed ? Object.keys(allowed) : null;
      for (const item of args) {
        let key = null;
        if (allowed) {
          if (allowed.length < 1) {
            break;
          }
          key = allowedKeys?.shift();
        }

        result.push(this.prepareArguments(item, { level: level + 1, allowed: key ? allowed[key] : null }));
      }
      if (result.length) {
        if (level === 1) {
          return '(' + result.join(', ') + ')';
        } else {
          return '[' + result.join(', ') + ']';
        }
      }
    }

    // Process object
    else if (typeof args === 'object') {
      for (const [key, value] of Object.entries(args)) {
        if (value instanceof GraphQLEnum) {
          result.push(key + ':' + value.value);
          continue;
        }

        if (allowed && !allowed[key]) {
          continue;
        }

        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            result.push(
              key +
                ': [' +
                value.map((item) => this.prepareArguments(item, { level: level + 1, allowed: allowed[key] })) +
                ']'
            );
            continue;
          }

          result.push(
            key +
              ': ' +
              (typeof value === 'string' ||
              typeof value === 'boolean' ||
              Object.prototype.toString.call(value) === '[object Date]'
                ? allowed[key].isEnum
                  ? value
                  : typeof value === 'string'
                  ? `"""${value.replace(/"/g, '\\"')}"""`
                  : Object.prototype.toString.call(value) === '[object Date]'
                  ? `"""${(value as Date).toString()}"""`
                  : value
                : this.prepareArguments(value, {
                    level: level + 1,
                    allowed: allowed[key],
                  }))
          );
        }
      }
      if (result.length) {
        if (level === 1) {
          return '(' + result.join(', ') + ')';
        } else {
          return '{' + result.join(', ') + '}';
        }
      }
    }

    // Others
    else {
      return JSON.stringify(args);
    }
  }

  /**
   * Prepare fields for GraphQL request
   */
  protected prepareFields(fields: any, options: { tab?: number; spaces?: number; allowed?: any } = {}): string {
    // Config
    const { tab, spaces, allowed } = {
      tab: 1,
      spaces: 2,
      allowed: null,
      ...options,
    };

    // Check fields
    if (!fields) {
      return '';
    }

    // Init result
    let result = '';

    // Process string
    if (typeof fields === 'string') {
      if (
        allowed &&
        ((typeof allowed === 'string' && allowed !== fields) || (typeof allowed === 'object' && !allowed[fields]))
      ) {
        return '';
      }
      return '\n' + ' '.repeat(spaces).repeat(tab) + fields;
    }

    // Process array
    else if (Array.isArray(fields)) {
      for (const item of fields) {
        if (typeof item === 'object') {
          result = result + this.prepareFields(item, { tab: tab + 1, allowed });
          continue;
        }
        if (allowed && !allowed?.[item]) {
          continue;
        }
        result =
          result +
          this.prepareFields(item, {
            tab: tab + 1,
            allowed:
              typeof allowed?.[item] === 'object' && !(allowed?.[item] instanceof GraphQLType) ? allowed?.[item] : item,
          });
      }
    }

    // Process object
    else if (typeof fields === 'object') {
      for (const [key, val] of Object.entries(fields)) {
        if (allowed && !allowed[key]) {
          continue;
        }
        if (typeof val !== 'object' || !Object.keys(val).length) {
          result = result + '\n' + ' '.repeat(spaces).repeat(tab) + key;
        } else {
          result =
            result +
            '\n' +
            ' '.repeat(spaces).repeat(tab) +
            key +
            ' ' +
            '{' +
            this.prepareFields(val, {
              tab: tab + 1,
              allowed:
                typeof allowed?.[key] === 'object' && !(allowed?.[key] instanceof GraphQLType) ? allowed?.[key] : key,
            }) +
            '\n' +
            ' '.repeat(spaces).repeat(tab) +
            '}';
        }
      }
    }

    // Return result
    return result;
  }
}
