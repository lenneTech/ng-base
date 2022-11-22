import { Apollo } from 'apollo-angular';
import { Inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { GraphQLService } from './graphql.service';
import { GraphQLMetaService } from './graphql-meta.service';
import { IGraphQLPlusOptions } from '../interfaces/graphql-plus-options.interfacen';
import { LoaderService } from './loader.service';
import { GraphQLRequestType } from '../enums/graphql-request-type.enum';
import { BASE_MODULE_CONFIG, BaseModuleConfig } from '../interfaces/base-module-config.interface';

/**
 * GraphQL plus service, for extra error handling and loading indication
 */
@Injectable({
  providedIn: 'root',
})
export class GraphQLPlusService extends GraphQLService {
  /**
   * Include services
   */
  constructor(
    protected apollo: Apollo,
    protected graphqlMetaService: GraphQLMetaService,
    protected loaderService: LoaderService,
    @Inject(BASE_MODULE_CONFIG) protected moduleConfig: BaseModuleConfig
  ) {
    super(apollo, graphqlMetaService, moduleConfig);
  }

  public graphQl(graphql: string, options: IGraphQLPlusOptions = {}): Observable<any> {
    this.handleLoader('start', options);

    return new Observable((subscriber) => {
      super.graphQl(graphql, options).subscribe(
        (response) => {
          if (response && response.errors) {
            this.handleError(response.errors, options.excludedErrors);
            subscriber.error(response);
            this.handleLoader('stop', options);
            subscriber.complete();
          }

          subscriber.next(response);
          this.handleLoader('stop', options);
          if (options.type !== GraphQLRequestType.SUBSCRIPTION) {
            subscriber.complete();
          }
        },
        (error) => {
          if (!options.ignoreErrors) {
            this.handleError(error, options.excludedErrors);
          }
          subscriber.error(error);
          this.handleLoader('stop', options);
          subscriber.complete();
        }
      );
    });
  }

  handleLoader(state: 'start' | 'stop', options: IGraphQLPlusOptions): void {
    if (options.loading) {
      if (state === 'start') {
        this.loaderService.start();
      } else if (state === 'stop') {
        this.loaderService.stop();
      }
    }
  }

  handleError(error: Error, excludedErrors: any = null): void {
    if (excludedErrors) {
      if (Array.isArray(excludedErrors)) {
        excludedErrors.forEach((excludedError) => {
          if (error.message.includes(excludedError.toLowerCase())) {
            return;
          }
        });
      } else if (error.message.toLowerCase().includes(excludedErrors?.toLowerCase())) {
        return;
      }
    }

    this.displayError(error);
  }

  displayError(error: any): void {
    console.error(error);
  }
}
