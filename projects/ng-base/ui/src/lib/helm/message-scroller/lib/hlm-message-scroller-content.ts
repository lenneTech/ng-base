import { Directive } from '@angular/core';
import { BrnMessageScrollerContent } from '@spartan-ng/brain/message-scroller';
import { classes } from '../../utils';

@Directive({
	selector: '[hlmMessageScrollerContent],hlm-message-scroller-content',
	exportAs: 'hlmMessageScrollerContent',
	hostDirectives: [
		{
			directive: BrnMessageScrollerContent,
			inputs: ['aria-relevant', 'spacerClassName'],
		},
	],
	host: {
		'data-slot': 'message-scroller-content',
	},
})
export class HlmMessageScrollerContent {
	constructor() {
		classes(() => 'gap-8 flex h-max min-h-full flex-col');
	}
}
