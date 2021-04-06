import { Standard } from './standard.class';

/**
 * Helper class
 */
export class Helper {
  /**
   * Simple filter function for plain objects
   */
  static filter<T = { [key: string]: any }>(objects: T[], filter: { [key: string]: any }): T[] {
    return (objects?.filter((element) => {
      for (const [key, value] of Object.entries(filter)) {
        if (Array.isArray(element[key])) {
          for (const item of element[key]) {
            if (!element[key].includs(value)) {
              return false;
            }
          }
        } else if (element[key] !== value) {
          return false;
        }
      }
      return true;
    }) || []) as any[];
  }

  /**
   * Convert to a url/uri conform string
   * Only:
   * - lower case
   * - chars, numbers and hyphens
   */
  static urlString(str: any, options: { allowAll?: boolean } = {}): string {
    // Config
    const config = {
      allowAll: false,
      ...options,
    };

    // To string
    str = str + '';

    // Trim
    str = str.trim();

    // Lower case
    str = str.toLowerCase();

    if (!config.allowAll) {
      // Replace spaces
      str = str.trim().replace(/\s+/g, '-');

      // Replace some special chars
      str = str.replace('ä', 'ae');
      str = str.replace('ö', 'oe');
      str = str.replace('ü', 'ue');
      str = str.replace('ß', 'ss');

      // Remove other special chars
      str = str.replace(/[^a-zA-Z0-9-]/g, '');
    }

    // Return url conform string
    return encodeURI(str);
  }

  /**
   * Simple map function
   */
  public static map<T = { [key: string]: any }>(
    source: Partial<T> | { [key: string]: any },
    target: T,
    options: { funcAllowed?: boolean; dateStringToDate?: boolean | string[] } = {}
  ): T {
    // Set config
    const config = {
      funcAllowed: false,
      dateStringToDate: true,
      ...options,
    };

    // Check source
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return target;
    }

    // Update properties
    for (const key of Object.keys(target)) {
      if (source[key] !== undefined && (config.funcAllowed || typeof (source[key] !== 'function'))) {
        if (typeof source[key] === 'string' && config.dateStringToDate) {
          if (Array.isArray(config.dateStringToDate)) {
            if (config.dateStringToDate.includes(key)) {
              target[key] = Helper.parseDate(source[key]);
            }
          } else {
            target[key] = Helper.parseDate(source[key]);
          }
        } else {
          target[key] = source[key];
        }
      }
    }

    // Return target
    return target;
  }

  /**
   * Create Object or Objects of specified type with specified data
   */
  public static maps<T extends Standard>(
    data: Partial<T> | Partial<T>[] | { [key: string]: any } | { [key: string]: any }[],
    targetClass: new (...args: any[]) => T
  ): T[] {
    // Check data
    if (!data || typeof data !== 'object') {
      return undefined;
    }

    // Check array
    if (!Array.isArray(data)) {
      data = [data];
    }

    // Map
    return (data as any).map((item: any) => {
      return (targetClass as any).map(item);
    });
  }

  /**
   * Get plain parameter
   */
  public static getPlainParameter(parameter: string) {
    if (!parameter) {
      return parameter;
    }
    return parameter?.split('?')?.shift()?.split('#')?.shift();
  }

  /**
   * Get ID of an url parameter
   */
  public static getParameterId(parameter: string) {
    if (!parameter) {
      return parameter;
    }
    return Helper.getPlainParameter(parameter)?.split('-').pop();
  }

  /**
   * Delay
   */
  public static delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Deep freeze
   * See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze#What_is_shallow_freeze
   */
  public static deepFreeze(object: any, preparedObjects = []) {
    // Prevent infinit regress
    if (preparedObjects.includes(object as never)) {
      return object;
    }
    preparedObjects.push(object as never);

    // Retrieve the property names defined on object
    const propNames = Object.getOwnPropertyNames(object);

    // Freeze properties before freezing self
    for (const name of propNames) {
      const value = object[name];

      if (value && typeof value === 'object') {
        Helper.deepFreeze(value, preparedObjects);
      }
    }

    return Object.freeze(object);
  }

  /**
   * Generates an unique identifier with 24 characters
   */
  public static getUID(): string {
    let dt = new Date().getTime();
    const uuid = 'xxxxxxxxxxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      // eslint-disable-next-line no-bitwise
      const r = (dt + Math.random() * 16) % 16 | 0;
      dt = Math.floor(dt / 16);
      // eslint-disable-next-line no-bitwise
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
    return uuid;
  }

  /**
   * Parse date string to date object
   */
  public static parseDate(dateString: string) {
    const reISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*))(?:Z|(\+|-)([\d|:]*))?$/;
    const reMsAjax = /^\/Date\((d|-|.*)\)[\/|\\]$/;
    if (typeof dateString === 'string') {
      const isoExec = reISO.exec(dateString);
      if (isoExec) {
        return new Date(dateString);
      }
      const msAjaxExec = reMsAjax.exec(dateString);
      if (msAjaxExec) {
        const cleaned = msAjaxExec[1].split(/[-+,.]/);
        return new Date(cleaned[0] ? +cleaned[0] : 0 - +cleaned[1]);
      }
    }
    return dateString;
  }

  /**
   * Get browser name and version
   */
  public static getBrowser() {
    const userAgent = navigator.userAgent;
    let data = userAgent.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];
    let version;
    if (/trident/i.test(data[1])) {
      version = /\brv[ :]+(\d+)/g.exec(userAgent) || [];
      return { name: 'IE', version: version[1] || '' };
    }
    if (data[1] === 'Chrome') {
      version = userAgent.match(/\bOPR|Edge\/(\d+)/);
      if (version != null) {
        return { name: 'Opera', version: version[1] };
      }
    }
    data = data[2] ? [data[1], data[2]] : [navigator.appName, navigator.appVersion, '-?'];
    version = userAgent.match(/version\/(\d+)/i);
    if (version !== null) {
      data.splice(1, 1, version[1]);
    }
    return {
      name: data[0],
      version: data[1],
    };
  }

  /**
   * Whether first parameter is a deep subset of second parameter
   * Hint: functions will be ignored
   */
  static isSubset(a: any, b: any) {
    // Equal
    if (a === b) {
      return true;
    }

    // Different type
    if (typeof a !== typeof b) {
      return false;
    }

    // Process array
    if (Array.isArray(a)) {
      for (const [key, value] of Object.entries(a)) {
        if (Helper.isSubset(value, b[key])) {
          return false;
        }
      }
      return true;
    }

    // Process object
    if (typeof a === 'object') {
      const plain = JSON.parse(JSON.stringify(a));
      for (const [key, value] of Object.entries(plain)) {
        if (Helper.isSubset(value, b[key])) {
          return false;
        }
      }
      return true;
    }

    // Else
    return true;
  }

  /**
   * Whether parameters are equal (have equal properties)
   * Hint: functions will be ignored
   */
  static isEqual(a: any, b: any) {
    return Helper.isSubset(a, b) && Helper.isSubset(b, a);
  }

  /**
   * First level difference of two objects
   * Hint: functions will be ignored and when an array or an object is different the hole array or object will used as property value
   *
   * @returns Record<string, any> Object with properties from first object
   */
  static getDiff(a: Record<string, any>, b: Record<string, any>, clone: boolean = true) {
    const result = {};
    let firstObject = a;
    if (clone) {
      firstObject = JSON.parse(JSON.stringify(a));
    }
    for (const [key, value] of Object.entries(firstObject)) {
      if (!Helper.isSubset(value, b[key])) {
        result[key] = value;
      }
    }
    return result;
  }
}
