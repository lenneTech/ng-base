import { Injectable, Injector } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { BasicUser } from '../classes/basic-user.class';
import { StorageService } from './storage.service';
import { WsService } from './ws.service';
import { GraphQLService } from './graphql.service';
import { Router } from '@angular/router';

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
  private _refreshToken: BehaviorSubject<string> = new BehaviorSubject<string>(null);

  /**
   * Constructor
   */
  constructor(
    private storageService: StorageService,
    private wsService: WsService,
    private injector: Injector,
    private router: Router
  ) {
    this.loadFromStorage();
  }

  requestNewToken(): Observable<{ token: string; refreshToken: string }> {
    return new Observable<{ token: string; refreshToken: string }>((subscriber) => {
      this.injector
        .get(GraphQLService)
        .graphQl('refreshToken', {
          fields: ['token', 'refreshToken'],
        })
        .subscribe({
          next: (response) => {
            this.token = response.token;
            this.refreshToken = response.refreshToken;
            subscriber.next(response);
            subscriber.complete();
          },
          error: (err) => {
            subscriber.error(err);
          },
        });
    });
  }

  loadFromStorage() {
    if (localStorage) {
      this.token = this.storageService.load('token') as string;
      this.refreshToken = this.storageService.load('refreshToken') as string;
      this.currentUser = this.storageService.load('currentUser') as BasicUser;
    }
  }

  /**
   * Logout
   */
  public logout(redirect = true): Observable<boolean> {
    return new Observable((subscriber) => {
      this.injector
        .get(GraphQLService)
        .graphQl('logout', {
          fields: [],
        })
        .subscribe({
          next: () => {
            this.clearSession(redirect);
            subscriber.next(true);
            subscriber.complete();
          },
          error: (err) => {
            subscriber.error(err);
          },
        });
    });
  }

  clearSession(redirect = true) {
    this.storageService.remove(['token', 'refreshToken', 'currentUser']);
    this.currentUser = null;
    this.token = null;
    this.refreshToken = null;

    if (redirect) {
      this.router.navigate(['/auth']);
    }
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
    if (!this._token.value) {
      this.loadFromStorage();
    }

    return this._token.asObservable();
  }

  // #################################################################
  // refreshToken
  // #################################################################

  get refreshToken(): string {
    if (!localStorage) {
      return undefined;
    }

    return this._refreshToken.value;
  }

  set refreshToken(refreshToken: string) {
    this._refreshToken.next(refreshToken);
    this.storageService.save('refreshToken', refreshToken);
  }

  get refreshTokenObservable(): Observable<string> {
    if (!this._refreshToken.value) {
      this.loadFromStorage();
    }

    return this._refreshToken.asObservable();
  }
}
