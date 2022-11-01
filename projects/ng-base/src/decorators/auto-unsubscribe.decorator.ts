/**
 * Decorator for automatically unsubscribe subscriptions
 * Inspired by https://codereacter.medium.com/angular-advanced-features-and-tips-you-may-not-know-about-cae3b8527184#9bd6
 */
export function AutoUnsubscribe(blackList: string[] = []) {
  return function (constructor: any) {
    const original = constructor.prototype.ngOnDestroy;

    constructor.prototype.ngOnDestroy = function () {
      for (const prop of Object.keys(this)) {
        if (!blackList.includes(prop)) {
          const property = this[prop];
          if (property && typeof property.unsubscribe === 'function') {
            property.unsubscribe();
          }
        }
      }
      if (original && typeof original === 'function') {
        original.apply(this, arguments);
      }
    };
  };
}
