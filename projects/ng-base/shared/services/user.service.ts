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
      fields: ['token', { user: ['id', 'firstName', 'lastName', 'email', 'roles', 'avatar'] }],
      type: GraphQLRequestType.QUERY,
      loading: true,
    }).pipe(
      map((response: Auth) => {
        this.authService.token = response.token;
        this.authService.currentUser = response.user;

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
      fields: ['token', { user: ['id', 'firstName', 'lastName', 'email', 'roles', 'avatar'] }],
      type: GraphQLRequestType.MUTATION,
      loading: true,
    }).pipe(
      map((response: Auth) => {
        this.authService.token = response.token;
        this.authService.currentUser = response.user;

        return Auth.map({
          token: response.token,
          user: BasicUser.map(response.user),
        });
      })
    );
  }

  /**
   * This function will make a GraphQL query to the server, and return the result
   *
   * @param id - The id of the user you want to get
   * @returns A GraphQLRequest object.
   */
  get(id: string) {
    return this.graphQl('getUser', {
      arguments: { id },
      fields: ['id', 'firstName', 'lastName', 'email', 'roles', 'avatar'],
      type: GraphQLRequestType.QUERY,
      loading: true,
    });
  }

  /**
   * Request password reset mail
   *
   * @param email
   */
  requestPasswordResetMail(email: string) {
    return this.graphQl('requestPasswordResetMail', {
      arguments: { email },
      fields: [],
      type: GraphQLRequestType.QUERY,
      loading: true,
    });
  }

  /**
   * Change password of current user
   *
   * @param id
   * @param password
   */
  changePassword(id: string, password: string) {
    return this.graphQl('updateUser', {
      arguments: { id, input: { password } },
      fields: ['id'],
      type: GraphQLRequestType.MUTATION,
      loading: true,
    });
  }

  /**
   * Set new password by token
   *
   * @param token
   * @param password
   */
  resetPassword(token: string, password: string) {
    return this.graphQl('resetPassword', {
      arguments: { token, password },
      type: GraphQLRequestType.MUTATION,
      loading: true,
    });
  }
}
