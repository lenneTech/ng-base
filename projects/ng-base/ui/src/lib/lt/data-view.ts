import { NgTemplateOutlet } from '@angular/common';
import { booleanAttribute, Component, computed, contentChild, contentChildren, Directive, inject, input, model, TemplateRef } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLayoutGrid, lucideTable } from '@ng-icons/lucide';

import { HlmCardImports } from '../helm/card';
import { HlmTableImports } from '../helm/table';
import { HlmToggleGroupImports } from '../helm/toggle-group';
import { injectLtUiI18n } from './i18n';

/** Column of an {@link LtDataView} table. */
export interface LtDataViewColumn<T> {
  /** Header text. */
  header: string;
  /** Property or accessor for the cell value. */
  key: keyof T | ((row: T) => unknown);
  /** Right-align (numbers). */
  numeric?: boolean;
}

/** View mode. */
export type LtDataViewMode = 'table' | 'tiles';

/** Template context of `ng-template[ltDataViewTile]`. */
export interface LtDataViewTileContext<T> {
  $implicit: T;
  index: number;
}

/** Template context of `ng-template[ltDataViewCell]`. */
export interface LtDataViewCellContext<T> {
  $implicit: T;
  column: LtDataViewColumn<T>;
  /** The cell value (`key` applied to the item). */
  value: unknown;
}

/**
 * Tile of an {@link LtDataView} (`let-item`, `let-index="index"`).
 *
 * @example <ng-template ltDataViewTile let-item><lt-page-card [title]="item.name" /></ng-template>
 */
@Directive({
  selector: 'ng-template[ltDataViewTile]',
})
export class LtDataViewTile {
  readonly template = inject<TemplateRef<LtDataViewTileContext<unknown>>>(TemplateRef);
}

/**
 * Table cell of an {@link LtDataView} (`let-item`, `let-value="value"`, `let-column="column"`). Name the column by its
 * `key` (or `header`) to override one column; without a name it applies to every column without an own template.
 *
 * @example <ng-template ltDataViewCell="status" let-value="value"><span hlmBadge>{{ value }}</span></ng-template>
 */
@Directive({
  selector: 'ng-template[ltDataViewCell]',
})
export class LtDataViewCell {
  readonly template = inject<TemplateRef<LtDataViewCellContext<unknown>>>(TemplateRef);
  /** Column `key` (property name) or `header`; empty for all columns. */
  readonly ltDataViewCell = input<string>('');
}

/**
 * List of records as table or tiles (switchable, preference two-way via `[(mode)]`), with empty state. Tiles render
 * the `ng-template[ltDataViewTile]` per item; table cells can be overridden with `ng-template[ltDataViewCell]`.
 *
 * - Table: Spartan table with a visually hidden `caption` (`label`), `th scope="col"`, numeric columns right-aligned
 *   with tabular figures, empty values as `–`.
 * - Tiles: a responsive CSS grid (`ul`/`li`, labelled by `label`); without a tile template every item shows its columns
 *   as a small card.
 * - View switch: a toggle group (`lt.ui.tableView` / `lt.ui.tileView`, `aria-pressed`); hide it with `[showViewSwitch]`.
 */
@Component({
  selector: 'lt-data-view',
  imports: [HlmCardImports, HlmTableImports, HlmToggleGroupImports, NgIcon, NgTemplateOutlet],
  providers: [provideIcons({ lucideLayoutGrid, lucideTable })],
  host: { class: 'block' },
  templateUrl: './data-view.html',
})
export class LtDataView<T extends object> {
  protected readonly i18n = injectLtUiI18n();

  readonly columns = input.required<LtDataViewColumn<T>[]>();
  /** Text when `items` is empty (default `lt.ui.noData`). */
  readonly emptyText = input<string>();
  readonly items = input.required<readonly T[]>();
  /** Accessible label of the table / list. */
  readonly label = input.required<string>();
  readonly mode = model<LtDataViewMode>('table');
  /** Show the table/tiles switch (default `true`). */
  readonly showViewSwitch = input(true, { transform: booleanAttribute });
  /** Track items by this key (default: index). */
  readonly trackBy = input<keyof T>();

  /** Tile template (`let-item`). */
  protected readonly tileTemplate = contentChild(LtDataViewTile);
  private readonly cellTemplates = contentChildren(LtDataViewCell);

  /** Cell template per column index (own template first, then the unnamed one). */
  protected readonly columnTemplates = computed(() => {
    const templates = this.cellTemplates();
    const fallback = templates.find((template) => !template.ltDataViewCell());
    return this.columns().map((column) => {
      const name = typeof column.key === 'function' ? null : String(column.key);
      const own = templates.find((template) => {
        const target = template.ltDataViewCell();
        return !!target && (target === name || target === column.header);
      });
      return (own ?? fallback)?.template ?? null;
    });
  });

  protected readonly emptyMessage = computed(() => this.emptyText() || this.i18n.t('lt.ui.noData'));

  protected trackItem(item: T, index: number): unknown {
    const key = this.trackBy();
    return key ? item[key] : index;
  }

  protected cellValue(item: T, column: LtDataViewColumn<T>): unknown {
    return typeof column.key === 'function' ? column.key(item) : item[column.key];
  }

  protected cellText(item: T, column: LtDataViewColumn<T>): string {
    const value = this.cellValue(item, column);
    return value === null || value === undefined || value === '' ? '–' : String(value);
  }

  protected onModeChange(mode: unknown): void {
    if (mode === 'table' || mode === 'tiles') {
      this.mode.set(mode);
    }
  }
}
