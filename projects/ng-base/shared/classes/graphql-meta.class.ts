import {
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLNamedType,
  GraphQLNonNull,
  GraphQLScalarType,
  GraphQLSchema,
} from 'graphql';
import { GraphQLRequestType } from '../enums/graphql-request-type.enum';
import { Helper } from './helper.class';
import { GraphQLType } from './graphql-type.class';
import { GraphqlCrudType } from '../interfaces/graphql-crud-type.interface';

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
   * Get an object with GraphQLRequestType (operation type) as keys and method (fields) names as value
   */
  getMethodNames(): Record<string, string[]> {
    return {
      query: Object.keys(this.schema.getQueryType()?.getFields() || {}),
      mutation: Object.keys(this.schema.getMutationType()?.getFields() || {}),
      subscription: Object.keys(this.schema.getSubscriptionType()?.getFields() || {}),
    };
  }

  /**
   * Get GraphQLRequestTypes (operation types) via method (field) name
   */
  getRequestTypesViaMethod(methodName: string): string[] {
    const result = [];
    const methodNames = this.getMethodNames();
    for (const [key, value] of Object.entries(methodNames)) {
      if (value.includes(methodName)) {
        result.push(key);
      }
    }
    return result;
  }

  /**
   * We're going to get the query and mutation types from the schema, then we're going to loop through the fields of each
   * type and check if the field name starts with `find`, `create`, `update`, or `delete`. If it does, we're going to add
   * the model name to the `possibleTypes` array
   *
   * @returns An array of objects with the name of the model, and the CRUD operations that are available for that model.
   */
  getTypes(logging = false): GraphqlCrudType[] {
    const possibleTypes: GraphqlCrudType[] = [] as any;
    const mutationType = this.schema.getMutationType();
    const queryType = this.schema.getQueryType();

    if (logging) {
      console.log('GraphQLMeta::getTypes->queryTypeFields', queryType.getFields());
    }

    for (const [key, value] of Object.entries(queryType.getFields())) {
      if (key.startsWith('find')) {
        possibleTypes.push({
          name: key.split('find').pop().slice(0, -1),
          create: false,
          update: false,
          delete: false,
          duplicate: false,
        });
      }
    }

    if (logging) {
      console.log('GraphQLMeta::getTypes->mutationTypeFields', mutationType.getFields());
      console.log('GraphQLMeta::getTypes->possibleTypes', possibleTypes);
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

      if (key.startsWith('duplicate')) {
        const model = key.split('duplicate').pop();
        if (possibleTypes.find((e) => e.name === model)) {
          possibleTypes.find((item) => item.name === model).duplicate = true;
        }
      }
    }

    if (logging) {
      console.log('GraphQLMeta::getTypes->possibleTypes', possibleTypes);
      console.log(
        'GraphQLMeta::getTypes->filteredPossibleTypes',
        possibleTypes.filter((e) => e.create || e.update)
      );
    }

    return possibleTypes.filter((e) => e.create || e.update);
  }

  /**
   * Get arguments of GraphQL function
   */
  getArgs(
    functionName: string,
    options: { cache?: boolean; freeze?: boolean; type?: GraphQLRequestType } = {}
  ): GraphQLType {
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
    const result = new GraphQLType();
    if (func?.args) {
      func.args.forEach((item) => {
        result.fields[item.name] = this.getDeepType(item.type);
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
  ): GraphQLType {
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
    const result = this.getDeepType(func.type);

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
   * Get (deep) type name
   */
  protected getTypeName(type: any) {
    if (
      type instanceof GraphQLInputObjectType ||
      type instanceof GraphQLScalarType ||
      type instanceof GraphQLEnumType
    ) {
      return type.name;
    } else if (type.type) {
      return this.getTypeName(type.type);
    } else if (type.ofType) {
      return this.getTypeName(type.ofType);
    } else {
      return type.name;
    }
  }

  /**
   * Get deep type data
   */
  protected getDeepType(type: any, prepared: Record<string, any> = {}, setMetaData = false): GraphQLType {
    // Check type
    if (!type) {
      return type;
    }

    // Infinite regress protection
    const typeName = this.getTypeName(type);
    const graphQLType = GraphQLType.map({
      type: this.getTypeName(type),
    });

    // Check prepared
    if (typeof type === 'object') {
      const preparedType = prepared[typeName];

      // Work with cached type
      if (preparedType) {
        // Create a new object to protect own isXXX information
        const clone = Object.assign({}, preparedType);

        // But use fields as reference to get future changes via prepared caching
        clone.fields = preparedType.fields;

        // Disable meta flags for sub objects
        if (
          type?.type instanceof GraphQLInputObjectType ||
          (type?.type instanceof GraphQLNonNull && type?.type?.ofType instanceof GraphQLInputObjectType && setMetaData)
        ) {
          setMetaData = false;
        }

        // Check for meta flags
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

      // Set prepared cache for GraphQL types
      // (type names start with uppercase letters as opposed to property names that start with lowercase letters)
      if (type.name && type.name[0].toUpperCase() === type.name[0] && !prepared[type.name]) {
        prepared[type.name] = graphQLType;
      }
    }

    // Search deeper
    if (type.ofType) {
      const ofTypeResult = this.getDeepType(type.ofType, prepared, setMetaData);
      Object.assign(graphQLType, ofTypeResult);
      return graphQLType;
    }

    // Process fields
    if (type._fields) {
      const fields = {};
      for (const [key, value] of Object.entries(type._fields)) {
        fields[key] = this.getDeepType(value, prepared, true);
      }

      // Assign and not replace to preserve updates in the cache
      Object.assign(graphQLType.fields, fields);
      return graphQLType;
    }

    // Process type
    if (type.type) {
      const typeResult = this.getDeepType(type.type, prepared, setMetaData);

      // Disable meta flags for sub objects
      if (
        type?.type instanceof GraphQLInputObjectType ||
        (type?.type instanceof GraphQLNonNull && type?.type?.ofType instanceof GraphQLInputObjectType && setMetaData)
      ) {
        setMetaData = false;
      }

      // Check for meta flags
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

      Object.assign(graphQLType, typeResult);
      return graphQLType;
    }

    // Set enum values
    if (!!type._values) {
      graphQLType.isEnum = true;
      for (const [key, value] of Object.entries(type._nameLookup)) {
        if (!(value as any).isDeprecated) {
          graphQLType.validEnums.push(key);
        }
      }
    }

    // Finish
    return graphQLType;
  }
}
