import { Standard } from './standard.class';
import { Helper } from './helper.class';

/**
 * User class
 */
export class BasicUser extends Standard {
  id: string = undefined;
  email: string = undefined;
  firstName: string = undefined;
  lastName: string = undefined;
  roles: string[] = [];
  username: string = undefined;

  // ===================================================================================================================
  // Methods
  // ===================================================================================================================

  /**
   * Mapping
   */
  public map(data: Partial<this> | { [key: string]: any }): this {
    Helper.map(data, this);
    return this;
  }

  /**
   * Checks whether the user has at least one of the required roles
   */
  public hasRole(roles: string | string[]) {
    if (typeof roles === 'string') {
      roles = [roles];
    }
    if (!this.roles || this.roles.length < 1) {
      return false;
    }
    return !roles || roles.length < 1 ? true : this.roles.some((role) => roles.includes(role));
  }

  /**
   * Checks whether the user has all required roles
   */
  public hasAllRoles(roles: string | string[]) {
    if (typeof roles === 'string') {
      roles = [roles];
    }
    if (!this.roles || this.roles.length < 1) {
      return false;
    }
    return !roles ? true : roles.every((role) => this.roles.includes(role));
  }
}
