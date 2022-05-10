import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class WsService {
  client: any;

  reconnect() {
    this.client?.close();
    (this.client as any)?.connect();
  }
}
