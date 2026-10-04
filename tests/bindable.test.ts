import { expect, test, vi } from "vitest";

import { createBindable } from "../src/bindable.js";

test("controlled updates use the latest external value and do not mutate it", () => {
  let value = 2;
  const changed = vi.fn();
  const cleanups: (() => void)[] = [];
  const bindable = createBindable(vi.fn(), (cleanup) => {
    cleanups.push(cleanup);
  });
  const field = bindable(() => {
    return { onChange: changed, value };
  });
  value = 10;
  field.set((previous) => {
    return previous + 1;
  });
  expect(changed).toHaveBeenCalledExactlyOnceWith(11, 10);
  expect(field.get()).toBe(10);
  field.set(10);
  expect(changed).toHaveBeenCalledTimes(1);
  for (const cleanup of cleanups) {
    cleanup();
  }
});

test("null remains a controlled initial value instead of falling back to defaultValue", () => {
  const cleanups: (() => void)[] = [];
  const bindable = createBindable(vi.fn(), (cleanup) => {
    cleanups.push(cleanup);
  });
  const field = bindable<number | null>(() => {
    return { defaultValue: 4, value: null };
  });
  expect(field.initial).toBeNull();
  expect(field.get()).toBeNull();
  for (const cleanup of cleanups) {
    cleanup();
  }
});

test("uncontrolled nested mutations notify observers until disposed", async () => {
  const notified = vi.fn();
  const cleanups: (() => void)[] = [];
  const bindable = createBindable(notified, (cleanup) => {
    cleanups.push(cleanup);
  });
  const field = bindable(() => {
    return { defaultValue: { items: [1] } };
  });
  field.get().items.push(2);
  await Promise.resolve();
  expect(notified).toHaveBeenCalledOnce();
  for (const cleanup of cleanups) {
    cleanup();
  }
  field.get().items.push(3);
  await Promise.resolve();
  expect(notified).toHaveBeenCalledOnce();
});
