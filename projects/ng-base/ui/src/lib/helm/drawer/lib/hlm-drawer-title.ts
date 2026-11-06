import { Directive } from '@angular/core';
import { BrnDrawerTitle } from '@spartan-ng/brain/drawer';
import { classes } from '../../utils';

@Directive({
	selector: '[hlmDrawerTitle]',
	exportAs: 'hlmDrawerTitle',
	hostDirectives: [BrnDrawerTitle],
	host: { 'data-slot': 'drawer-title' },
})
export class HlmDrawerTitle {
	constructor() {
		classes(() => 'text-foreground font-medium');
	}
}
