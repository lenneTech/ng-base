import { BasicUser } from './basic-user.class';
import { Helper } from './helper.class';
import { Standard } from './standard.class';

export class Auth extends Standard {
  refreshToken: string = undefined;
  token: string = undefined;
  user: BasicUser = undefined;

  public map(data: Partial<this> | { [key: string]: any }): this {
    Helper.map(data, this);
    this.user = data?.user ? BasicUser.map(data.user) : this.user;
    return this;
  }
}
