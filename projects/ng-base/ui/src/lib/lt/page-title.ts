import { Component, contentChild, Directive, input } from '@angular/core';

/** Marks the actions of an {@link LtPageTitle} (buttons next to the heading). */
@Directive({
  selector: '[ltPageTitleActions]',
})
export class LtPageTitleActions {}

/** Page heading (`h1`) with optional description; project actions into `[ltPageTitleActions]`. */
@Component({
  selector: 'lt-page-title',
  host: { class: 'block' },
  templateUrl: './page-title.html',
})
export class LtPageTitle {
  readonly description = input<string>();
  /** Heading level (default 1). */
  readonly level = input<1 | 2 | 3>(1);
  readonly title = input.required<string>();

  protected readonly actions = contentChild(LtPageTitleActions);
}
