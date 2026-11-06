import { Directive } from '@angular/core';
import { classes } from '../../utils';

@Directive({
	selector: '[hlmBreadcrumbItem]',
	exportAs: 'hlmBreadcrumbItem',
	host: {
		'data-slot': 'breadcrumb-item',
	},
})
export class HlmBreadcrumbItem {
	constructor() {
		classes(() => 'gap-1.5 inline-flex items-center');
	}
}
