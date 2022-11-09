import { HttpLink } from 'apollo-angular/http';
import { ApolloLink, concat, split } from '@apollo/client/core';
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
import { extractFiles } from 'extract-files';

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
    if (localStorage) {
      const token = authService.token || null;
      if (token) {
        headers.Authorization = 'Bearer ' + token;
      }
      operation.setContext(() => ({ headers }));
    }
    return forward(operation);
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
      })
    );

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
        concat(authMiddleware, http)
      )
    );
  } else {
    links.push(authMiddleware);
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
