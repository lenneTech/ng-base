/**
 * Enter/leave transitions for Angular's native `animate.enter` / `animate.leave` (the counterpart of the five
 * `LtTransition*` Vue components). The CSS classes ship in `ui/styles/transitions.css` (imported by `theme.css`);
 * durations via the CSS variables `--lt-enter-duration` / `--lt-leave-duration` (default 100 ms for fades, 500 ms for
 * slides); `prefers-reduced-motion: reduce` turns every transition into a 1 ms fade.
 *
 * @example
 * @if (open()) { <div [animate.enter]="ltTransitions.fade.enter" [animate.leave]="ltTransitions.fade.leave">…</div> }
 */
export const LT_TRANSITIONS = {
  fade: { enter: 'lt-fade-enter', leave: 'lt-fade-leave' },
  fadeScale: { enter: 'lt-fade-scale-enter', leave: 'lt-fade-scale-leave' },
  slide: { enter: 'lt-slide-enter', leave: 'lt-slide-leave' },
  slideBottom: { enter: 'lt-slide-bottom-enter', leave: 'lt-slide-bottom-leave' },
  slideRevert: { enter: 'lt-slide-revert-enter', leave: 'lt-slide-revert-leave' },
} as const;

/** Name of a transition in {@link LT_TRANSITIONS}. */
export type LtTransitionName = keyof typeof LT_TRANSITIONS;
