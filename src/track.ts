import type { MachineSchema, Params } from "@zag-js/core";

import { isEqual } from "@zag-js/utils";

type Track = Params<MachineSchema>["track"];
type Watcher = {
  dependencies: Parameters<Track>[0];
  previous: unknown[];
  run: () => void;
};

/** Tracks machine props and context without mutating callback functions. */
export class Tracker {
  readonly #watchers: Watcher[] = [];

  check(): void {
    for (const watcher of this.#watchers) {
      const next = watcher.dependencies.map((get) => {
        return get();
      });
      if (!isEqual(next, watcher.previous)) {
        // Commit first so a synchronous callback cannot retrigger itself.
        watcher.previous = next;
        watcher.run();
      }
    }
  }

  clear(): void {
    this.#watchers.length = 0;
  }

  readonly track: Track = (dependencies, run) => {
    this.#watchers.push({
      dependencies,
      previous: dependencies.map((get) => {
        return get();
      }),
      run,
    });
  };
}
