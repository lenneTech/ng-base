import { type Provider } from '@angular/core';
import { type BrnCalendarI18n, BrnCalendarI18nService, BrnCalendarI18nToken } from '@spartan-ng/brain/calendar';
import { injectLtUiI18n } from './i18n';

/*
 * Date helpers of the lt date pickers: German format `dd.MM.yyyy`, local dates (no time zone conversion).
 */

/** Local midnight of `date`. */
export function ltStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whether `a` and `b` are the same local day. */
export function ltIsSameDay(a: Date | null | undefined, b: Date | null | undefined): boolean {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** `dd.MM.yyyy`. */
export function ltFormatDate(date: Date): string {
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${String(date.getFullYear()).padStart(4, '0')}`;
}

/** `HH:mm` (24 h). */
export function ltFormatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Parse a typed or scanned date (local midnight), or `null` when it is no real calendar date.
 *
 * Accepted: `d.M.yyyy`, `d.M.yy` (20yy), `ddMMyyyy`, `ddMMyy` and ISO `yyyy-MM-dd`.
 */
export function ltParseDate(value: string): Date | null {
  const text = value.trim();
  let day: number;
  let month: number;
  let year: number;
  let match: RegExpMatchArray | null;
  if ((match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/))) {
    [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (match[3]!.length === 2) {
      year += 2000;
    }
  } else if ((match = text.match(/^(\d{2})(\d{2})(\d{2}|\d{4})$/))) {
    [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (match[3]!.length === 2) {
      year += 2000;
    }
  } else if ((match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** Parse `HH:mm` into hours and minutes, or `null`. */
export function ltParseTime(value: string): { hours: number; minutes: number } | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? { hours, minutes } : null;
}

/** Whether `date` (a day) lies within `min`/`max` (compared by day). */
export function ltIsDayInRange(date: Date, min: Date | undefined, max: Date | undefined): boolean {
  const day = ltStartOfDay(date).getTime();
  return (!min || day >= ltStartOfDay(min).getTime()) && (!max || day <= ltStartOfDay(max).getTime());
}

/**
 * Calendar texts for the active locale (month and weekday names via `Intl`, week starts on Monday except for English,
 * navigation labels from `lt.ui.previousMonth` / `lt.ui.nextMonth`).
 */
export function provideLtCalendarI18n(): Provider {
  return {
    provide: BrnCalendarI18nToken,
    useFactory: () => {
      const i18n = injectLtUiI18n();
      const service = new BrnCalendarI18nService();
      service.use(ltCalendarI18n(i18n.locale(), (key) => i18n.t(key)));
      return service;
    },
  };
}

/** Spartan calendar i18n for `locale`. */
export function ltCalendarI18n(locale: string, t: (key: string) => string): Partial<BrnCalendarI18n> {
  const weekday = (index: number, style: 'long' | 'short') => new Intl.DateTimeFormat(locale, { weekday: style }).format(new Date(2024, 0, 7 + index));
  const months = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2024, month, 1)));
  return {
    firstDayOfWeek: () => (locale.startsWith('en') ? 0 : 1),
    formatHeader: (month, year) => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(year, month, 1)),
    formatMonth: (month) => new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(2024, month, 1)),
    formatWeekdayName: (index) => weekday(index, 'short').slice(0, 2),
    formatYear: (year) => String(year),
    labelNext: () => t('lt.ui.nextMonth'),
    labelPrevious: () => t('lt.ui.previousMonth'),
    labelWeekday: (index) => weekday(index, 'long'),
    months: () => months as ReturnType<BrnCalendarI18n['months']>,
  };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
