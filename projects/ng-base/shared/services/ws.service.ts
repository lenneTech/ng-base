import { Injectable } from '@angular/core';
import { RestartableClient } from '../functions/ws-client.function';

@Injectable({
  providedIn: 'root',
})
export class WsService {
  client: RestartableClient;

  reconnect() {
    this.client?.restart();
  }
}
