import { HttpLink } from 'apollo-angular/http';
import { BaseModuleConfig } from '../interfaces/base-module-config.interface';
import { AuthService } from '../services/auth.service';
import { ApolloLink, concat, split } from '@apollo/client/core';
import { InMemoryCache } from '@apollo/client/cache';
import { WebSocketLink } from '@apollo/client/link/ws';
import { getMainDefinition } from '@apollo/client/utilities';
import { WsService } from '../services/ws.service';

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
  const defaultUrl = 'api.' + window.location.href + '/graphql';

  const http = httpLink.create({
    uri: baseModuleConfig.apiUrl ? baseModuleConfig.apiUrl : 'https://' + defaultUrl,
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

  if (baseModuleConfig.wsUrl) {
    const wsLink = new WebSocketLink({
      uri: baseModuleConfig.wsUrl,
      options: {
        reconnect: true,
        connectionParams: () => ({
          Authorization: authService.token ? 'Bearer ' + authService.token : undefined,
        }),
      },
    });

    // Set client for reconnection on logout/login
    wsService.client = (wsLink as any).subscriptionClient;

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
    links.push(http);
    links.push(authMiddleware);
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