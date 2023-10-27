import { HttpLink } from 'apollo-angular/http';
import { ApolloLink, concat, fromPromise, split } from '@apollo/client/core';
import { InMemoryCache } from '@apollo/client/cache';
import { getMainDefinition } from '@apollo/client/utilities';
import {
  AuthService,
  BaseModuleConfig,
  createRestartableClient,
  RestartableClient,
  WsService,
} from '@lenne.tech/ng-base/shared';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import extractFiles from '../functions/extract-files.function';
import { firstValueFrom } from 'rxjs';
import { onError } from '@apollo/client/link/error';

/**
 * Factory for apollo-angular options
 */
export function apolloOptionsFactory(
  baseModuleConfig: BaseModuleConfig,
  httpLink: HttpLink,
  authService: AuthService,
  wsService: WsService
) {
  const links = [];

  const http = httpLink.create({
    uri: baseModuleConfig.apiUrl,
    extractFiles,
  });

  const authMiddleware = new ApolloLink((operation, forward) => {
    const headers: any = {};
    const operationName = (operation.query.definitions[0] as any)?.selectionSet?.selections[0]?.name?.value;

    if (localStorage) {
      let token: string;

      if (operationName === 'refreshToken') {
        token = authService.refreshToken || null;
      } else {
        token = authService.token || null;
      }

      if (token) {
        headers.Authorization = 'Bearer ' + token;
      }

      operation.setContext(() => ({ headers }));
    }
    return forward(operation);
  });

  const errorLink = onError(({ graphQLErrors, networkError, operation, forward }) => {
    if (graphQLErrors) {
      for (const err of graphQLErrors) {
        switch (err.extensions.code) {
          case 'UNAUTHENTICATED': {
            if (
              err.message !== 'Expired refresh token' &&
              err.message !== 'Expired token' &&
              err.message !== 'Invalid token'
            ) {
              return;
            }

            if (err.message === 'Expired refresh token' || err.message === 'Invalid token') {
              authService.clearSession();
              return;
            }

            return fromPromise(firstValueFrom(authService.requestNewToken()))
              .filter((value) => Boolean(value))
              .flatMap((response) => {
                const oldHeaders = operation.getContext().headers;
                // modify the operation context with a new token
                operation.setContext({
                  headers: {
                    ...oldHeaders,
                    Authorization: `Bearer ${response.token}`,
                  },
                });

                // retry the request, returning the new observable
                return forward(operation);
              });
          }
        }
      }
    }
  });

  if (baseModuleConfig.logging) {
    console.log(baseModuleConfig);
  }

  if (baseModuleConfig.wsUrl) {
    const wsLink = new GraphQLWsLink(
      createRestartableClient({
        url: baseModuleConfig.wsUrl,
        connectionParams: () => {
          return {
            Authorization: authService.token ? 'Bearer ' + authService.token : undefined,
          };
        },
      }) as any
    ) as any;

    // Set client for reconnection on logout/login
    wsService.client = wsLink.client as RestartableClient;

    // using the ability to split links, you can send data to each link
    // depending on what kind of operation is being sent
    links.push(
      split(
        // split based on operation type
        ({ query }) => {
          // @ts-ignore
          const { kind, operation } = getMainDefinition(query);
          return kind === 'OperationDefinition' && operation === 'subscription';
        },
        wsLink,
        concat(concat(authMiddleware, errorLink), http)
      )
    );
  } else {
    links.push(authMiddleware);
    links.push(errorLink);
    links.push(http);
  }

  return {
    link: ApolloLink.from(links),
    cache: new InMemoryCache(),
    defaultOptions: {
      query: {
        fetchPolicy: 'network-only',
      },
    },
  };
}
