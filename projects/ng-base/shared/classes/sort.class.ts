export class Sort {
  private sortOrder = 1;
  collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  /**
   * Sorts clicked column
   *
   * @param property
   * @param order
   * @param type
   */
  public startSort(property: string, order: string, type = '') {
    if (order === 'desc') {
      this.sortOrder = -1;
    }
    return (a, b) => {
      if (type === 'date') {
        return this.sortDate(new Date(a.latestStep[property]), new Date(b.latestStep[property]));
      } else if (type === 'position') {
        return this.collator.compare(a.position.Value[property], b.position.Value[property]) * this.sortOrder;
      } else {
        return this.collator.compare(a[property], b[property]) * this.sortOrder;
      }
    };
  }

  /**
   * Sorts dates
   *
   * @param a
   * @param b
   */
  private sortDate(a: Date, b: Date) {
    if (a < b) {
      return -1 * this.sortOrder;
    } else if (a > b) {
      return 1 * this.sortOrder;
    } else {
      return 0 * this.sortOrder;
    }
  }
}
