import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'dateAgo',
  pure: true,
  standalone: true,
})
export class DateAgoPipe implements PipeTransform {
  intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
    second: 1,
  };

  singular = {
    year: 'Jahr',
    month: 'Monat',
    week: 'Woche',
    day: 'Tag',
    hour: 'Stunde',
    minute: 'Minute',
    second: 'Sekunde',
  };

  plural = {
    year: 'Jahren',
    month: 'Monaten',
    week: 'Wochen',
    day: 'Tagen',
    hour: 'Stunden',
    minute: 'Minuten',
    second: 'Sekunden',
  };

  transform(value: any, currentDate?: Date): any {
    const now = currentDate ?? new Date();
    if (value) {
      const seconds = Math.floor((+now - +new Date(value)) / 1000);
      if (seconds < 29) {
        return 'gerade eben'; // less than 30 seconds ago will show as 'Just now'
      }

      let counter;
      for (const i of Object.keys(this.intervals)) {
        counter = Math.floor(seconds / this.intervals[i]);
        if (counter > 0) {
          if (counter === 1) {
            return 'vor ' + counter + ' ' + this.singular[i]; // singular (1 day ago)
          } else {
            return 'vor ' + counter + ' ' + this.plural[i]; // plural (2 days ago)
          }
        }
      }
    }
    return value;
  }
}
