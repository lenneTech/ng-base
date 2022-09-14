export function AutoUnsubscribe(blackList: string[] = []) {
  // tslint:disable-next-line
  return function (constructor: any) {
    const original = constructor.prototype.ngOnDestroy;
    // tslint:disable-next-line
    constructor.prototype.ngonDestroy = function () {
      for (const prop of Object.keys(this)) {
        const property = this[prop];
        if (!blackList.includes(prop)) {
          if (property && typeof property.unsubscribe === 'function') {
            property.unsubscribe();
          }
        }
        original && typeof original === 'function' && original.apply(this, arguments);
      }
    };
  };
}
