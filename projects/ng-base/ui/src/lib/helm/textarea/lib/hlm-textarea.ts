import { computed, Directive, inject } from '@angular/core';
import { BrnFieldControl, BrnFieldControlDescribedBy } from '@spartan-ng/brain/field';
import { BrnTextarea } from '@spartan-ng/brain/textarea';
import { classes } from '../../utils';

@Directive({
	selector: '[hlmTextarea]',
	exportAs: 'hlmTextarea',
	hostDirectives: [{ directive: BrnTextarea, inputs: ['id', 'forceInvalid'] }, BrnFieldControlDescribedBy],
	host: {
		'data-slot': 'textarea',
		'[attr.aria-invalid]': '_ltAttr()',
		'[attr.data-invalid]': '_ltAttr()',
	},
})
export class HlmTextarea {
	private readonly _ltBrn = inject(BrnTextarea);
	private readonly _ltField = inject(BrnFieldControl, { optional: true });
	/** lenne.Tech: invalid only in the error state (touched or submitted), like the red border. */
	protected readonly _ltInvalid = computed(() => this._ltBrn.forceInvalid() || !!this._ltField?.spartanInvalid());
	/** Changes with every raw-validity change, so this binding always writes after the host directive's (see generate-helm.mjs). */
	protected readonly _ltAttr = computed(() => {
		const raw = !!this._ltField?.invalid();
		return this._ltInvalid() ? (raw ? 'true' : true) : raw ? null : undefined;
	});

	constructor() {
		classes(
			() =>
				'border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 data-[matches-spartan-invalid=true]:ring-destructive/20 dark:data-[matches-spartan-invalid=true]:ring-destructive/40 data-[matches-spartan-invalid=true]:border-destructive dark:data-[matches-spartan-invalid=true]:border-destructive/50 rounded-md border bg-transparent px-2.5 py-2 text-base shadow-xs transition-[color,box-shadow] focus-visible:ring-3 data-[matches-spartan-invalid=true]:ring-3 md:text-sm placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full outline-none disabled:cursor-not-allowed disabled:opacity-50',
		);
	}
}
