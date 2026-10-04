// Adapted from Zag's MIT-licensed runtime; see LICENSE.

import type {
  ActionsOrFn,
  Bindable,
  BindableContext,
  BindableRefs,
  ChooseFn,
  ComputedFn,
  EffectsOrFn,
  GuardFn,
  Machine,
  MachineSchema,
  Params,
  PropFn,
  Scope,
  Service,
  Transition,
} from "@zag-js/core";

import {
  createReplaceTracker,
  createScope,
  findTransition,
  getExitEnterStates,
  hasTag,
  INIT_STATE,
  MachineStatus,
  matchesState,
  resolveStateValue,
} from "@zag-js/core";
import { compact, identity, toArray, warn } from "@zag-js/utils";

import { createBindable } from "./bindable.js";
import { createRefs } from "./refs.js";
import { Tracker } from "./track.js";

/** Package-owned runtime. Lit's controller drives start, stop and prop refresh. */
export class LitMachine<T extends MachineSchema> {
  get service(): Service<T> {
    return {
      computed: this.#computed,
      context: this.#context,
      event: this.#getEvent(),
      getStatus: () => {
        return this.#status;
      },
      prop: this.#prop,
      refs: this.#refs,
      scope: this.#scope,
      send: this.#send,
      state: this.#getState(),
    };
  }

  readonly #cleanups: (() => void)[] = [];
  readonly #computed: ComputedFn<T>;
  readonly #context: BindableContext<T>;
  readonly #definition: Machine<T>;
  readonly #effects = new Map<string, () => void>();
  #event = { type: "" } as Parameters<Service<T>["send"]>[0];
  #previousEvent = { type: "" } as Parameters<Service<T>["send"]>[0];
  readonly #prop: PropFn<T>;
  readonly #refs: BindableRefs<T>;
  readonly #replaceTracker = createReplaceTracker();
  readonly #scope: Scope;
  readonly #state: Bindable<T["state"]>;
  #status = MachineStatus.NotStarted;
  readonly #subscriptions = new Set<(service: Service<T>) => void>();
  readonly #tracker = new Tracker();

  #transition: Transition<T> | undefined;

  constructor(definition: Machine<T>, getProps: () => Partial<T["props"]>) {
    this.#definition = definition;
    const { getRootNode, id, ids } = getProps() as Partial<
      Pick<Scope, "getRootNode" | "id" | "ids">
    >;
    this.#scope = createScope({
      getRootNode:
        getRootNode ??
        (() => {
          return document;
        }),
      id,
      ids,
    });
    this.#prop = (key) => {
      const supplied = getProps();
      const props =
        definition.props?.({ props: compact(supplied), scope: this.#scope }) ??
        supplied;
      return props[key] as T["props"][typeof key];
    };

    const bindable = createBindable(this.#publish, (cleanup) => {
      this.#cleanups.push(cleanup);
    });
    const context =
      definition.context?.({
        bindable,
        flush: queueMicrotask,
        getComputed: () => {
          return this.#computed;
        },
        getContext: () => {
          return this.#context;
        },
        getEvent: this.#getEvent,
        getRefs: () => {
          return this.#refs;
        },
        prop: this.#prop,
        scope: this.#scope,
      }) ?? ({} as { [K in keyof T["context"]]: Bindable<T["context"][K]> });

    this.#context = {
      get: (key) => {
        return context[key].get();
      },
      hash: (key) => {
        return context[key].hash(context[key].get());
      },
      initial: (key) => {
        // Zag exposes optional bindable initials through a required context accessor.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return context[key].initial!;
      },
      set: (key, value) => {
        context[key].set(value);
      },
    };
    this.#computed = (key) => {
      const compute = definition.computed?.[key];
      if (!compute) {
        throw new Error(`Missing Zag computed implementation: ${String(key)}`);
      }
      return compute(this.#params());
    };
    this.#refs = createRefs<T>(
      (definition.refs?.({ context: this.#context, prop: this.#prop }) ??
        {}) as { [K in keyof T["refs"]]: T["refs"][K] },
    );
    this.#state = bindable(() => {
      return {
        defaultValue: resolveStateValue(
          definition,
          definition.initialState({ prop: this.#prop }),
        ),
        onChange: (next, previous) => {
          const { entering, exiting } = getExitEnterStates(
            definition,
            previous,
            next,
            this.#transition?.reenter,
          );
          for (const item of exiting) {
            this.#effects.get(item.path)?.();
            this.#effects.delete(item.path);
          }
          for (const item of exiting) {
            this.#action(item.state.exit);
          }
          this.#action(this.#transition?.actions);
          for (const item of entering) {
            this.#enterEffects(item.path, item.state.effects);
          }
          if (previous === INIT_STATE) {
            this.#action(definition.entry);
            this.#enterEffects(INIT_STATE, definition.effects);
          }
          for (const item of entering) {
            this.#action(item.state.entry);
          }
        },
      };
    });
  }

  /** Re-evaluate watchers against the live props source without merging it. */
  refreshProps(): void {
    if (this.#status === MachineStatus.Started) {
      this.#tracker.check();
    }
  }

  start(): void {
    if (this.#status === MachineStatus.Started) {
      return;
    }
    if (this.#status === MachineStatus.Stopped) {
      throw new Error("Create a new LitMachine after stopping it.");
    }
    this.#status = MachineStatus.Started;
    this.#state.invoke(this.#state.initial, INIT_STATE);
    this.#definition.watch?.(this.#params());
  }

  stop(): void {
    if (this.#status === MachineStatus.Stopped) {
      return;
    }
    const started = this.#status === MachineStatus.Started;
    // Cancel queued sends before running any cleanup callbacks.
    this.#status = MachineStatus.Stopped;
    for (const cleanup of this.#effects.values()) {
      cleanup();
    }
    this.#effects.clear();
    this.#transition = undefined;
    if (started) {
      this.#action(this.#definition.exit);
    }
    for (const cleanup of this.#cleanups) {
      cleanup();
    }
    this.#cleanups.length = 0;
    this.#subscriptions.clear();
    this.#tracker.clear();
  }

  subscribe(callback: (service: Service<T>) => void): () => void {
    this.#subscriptions.add(callback);
    return () => {
      this.#subscriptions.delete(callback);
    };
  }

  readonly #action = (actions: ActionsOrFn<T> | undefined): void => {
    const keys =
      typeof actions === "function" ? actions(this.#params()) : actions;
    for (const key of keys ?? []) {
      const action = this.#definition.implementations?.actions?.[key];
      if (!action) {
        warn(`Missing Zag action implementation: ${String(key)}`);
      }
      action?.(this.#params());
    }
  };

  readonly #choose: ChooseFn<T> = (transitions) => {
    return toArray(transitions).find((transition) => {
      return !transition.guard || this.#guard(transition.guard);
    });
  };

  #enterEffects(path: string, effects: EffectsOrFn<T> | undefined): void {
    const keys =
      typeof effects === "function" ? effects(this.#params()) : effects;
    const cleanups: (() => void)[] = [];
    const existing = this.#effects.get(path);
    if (existing) {
      cleanups.push(existing);
    }
    for (const key of keys ?? []) {
      const effect = this.#definition.implementations?.effects?.[key];
      if (!effect) {
        warn(`Missing Zag effect implementation: ${String(key)}`);
      }
      const cleanup = effect?.(this.#params());
      if (cleanup) {
        cleanups.push(cleanup);
      }
    }
    if (cleanups.length > 0) {
      this.#effects.set(path, () => {
        for (const cleanup of cleanups) {
          cleanup();
        }
      });
    }
  }

  readonly #getEvent = (): Service<T>["event"] => {
    return {
      ...this.#event,
      current: () => {
        return this.#event;
      },
      previous: () => {
        return this.#previousEvent;
      },
    };
  };

  #getState(): Service<T>["state"] {
    return {
      ...this.#state,
      hasTag: (tag) => {
        return hasTag(this.#definition, this.#state.get(), tag);
      },
      matches: (...values) => {
        return values.some((value) => {
          return value !== undefined && matchesState(this.#state.get(), value);
        });
      },
    };
  }

  readonly #guard = (key: GuardFn<T> | T["guard"]): boolean | undefined => {
    if (typeof key === "function") {
      return key(this.#params());
    }
    const guard = this.#definition.implementations?.guards?.[key];
    if (!guard) {
      warn(`Missing Zag guard implementation: ${String(key)}`);
    }
    return guard?.(this.#params());
  };

  #params(): Params<T> {
    return {
      action: this.#action,
      choose: this.#choose,
      computed: this.#computed,
      context: this.#context,
      event: this.#getEvent(),
      flush: identity,
      guard: this.#guard,
      prop: this.#prop,
      refs: this.#refs,
      scope: this.#scope,
      send: this.#send,
      state: this.#getState(),
      track: this.#tracker.track,
    };
  }

  readonly #publish = (): void => {
    if (this.#status !== MachineStatus.Started) {
      return;
    }
    this.#tracker.check();
    for (const callback of this.#subscriptions) {
      callback(this.service);
    }
  };

  readonly #send: Service<T>["send"] = (event) => {
    if (this.#status !== MachineStatus.Started) {
      return;
    }
    const key = event.replaces;
    const token = key ? this.#replaceTracker.claim(key) : undefined;
    queueMicrotask(() => {
      if (this.#status !== MachineStatus.Started) {
        return;
      }
      if (key && token && this.#replaceTracker.isReplaced(key, token)) {
        return;
      }
      this.#previousEvent = this.#event;
      this.#event = event;
      const current = this.#state.get();
      const { source, transitions } = findTransition(
        this.#definition,
        current,
        event.type,
      );
      const transition = this.#choose(transitions);
      if (!transition) {
        return;
      }
      this.#transition = transition;
      const target = resolveStateValue(
        this.#definition,
        transition.target ?? current,
        source,
      );
      if (target !== current) {
        this.#state.set(target);
      } else if (transition.reenter) {
        this.#state.invoke(current, current);
      } else {
        this.#action(transition.actions);
      }
    });
  };
}
