import { createMachine, MachineStatus } from "@zag-js/core";
import { expect, test, vi } from "vitest";

import { LitMachine } from "../src/machine.js";

test("replacement keys discard older queued events without dropping unrelated events", async () => {
  type EventSchema = {
    action: "record";
    event: { type: "UPDATE"; value: number };
    state: "idle";
  };
  const values: number[] = [];
  const definition = createMachine<EventSchema>({
    implementations: {
      actions: {
        record({ event }) {
          values.push(event.value);
        },
      },
    },
    initialState() {
      return "idle";
    },
    states: { idle: { on: { UPDATE: { actions: ["record"] } } } },
  });
  const runtime = new LitMachine(definition, () => {
    return {};
  });
  runtime.start();
  runtime.service.send({ replaces: "position", type: "UPDATE", value: 1 });
  runtime.service.send({ replaces: "size", type: "UPDATE", value: 2 });
  runtime.service.send({ type: "UPDATE", value: 3 });
  runtime.service.send({ replaces: "position", type: "UPDATE", value: 4 });
  await Promise.resolve();
  expect(values).toEqual([2, 3, 4]);
  expect(runtime.service.event.previous()).toMatchObject({ value: 3 });

  runtime.service.send({ replaces: "position", type: "UPDATE", value: 5 });
  await Promise.resolve();
  expect(values).toEqual([2, 3, 4, 5]);
  runtime.service.send({ replaces: "position", type: "UPDATE", value: 6 });
  runtime.stop();
  await Promise.resolve();
  expect(values).toEqual([2, 3, 4, 5]);
});

type Schema = {
  action:
    "firstEntry" | "idleExit" | "openEntry" | "secondEntry" | "transition";
  computed: { double: number };
  context: { count: number };
  effect: "first" | "root" | "second";
  event: { type: "CLOSE" | "NEXT" | "OPEN" | "RESET" };
  guard: "allowed";
  props: { allow: boolean };
  refs: { token: number };
  state: "idle" | "open.first" | "open.second" | "open";
  tag: "expanded";
};

function setup() {
  const log: string[] = [];
  const disposed = vi.fn();
  let allow = true;
  const machine = createMachine<Schema>({
    computed: {
      double: ({ context }) => {
        return context.get("count") * 2;
      },
    },
    context({ bindable }) {
      bindable.cleanup(disposed);
      return {
        count: bindable(() => {
          return { defaultValue: 0 };
        }),
      };
    },
    effects: ["root"],
    implementations: {
      actions: {
        firstEntry: () => {
          log.push("first:entry");
        },
        idleExit: () => {
          log.push("idle:exit");
        },
        openEntry: () => {
          log.push("open:entry");
        },
        secondEntry: () => {
          log.push("second:entry");
        },
        transition: ({ context }) => {
          log.push("transition");
          context.set("count", (value) => {
            return value + 1;
          });
        },
      },
      effects: {
        first: () => {
          log.push("first:start");
          return () => {
            log.push("first:stop");
          };
        },
        root: () => {
          log.push("root:start");
          return () => {
            log.push("root:stop");
          };
        },
        second: () => {
          log.push("second:start");
          return () => {
            log.push("second:stop");
          };
        },
      },
      guards: {
        allowed: ({ prop }) => {
          return prop("allow");
        },
      },
    },
    initialState: () => {
      return "idle";
    },
    refs: () => {
      return { token: 7 };
    },
    states: {
      idle: {
        exit: ["idleExit"],
        on: {
          OPEN: { actions: ["transition"], guard: "allowed", target: "open" },
        },
      },
      open: {
        entry: ["openEntry"],
        initial: "first",
        on: { CLOSE: { target: "idle" } },
        states: {
          first: {
            effects: ["first"],
            entry: ["firstEntry"],
            on: {
              NEXT: { actions: ["transition"], target: "second" },
              RESET: { reenter: true, target: "open.first" },
            },
          },
          second: { effects: ["second"], entry: ["secondEntry"] },
        },
        tags: ["expanded"],
      },
    },
  });
  const runtime = new LitMachine(machine, () => {
    return { allow };
  });
  const send = async (type: Schema["event"]["type"]) => {
    runtime.service.send({ type });
    await Promise.resolve();
    await Promise.resolve();
  };
  return {
    disposed,
    log,
    runtime,
    send,
    setAllow: (next: boolean) => {
      allow = next;
    },
  };
}

test("nested states preserve transition order, ancestor events, tags, refs and computed values", async () => {
  const { log, runtime, send } = setup();
  runtime.start();
  log.length = 0;
  await send("OPEN");
  expect(log).toEqual([
    "idle:exit",
    "transition",
    "first:start",
    "open:entry",
    "first:entry",
  ]);
  expect(runtime.service.state.get()).toBe("open.first");
  expect(runtime.service.state.matches("open")).toBe(true);
  expect(runtime.service.state.hasTag("expanded")).toBe(true);
  expect(runtime.service.computed("double")).toBe(2);
  runtime.service.refs.set("token", 9);
  expect(runtime.service.refs.get("token")).toBe(9);

  log.length = 0;
  await send("NEXT");
  expect(log).toEqual([
    "first:stop",
    "transition",
    "second:start",
    "second:entry",
  ]);
  expect(runtime.service.event.current().type).toBe("NEXT");
  expect(runtime.service.event.previous().type).toBe("OPEN");
  await send("CLOSE");
  expect(runtime.service.state.get()).toBe("idle");
  expect(log).toContain("second:stop");
  runtime.stop();
});

test("guards read current props and reenter follows Zag's active state chain", async () => {
  const { log, runtime, send, setAllow } = setup();
  runtime.start();
  setAllow(false);
  await send("OPEN");
  expect(runtime.service.state.get()).toBe("idle");
  setAllow(true);
  await send("OPEN");
  log.length = 0;
  await send("RESET");
  expect(log).toEqual([
    "first:stop",
    "first:start",
    "open:entry",
    "first:entry",
  ]);
  runtime.stop();
});

test("stop cancels queued transitions and disposes effects and bindables exactly once", async () => {
  const { disposed, log, runtime } = setup();
  const changed = vi.fn();
  runtime.subscribe(changed);
  runtime.start();
  runtime.start();
  runtime.service.send({ type: "OPEN" });
  runtime.stop();
  runtime.stop();
  await Promise.resolve();
  expect(log).toEqual(["root:start", "root:stop"]);
  expect(disposed).toHaveBeenCalledOnce();
  expect(changed).not.toHaveBeenCalled();
  expect(runtime.service.getStatus()).toBe(MachineStatus.Stopped);
});
