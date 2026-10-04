// Adapted from Zag's MIT-licensed adapters; see LICENSE.

import type { Bindable, BindableFn, BindableParams } from "@zag-js/core";

import { proxy, subscribe } from "@zag-js/store";

/** Each runtime owns its bindable subscriptions and cleanup callbacks. */
export function createBindable(
  notify: () => void,
  cleanup: (dispose: () => void) => void,
): BindableFn {
  function bindable<T>(props: () => BindableParams<T>): Bindable<T> {
    const options = props();
    let initial = options.defaultValue;
    if (options.value !== undefined) {
      initial = options.value;
    }
    const store = proxy({ value: initial as T });
    const equal = options.isEqual ?? Object.is;
    const controlled = () => {
      return props().value !== undefined;
    };
    const get = () => {
      return controlled() ? (props().value as T) : store.value;
    };

    cleanup(subscribe(store, notify, options.sync));

    return {
      get,
      hash(value) {
        return props().hash?.(value) ?? String(value);
      },
      initial,
      invoke(next, previous) {
        props().onChange?.(next, previous);
      },
      ref: store,
      set(value) {
        const previous = get();
        const next =
          typeof value === "function"
            ? (value as (previous: T) => T)(previous)
            : value;
        if (!controlled()) {
          store.value = next;
        }
        if (!equal(next, previous)) {
          props().onChange?.(next, previous);
        }
      },
    };
  }

  bindable.cleanup = cleanup;
  bindable.ref = <T>(initial: T) => {
    let value = initial;
    return {
      get: () => {
        return value;
      },
      set: (next: T) => {
        value = next;
      },
    };
  };

  return bindable;
}
