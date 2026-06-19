/**
 * Canvas gesture lifecycle (Phase 10). Pure helpers so drag/resize/rotate share
 * one pattern: capture initial state on pointerdown, mutate the live DOM via CSS
 * transforms during pointermove (NO React state writes → 60 fps), and commit a
 * single state update on pointerup.
 *
 * The DOM mutation itself happens in the component (`el.style.transform = ...`);
 * these helpers build the transform strings and own the "commit exactly once"
 * guard so the behavior is testable without a browser.
 */

/** CSS transform for a screen-pixel translation during a drag. */
export function dragTransform(dx: number, dy: number): string {
  return `translate(${dx}px, ${dy}px)`;
}

/** CSS transform for a free rotation about a center (caller sets transform-origin). */
export function rotateTransform(deg: number): string {
  return `rotate(${deg}deg)`;
}

export interface Gesture<T> {
  readonly initial: T;
  /** Build the live DOM transform for a screen delta. */
  transform(dx: number, dy: number): string;
  /** Run `apply(initial)` exactly once; further calls are no-ops. */
  commit(apply: (initial: T) => void): void;
  readonly committed: boolean;
}

/**
 * Begin a gesture, snapshotting the initial state. `transform` produces the live
 * CSS transform; `commit` fires the single state write on release.
 */
export function beginGesture<T>(initial: T): Gesture<T> {
  let done = false;
  return {
    initial,
    transform: (dx, dy) => dragTransform(dx, dy),
    commit(apply) {
      if (done) return;
      done = true;
      apply(initial);
    },
    get committed() {
      return done;
    },
  };
}
