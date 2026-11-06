import { Directive } from '@angular/core';
import { classes } from '../../utils';

@Directive({
	selector: '[hlmCodeBlockFooter],hlm-code-block-footer',
	exportAs: 'hlmCodeBlockFooter',
	host: { 'data-slot': 'code-block-footer' },
})
export class HlmCodeBlockFooter {
	constructor() {
		classes(() => 'text-muted-foreground gap-2 px-4 pb-4 group-data-[size=sm]/code-block:px-3 group-data-[size=sm]/code-block:pb-3 flex min-w-0 shrink-0 items-center');
	}
}
