import { Inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { BASE_MODULE_CONFIG, BaseModuleConfig } from '../interfaces/base-module-config.interface';
import { BasicUser } from '../classes/basic-user.class';
import { StorageService } from './storage.service';
import { WsService } from './ws.service';

/**
 * Authentication service
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  // Subjects
  private _currentUser: BehaviorSubject<BasicUser> = new BehaviorSubject<BasicUser>(null);
  private _token: BehaviorSubject<string> = new BehaviorSubject<string>(null);

  /**
   * Constructor
   */
  constructor(
    @Inject(BASE_MODULE_CONFIG) private moduleConfig: BaseModuleConfig,
    private storageService: StorageService,
    private wsService: WsService
  ) {
    this.token = this.storageService.load('token') as string;
    this.currentUser = this.storageService.load('currentUser') as BasicUser;
  }

  /**
   * Logout
   */
  public logout() {
    this.storageService.remove(['token', 'currentUser']);
    this.currentUser = null;
    this.token = null;
  }

  // #################################################################
  // Current User
  // #################################################################

  get currentUser(): BasicUser {
    if (!localStorage) {
      return undefined;
    }

    return this._currentUser.value;
  }

  set currentUser(user: BasicUser) {
    this._currentUser.next(user);
    this.storageService.save('currentUser', user);
  }

  get currentUserObservable(): Observable<BasicUser> {
    return this._currentUser.asObservable();
  }

  // #################################################################
  // Token
  // #################################################################

  get token(): string {
    if (!localStorage) {
      return undefined;
    }

    return this._token.value;
  }

  set token(token: string) {
    this._token.next(token);
    this.storageService.save('token', token);
    this.wsService.reconnect();
  }

  get tokenObservable(): Observable<string> {
    return this._token.asObservable();
  }
}
