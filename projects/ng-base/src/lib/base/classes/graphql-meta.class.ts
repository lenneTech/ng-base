import { GraphQLSchema } from 'graphql';
import { Maybe } from 'graphql/jsutils/Maybe';
import { GraphQLNamedType } from 'graphql/type/definition';
import { GraphQLRequestType } from '../enums/graphql-request-type.enum';
import { Helper } from './helper.class';
import { GraphQLType } from './graphql-type.class';
import { IGraphQLTypeCollection } from '../interfaces/graphql-type-collection.interface';

/**
 * GraphQL meta
 */
export class GraphQLMeta {
  // Frozen caches
  protected args: Record<string, any> = {};
  protected fields: Record<string, any> = {};

  /**
   * Integrate schema
   */
  constructor(protected schema: GraphQLSchema) {
    if (!schema) {
      throw Error('Missing schema');
    }
  }

  /**
   * Get arguments of GraphQL function
   */
  getArgs(
    functionName: string,
    options: { cache?: boolean; freeze?: boolean; type?: GraphQLRequestType } = {}
  ): IGraphQLTypeCollection {
    const {cache, freeze, type} = {
      cache: true,
      freeze: true,
      type: undefined,
      ...options,
    };

    // Get cache
    if (cache && freeze) {
      const args = this.args[functionName + type];
      if (args) {
        return args;
      }
    }

    const func = this.getFunction(functionName, {type});
    const result = {};
    if (func?.args) {
      func.args.forEach((item) => {
        result[item.name] = this.getDeepType(item.type);
      });
    }

    // Set cache
    if (freeze) {
      this.args[functionName + type] = Helper.deepFreeze(result);
    }

    return result;
  }

  /**
   * Get fields of GraphQL function
   */
  getFields(
    functionName: string,
    options: { cache?: boolean; freeze?: boolean; type?: GraphQLRequestType } = {}
  ): IGraphQLTypeCollection {
    const {cache, freeze, type} = {
      cache: true,
      freeze: true,
      type: undefined,
      ...options,
    };

    // Get cache
    if (cache && freeze) {
      const args = this.fields[functionName + type];
      if (args) {
        return args;
      }
    }

    const func = this.getFunction(functionName, options);
    const result: IGraphQLTypeCollection = this.getDeepType(func.type) as IGraphQLTypeCollection;

    // Set cache
    if (freeze) {
      this.fields[functionName + type] = Helper.deepFreeze(result);
    }

    return result;
  }

  /**
   * Get GraphQL function
   */
  protected getFunction(name: string, options: { type?: GraphQLRequestType } = {}): Record<string, any> {
    // Set config
    const config = {
      ...options,
    };

    // Init possible functions
    let functions = {};

    // If function type is set
    if (config.type) {
      const graphQLType = config.type.charAt(0).toUpperCase() + config.type.slice(1);
      const type = this.schema.getType(graphQLType);
      if (type) {
        functions = (type as any).getFields();
      }
    }

    // If function type is not set
    else {
      ['Subscription', 'Mutation', 'Query'].forEach((item) => {
        const type: any = this.schema.getType(item);
        if (type) {
          functions = {
            ...functions,
            ...(type.getFields() || {}),
          };
        }
      });
    }

    // Get function via name
    return functions[name];
  }

  /**
   * Get type
   */
  protected getType(name: string): Maybe<GraphQLNamedType> {
    return this.schema.getType(name);
  }

  /**
   * Get deep type data
   */
  protected getDeepType(type: any, prepared: WeakMap<any, any> = new WeakMap()): IGraphQLTypeCollection | GraphQLType {
    // Check type
    if (!type) {
      return type;
    }

    // Infinite regress protection
    const preparedObject = {};

    // Check prepared
    if (typeof type === 'object') {
      const preparedType = prepared.get(type);
      if (preparedType) {
        return preparedType;
      }

      // Set prepared
      prepared.set(type, preparedObject);
    }

    // Search deeper
    if (type.ofType) {
      const ofTypeResult = this.getDeepType(type.ofType, prepared);
      Object.assign(preparedObject, ofTypeResult);
      return ofTypeResult;
    }

    // Process fields
    if (type._fields) {
      const result = {};
      for (const [key, value] of Object.entries(type._fields)) {
        result[key] = this.getDeepType(value, prepared);
      }
      Object.assign(preparedObject, result);
      return result;
    }

    // Get type name
    if (type.type) {
      const typeResult = this.getDeepType(type.type, prepared);
      Object.assign(preparedObject, typeResult);
      return typeResult;
    }

    // Initialize GraphQLType
    const graphqlType = GraphQLType.map({
      type: type.name,
    });

    // Set enum values
    if (!!type._values) {
      graphqlType.isEnum = true;
      for (const [key, value] of Object.entries(type._nameLookup)) {
        if (!(value as any).isDeprecated) {
          graphqlType.validEnums.push(key);
        }
      }
    }

    // Finish
    prepared.set(type, graphqlType);
    return graphqlType;
  }
}
