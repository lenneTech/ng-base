import { inject, InjectionToken, makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';
import { LT_RUNTIME_CONFIG, mergeLtFeatureOptions } from '@lenne.tech/ng-base';

/** Options of `provideLtAi()`; runtime override `NG_PUBLIC_LT_AI_BASE_PATH`. */
export interface LtAiOptions {
  /** REST base of the nest-server AI controller (default `/ai`). */
  basePath?: string;
}

const LT_AI_INPUT_OPTIONS = new InjectionToken<LtAiOptions>('LT_AI_INPUT_OPTIONS', { factory: () => ({}) });

/** Resolved AI options. */
export const LT_AI_OPTIONS = new InjectionToken<Required<LtAiOptions>>('LT_AI_OPTIONS', {
  factory: () => mergeLtFeatureOptions<Required<LtAiOptions>>({ basePath: '/ai' }, inject(LT_AI_INPUT_OPTIONS), inject(LT_RUNTIME_CONFIG, { optional: true })?.lt.ai),
});

/** AI providers (base path). The AI services work without it with the defaults. */
export function provideLtAi(options: LtAiOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: LT_AI_INPUT_OPTIONS, useValue: options }]);
}
