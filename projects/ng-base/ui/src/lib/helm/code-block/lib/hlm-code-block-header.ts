import { Directive } from '@angular/core';
import { classes } from '../../utils';

@Directive({
	selector: '[hlmCodeBlockHeader],hlm-code-block-header',
	exportAs: 'hlmCodeBlockHeader',
	host: { 'data-slot': 'code-block-header' },
})
export class HlmCodeBlockHeader {
	constructor() {
		classes(
			() =>
				'text-muted-foreground group-data-[variant=destructive]/code-block:text-destructive gap-2 px-4 pt-4 group-data-[size=sm]/code-block:px-3 group-data-[size=sm]/code-block:pt-3 flex min-w-0 shrink-0 items-center *:has-[>[data-slot=code-block-title]]:min-w-0',
		);
	}
}
