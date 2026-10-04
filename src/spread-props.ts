import type { ElementPart, PartInfo } from "lit/directive.js";

import { noChange } from "lit";
import { AsyncDirective } from "lit/async-directive.js";
import { directive, PartType } from "lit/directive.js";

export type Attrs = Record<string, unknown>;

type Binding = {
  attrs: Attrs;
  listeners: Map<string, EventListener>;
};

const bindings = new WeakMap<Element, Map<string, Binding>>();
const properties = new Set(["checked", "indeterminate", "selected", "value"]);
const enumerated = new Set(["contenteditable", "draggable", "spellcheck"]);

function eventName(key: string): string | undefined {
  return key.startsWith("on") ? key.slice(2).toLowerCase() : undefined;
}

function styleObject(value: unknown): Attrs {
  return value !== null && typeof value === "object" ? (value as Attrs) : {};
}

function cssName(key: string): string {
  return key.startsWith("--")
    ? key
    : key.replace(/[A-Z]/g, (letter) => {
        return `-${letter.toLowerCase()}`;
      });
}

function assignStyle(node: Element, previous: unknown, value: unknown): void {
  // String styles own the entire attribute. Objects own individual properties.
  if (typeof value === "string") {
    if (previous !== value) {
      node.setAttribute("style", value);
    }
    return;
  }
  if (typeof previous === "string") {
    node.removeAttribute("style");
  }
  const style = (node as { style?: CSSStyleDeclaration } & Element).style;
  if (!style) {
    return;
  }
  const before = styleObject(previous);
  const after = styleObject(value);
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const next = after[key];
    if (typeof next === "string" || typeof next === "number") {
      if (before[key] !== next) {
        style.setProperty(cssName(key), String(next));
      }
    } else {
      style.removeProperty(cssName(key));
    }
  }
  if (node.getAttribute("style") === "") {
    node.removeAttribute("style");
  }
}

function assign(node: Element, key: string, value: unknown): void {
  if (
    typeof value === "boolean" &&
    !key.startsWith("aria-") &&
    !key.startsWith("data-") &&
    !enumerated.has(key)
  ) {
    node.toggleAttribute(key, value);
  } else if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    node.setAttribute(key, String(value));
  } else {
    node.removeAttribute(key);
  }
}

function clearListeners(node: Element, binding: Binding): void {
  for (const [key, callback] of binding.listeners) {
    node.removeEventListener(key.slice(2).toLowerCase(), callback);
  }
  binding.listeners.clear();
}

function reconcile(
  node: Element,
  binding: Binding,
  attrs: Attrs,
  connected = true,
): void {
  const previous = binding.attrs;
  const current = { ...attrs };
  if (current.style !== null && typeof current.style === "object") {
    current.style = { ...styleObject(current.style) };
  }
  for (const key of new Set([
    ...Object.keys(previous),
    ...Object.keys(current),
  ])) {
    const oldValue = previous[key];
    const value = current[key];
    const event = eventName(key);
    if (event !== undefined) {
      const oldListener = binding.listeners.get(key);
      if (connected && oldValue === value && oldListener) {
        continue;
      }
      if (oldListener) {
        node.removeEventListener(event, oldListener);
        binding.listeners.delete(key);
      }
      if (connected && typeof value === "function") {
        // Each binding owns its listener, even when scopes share a callback.
        const callback: EventListener = (eventObject) => {
          (value as EventListener).call(node, eventObject);
        };
        node.addEventListener(event, callback);
        binding.listeners.set(key, callback);
      }
    } else if (key === "style") {
      assignStyle(node, oldValue, value);
    } else if (properties.has(key)) {
      const next =
        key === "value"
          ? typeof value === "number"
            ? String(value)
            : (value ?? "")
          : Boolean(value);
      // The browser can change these without changing the previous props.
      if (Reflect.get(node, key) !== next) {
        Reflect.set(node, key, next);
      }
    } else if (oldValue !== value) {
      assign(node, key, value);
    }
  }
  binding.attrs = current;
}

/** Reconcile normalized Zag props, keeping independent bindings per machine. */
export function spreadProps(
  node: Element,
  attrs: Attrs,
  machineId = "default",
): () => void {
  let scopes = bindings.get(node);
  if (!scopes) {
    scopes = new Map();
    bindings.set(node, scopes);
  }
  const binding = scopes.get(machineId) ?? { attrs: {}, listeners: new Map() };
  reconcile(node, binding, attrs);
  scopes.set(machineId, binding);
  const current = binding.attrs;

  return () => {
    const active = bindings.get(node);
    // A cleanup from an older render must not remove a newer binding.
    if (active?.get(machineId) !== binding || binding.attrs !== current) {
      return;
    }
    clearListeners(node, binding);
    active.delete(machineId);
    if (active.size === 0) {
      bindings.delete(node);
    }
  };
}

class SpreadDirective extends AsyncDirective {
  readonly #binding: Binding = { attrs: {}, listeners: new Map() };
  #element?: Element;

  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.ELEMENT) {
      throw new Error(
        "spread() must be used in an element position, not an attribute or text",
      );
    }
  }

  render(_props: Attrs): typeof noChange {
    return noChange;
  }

  override update(part: ElementPart, [props]: [Attrs]): typeof noChange {
    this.#element = part.element;
    reconcile(part.element, this.#binding, props, this.isConnected);
    return noChange;
  }

  protected override disconnected(): void {
    if (this.#element !== undefined) {
      clearListeners(this.#element, this.#binding);
    }
  }

  protected override reconnected(): void {
    if (this.#element !== undefined) {
      reconcile(this.#element, this.#binding, this.#binding.attrs);
    }
  }
}

export const spread = directive(SpreadDirective);
