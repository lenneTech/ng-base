import { createClient, Client, ClientOptions } from 'graphql-ws';

export interface RestartableClient extends Client {
  restart(): void;
}

export function createRestartableClient(options: ClientOptions): RestartableClient {
  let restartRequested = false;
  let restart = () => {
    restartRequested = true;
  };

  const { on = undefined } = options;

  const client = createClient({
    ...options,
    on: {
      ...on,
      connected: (socket: any) => {
        // @ts-ignore
        on?.connected?.(socket);

        restart = () => {
          if (socket.readyState === WebSocket.OPEN) {
            // if the socket is still open for the restart, do the restart
            socket.close(4205, 'Client Restart');
          } else {
            // otherwise the socket might've closed, indicate that you want
            // a restart on the next connected event
            restartRequested = true;
          }
        };

        // just in case you were eager to restart
        if (restartRequested) {
          restartRequested = false;
          restart();
        }
      },
    },
  });

  return {
    ...client,
    restart: () => restart(),
  };
}
