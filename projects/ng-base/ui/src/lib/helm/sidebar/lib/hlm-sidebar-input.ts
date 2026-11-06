import { Directive } from '@angular/core';
import { HlmInput } from '../../input';
import { classes } from '../../utils';

@Directive({
	selector: 'input[hlmSidebarInput]',
	exportAs: 'hlmSidebarInput',
	hostDirectives: [HlmInput],
	host: {
		'data-slot': 'sidebar-input',
		'data-sidebar': 'input',
	},
})
export class HlmSidebarInput {
	constructor() {
		classes(() => 'bg-background h-8 w-full shadow-none');
	}
}
