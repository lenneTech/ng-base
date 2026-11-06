import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { LT_TRANSITIONS } from './transitions';

const css = readFileSync(resolve(process.cwd(), 'projects/ng-base/ui/styles/transitions.css'), 'utf8');

describe('LT_TRANSITIONS', () => {
  it('has an enter and a leave rule with a duration variable for every transition', () => {
    for (const [name, { enter, leave }] of Object.entries(LT_TRANSITIONS)) {
      const enterRule = css.match(new RegExp(`\\.${enter} \\{([^}]*)\\}`))?.[1] ?? '';
      const leaveRule = css.match(new RegExp(`\\.${leave} \\{([^}]*)\\}`))?.[1] ?? '';
      expect(enterRule, name).toContain('var(--lt-enter-duration');
      expect(leaveRule, name).toContain('var(--lt-leave-duration');
    }
  });

  it('uses 100 ms for fades and 500 ms for slides by default', () => {
    expect(css).toMatch(/\.lt-fade-enter \{[^}]*var\(--lt-enter-duration, 100ms\)/);
    expect(css).toMatch(/\.lt-fade-scale-leave \{[^}]*var\(--lt-leave-duration, 100ms\)/);
    expect(css).toMatch(/\.lt-slide-enter \{[^}]*var\(--lt-enter-duration, 500ms\)/);
    expect(css).toMatch(/\.lt-slide-bottom-leave \{[^}]*var\(--lt-leave-duration, 500ms\)/);
  });

  it('defines the keyframes and respects prefers-reduced-motion', () => {
    for (const keyframes of ['lt-fade-in', 'lt-fade-scale-out', 'lt-slide-in', 'lt-slide-bottom-out', 'lt-slide-revert-in']) {
      expect(css).toContain(`@keyframes ${keyframes}`);
    }
    expect(css).toMatch(/translateX\(-100%\)/);
    expect(css).toMatch(/translateY\(100%\)/);
    expect(css).toMatch(/scale\(0\.95\)/);
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    for (const { enter, leave } of Object.values(LT_TRANSITIONS)) {
      expect(reduced).toContain(`.${enter}`);
      expect(reduced).toContain(`.${leave}`);
    }
  });
});
