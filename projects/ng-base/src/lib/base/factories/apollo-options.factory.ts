import { HttpLink } from 'apollo-angular/http';
import { BaseModuleConfig } from '../interfaces/base-module-config.interface';
import { AuthService } from '../services/auth.service';
import { ApolloLink } from '@apollo/client/core';
import { InMemoryCache } from '@apollo/client/cache';

/**
 * Factory for apollo-angular options
 */
export function apolloOptionsFactory(baseModuleConfig: BaseModuleConfig, httpLink: HttpLink, authService: AuthService) {
  const link = httpLink.create({
    uri: baseModuleConfig.apiUrl,
  });

  const authMiddleware = new ApolloLink((operation, forward) => {
    const headers: any = {};
    if (localStorage) {
      const token = authService.token || null;
      if (token) {
        headers.Authorization = 'Bearer ' + token;
      }
      operation.setContext(() => ({ headers }));
    }
    return forward(operation);
  });

  return {
    link: ApolloLink.from([authMiddleware, link]),
    cache: new InMemoryCache(),
    defaultOptions: {
      query: {
        fetchPolicy: 'network-only',
      },
    },
  };
}
