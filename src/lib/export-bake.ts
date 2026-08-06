/**
 * Module-level registry for the export card's latest in-flight cover bake.
 *
 * `ExportCard` registers the promise of each `bakeFilteredUrl` run (image
 * load + 1600px filter + toDataURL, usually 50–200ms) every time it re-bakes
 * — i.e. whenever the front-cover source or filter changes. `AppShell`'s
 * `cyc:export` handler awaits the latest registered bake before capturing, so
 * a user who clicks export right after changing the filter or uploading a new
 * cover never captures the previous bake's result or the "NO COVER" placeholder.
 *
 * Using module state (not a prop / context / event) keeps the two components
 * decoupled: no re-render, no listener re-binding, and the handler always reads
 * the most recent bake — correctly handling the "several bakes in flight after
 * a source swap" case (each new effect run overwrites the previous registration,
 * and the old bake's state write is suppressed by its effect-cleanup flag).
 *
 * The registered promise never rejects: `ExportCard` chains `.catch()` that
 * falls back to the placeholder, so awaiting it here is non-blocking.
 */

let latestCoverBake: Promise<void> | null = null;

/** Register the current cover bake (or `null` when there is no image to bake). */
export function trackCoverBake(promise: Promise<void> | null): void {
  latestCoverBake = promise;
}

/** The most recent cover bake, or `null` when the card has no image at all. */
export function getLatestCoverBake(): Promise<void> | null {
  return latestCoverBake;
}
