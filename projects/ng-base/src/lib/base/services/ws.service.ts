import { Injectable } from '@angular/core';
import { SubscriptionClient } from 'subscriptions-transport-ws';

@Injectable({
  providedIn: 'root',
})
export class WsService {
  client: SubscriptionClient;

  reconnect() {
    this.client?.close();
    (this.client as any)?.connect();
  }
}
