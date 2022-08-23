import { Pipe, PipeTransform } from '@angular/core';

/**
 * Truncate string with ellipses
 */
@Pipe({
  name: 'baseEllipses',
})
export class EllipsesPipe implements PipeTransform {
  transform(value: string, limit: number): string {
    if (!value) {
      return null;
    }

    return value.length > limit ? value.substring(0, limit) + '...' : value;
  }
}
