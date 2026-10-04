// Adapted from Zag's MIT-licensed adapters; see LICENSE.

import type { BindableRefs, MachineSchema } from "@zag-js/core";

export function createRefs<T extends MachineSchema>(values: {
  [K in keyof T["refs"]]: T["refs"][K];
}): BindableRefs<T> {
  return {
    get(key) {
      return values[key];
    },
    set(key, value) {
      values[key] = value;
    },
  };
}
