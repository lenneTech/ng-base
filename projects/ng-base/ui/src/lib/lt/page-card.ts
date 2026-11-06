import { Component, contentChild, Directive, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

import { HlmCardImports } from '../helm/card';
import { nextLtId } from './control';

/** Marks the footer of an {@link LtPageCard} (links below the form: "Passwort vergessen?" …). */
@Directive({
  selector: '[ltPageCardFooter]',
})
export class LtPageCardFooter {}

/**
 * Centered card for slim pages (auth): title, description, content, footer slot (`[ltPageCardFooter]`).
 *
 * The card is a `section` labelled by its heading (`h1` by default, see `level`). `icon` is a Lucide icon name rendered
 * with `ng-icon`; register it in the app (`provideIcons({ lucideLock })`).
 */
@Component({
  selector: 'lt-page-card',
  imports: [HlmCardImports, NgIcon],
  host: { class: 'flex w-full justify-center px-4 py-10 sm:py-16' },
  templateUrl: './page-card.html',
})
export class LtPageCard {
  readonly description = input<string>();
  /** Lucide icon above the title. */
  readonly icon = input<string>();
  /** Heading level of the title (default 1). */
  readonly level = input<1 | 2>(1);
  readonly title = input<string>();

  protected readonly titleId = nextLtId('page-card-title');
  protected readonly footer = contentChild(LtPageCardFooter);
}
