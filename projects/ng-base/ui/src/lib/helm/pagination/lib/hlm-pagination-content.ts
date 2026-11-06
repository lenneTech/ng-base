import { Directive } from '@angular/core';
import { classes } from '../../utils';

@Directive({
	selector: 'ul[hlmPaginationContent]',
	exportAs: 'hlmPaginationContent',
	host: { 'data-slot': 'pagination-content' },
})
export class HlmPaginationContent {
	constructor() {
		classes(() => 'gap-1 flex items-center');
	}
}
