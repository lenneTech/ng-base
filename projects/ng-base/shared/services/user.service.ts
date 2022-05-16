import { Injectable } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { map } from 'rxjs';
import { Auth } from '../classes/auth.class';
import { BasicUser } from '../classes/basic-user.class';
import { GraphQLRequestType } from '../enums/graphql-request-type.enum';
import { AuthService } from './auth.service';
import { GraphQLMetaService } from './graphql-meta.service';
import { GraphQLPlusService } from './graphql-plus.service';
import { LoaderService } from './loader.service';

@Injectable({
  providedIn: 'root',
})
export class UserService extends GraphQLPlusService {
  constructor(
    protected apollo: Apollo,
    protected graphqlMetaService: GraphQLMetaService,
    protected loaderService: LoaderService,
    protected authService: AuthService
  ) {
    super(apollo, graphqlMetaService, loaderService);
  }

  /**
   * Login
   *
   * @param input
   */
  login(input: { email: string; password: string }) {
    return this.graphQl('signIn', {
      arguments: { input },
      fields: ['token', { user: ['id', 'firstName', 'lastName', 'email', 'roles'] }],
      type: GraphQLRequestType.QUERY,
      loading: true,
    }).pipe(
      map((response: Auth) => {
        this.authService.token = response.token;
        this.authService.currentUser = BasicUser.map(response.user);

        return Auth.map({
          token: response.token,
          user: BasicUser.map(response.user),
        });
      })
    );
  }

  /**
   * Register
   *
   * @param input
   */
  register(input: { firstName: string; lastName: string; email: string; password: string }) {
    return this.graphQl('signUp', {
      arguments: { input },
      fields: ['token', { user: ['id', 'firstName', 'lastName', 'email', 'roles'] }],
      type: GraphQLRequestType.MUTATION,
      loading: true,
    }).pipe(
      map((response: Auth) => {
        this.authService.token = response.token;
        this.authService.currentUser = BasicUser.map(response.user);

        return Auth.map({
          token: response.token,
          user: BasicUser.map(response.user),
        });
      })
    );
  }
}
