import { GraphQLList, GraphQLNamedType, GraphQLNonNull, GraphQLSchema } from 'graphql';
import { GraphQLRequestType } from '../enums/graphql-request-type.enum';
import { Helper } from './helper.class';
import { GraphQLType } from './graphql-type.class';
import { IGraphQLTypeCollection } from '../interfaces/graphql-type-collection.interface';
import { GraphqlCrudType } from '../interfaces/graphql-crud-type.interface';
import { cloneDeep } from '@apollo/client/utilities';

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
   * We're going to get the query and mutation types from the schema, then we're going to loop through the fields of each
   * type and check if the field name starts with `find`, `create`, `update`, or `delete`. If it does, we're going to add
   * the model name to the `possibleTypes` array
   *
   * @returns An array of objects with the name of the model, and the CRUD operations that are available for that model.
   */
  getTypes(): GraphqlCrudType[] {
    const possibleTypes: GraphqlCrudType[] = [] as any;
    const mutationType = this.schema.getMutationType();
    const queryType = this.schema.getQueryType();

    for (const [key, value] of Object.entries(queryType.getFields())) {
      if (key.startsWith('find')) {
        possibleTypes.push({
          name: key.split('find').pop().slice(0, -1),
          create: false,
          update: false,
          delete: false,
        });
      }
    }

    for (const [key, value] of Object.entries(mutationType.getFields())) {
      if (key.startsWith('create')) {
        const model = key.split('create').pop();
        if (possibleTypes.find((e) => e.name === model)) {
          possibleTypes.find((item) => item.name === model).create = true;
        }
      }

      if (key.startsWith('update')) {
        const model = key.split('update').pop();
        if (possibleTypes.find((e) => e.name === model)) {
          possibleTypes.find((item) => item.name === model).update = true;
        }
      }

      if (key.startsWith('delete')) {
        const model = key.split('delete').pop();
        if (possibleTypes.find((e) => e.name === model)) {
          possibleTypes.find((item) => item.name === model).delete = true;
        }
      }
    }

    return possibleTypes;
  }

  /**
   * Get arguments of GraphQL function
   */
  getArgs(
    functionName: string,
    options: { cache?: boolean; freeze?: boolean; type?: GraphQLRequestType } = {}
  ): IGraphQLTypeCollection {
    const { cache, freeze, type } = {
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

    const func = this.getFunction(functionName, { type });
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
    const { cache, freeze, type } = {
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
  protected getType(name: string): GraphQLNamedType | null | undefined {
    return this.schema.getType(name);
  }

  /**
   * Get deep type data
   */
  protected getDeepType(
    type: any,
    prepared: WeakMap<any, any> = new WeakMap(),
    setMetaData = false
  ): IGraphQLTypeCollection | GraphQLType {
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
        const clone = cloneDeep(preparedType);

        if (type.type && setMetaData) {
          if (type.type instanceof GraphQLNonNull) {
            clone.isRequired = true;
            if (type.type.ofType instanceof GraphQLList) {
              clone.isList = true;
              clone.isItemRequired = type.type.ofType.ofType instanceof GraphQLNonNull;
            } else {
              clone.isList = false;
              clone.isItemRequired = false;
            }
          } else {
            clone.isRequired = false;

            // List first
            if (type.type instanceof GraphQLList) {
              clone.isList = true;
              clone.isItemRequired = type.ofType instanceof GraphQLNonNull;
            } else {
              clone.isList = false;
              clone.isItemRequired = false;
            }
          }
        }

        return clone;
      }

      // Set prepared
      prepared.set(type, preparedObject);
    }

    // Search deeper
    if (type.ofType) {
      const ofTypeResult = this.getDeepType(type.ofType, prepared, setMetaData);
      Object.assign(preparedObject, ofTypeResult);
      return ofTypeResult;
    }

    // Process fields
    if (type._fields) {
      const result = {};
      for (const [key, value] of Object.entries(type._fields)) {
        result[key] = this.getDeepType(value, prepared, true);
      }
      Object.assign(preparedObject, result);
      return result;
    }

    // Get type name
    if (type.type) {
      const typeResult = this.getDeepType(type.type, prepared, setMetaData);

      if (setMetaData) {
        if (type.type instanceof GraphQLNonNull) {
          typeResult.isRequired = true;
          if (type.type.ofType instanceof GraphQLList) {
            typeResult.isList = true;
            typeResult.isItemRequired = type.type.ofType.ofType instanceof GraphQLNonNull;
          } else {
            typeResult.isList = false;
            typeResult.isItemRequired = false;
          }
        } else {
          typeResult.isRequired = false;

          // List first
          if (type.type instanceof GraphQLList) {
            typeResult.isList = true;
            typeResult.isItemRequired = type.ofType instanceof GraphQLNonNull;
          } else {
            typeResult.isList = false;
            typeResult.isItemRequired = false;
          }
        }
      }

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
