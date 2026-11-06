import { computed, Directive, inject } from '@angular/core';
import { BrnFieldControl, BrnFieldControlDescribedBy } from '@spartan-ng/brain/field';
import { BrnInput } from '@spartan-ng/brain/input';
import { classes } from '../../utils';

@Directive({
	selector: '[hlmInput]',
	exportAs: 'hlmInput',
	hostDirectives: [{ directive: BrnInput, inputs: ['id', 'forceInvalid'] }, BrnFieldControlDescribedBy],
	host: {
		'data-slot': 'input',
		'[attr.aria-invalid]': '_ltAttr()',
		'[attr.data-invalid]': '_ltAttr()',
	},
})
export class HlmInput {
	private readonly _ltBrn = inject(BrnInput);
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
				'dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 data-[matches-spartan-invalid=true]:ring-destructive/20 dark:data-[matches-spartan-invalid=true]:ring-destructive/40 data-[matches-spartan-invalid=true]:border-destructive dark:data-[matches-spartan-invalid=true]:border-destructive/50 h-9 rounded-md border bg-transparent px-2.5 py-1 text-base shadow-xs transition-[color,box-shadow] file:h-7 file:text-sm file:font-medium focus-visible:ring-3 data-[matches-spartan-invalid=true]:ring-3 md:text-sm file:text-foreground placeholder:text-muted-foreground w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
		);
	}
}
