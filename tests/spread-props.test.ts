import type { Attrs } from "../src/index.js";

import { html, LitElement, render } from "lit";
import { afterEach, expect, test, vi } from "vitest";

import {
  mergeProps,
  normalizeProps,
  spread,
  spreadProps,
} from "../src/index.js";

class SpreadFixture extends LitElement {
  attrs: Attrs = {};

  protected render(): unknown {
    return html`<button ${spread(this.attrs)}>go</button>`;
  }
}

customElements.define("zag-lit-spread-fixture", SpreadFixture);

afterEach(() => {
  document.body.replaceChildren();
});

async function mount(attrs: Attrs): Promise<SpreadFixture> {
  const element = new SpreadFixture();
  element.attrs = attrs;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

function button(element: SpreadFixture): HTMLButtonElement {
  const control = element.renderRoot.querySelector("button");
  if (control === null) {
    throw new Error("Missing button");
  }
  return control;
}

test("normalizes DOM props and composes event handlers", async () => {
  const first = vi.fn();
  const second = vi.fn();
  const element = await mount(
    normalizeProps.button(
      mergeProps(
        { "aria-label": "Advance", "aria-pressed": false, onClick: first },
        { className: "action", onClick: second },
      ),
    ),
  );
  const control = button(element);
  control.click();
  expect(control.getAttribute("aria-label")).toBe("Advance");
  expect(control.getAttribute("aria-pressed")).toBe("false");
  expect(control.className).toBe("action");
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
});

test("rerender removes stale attributes and replaces listeners", async () => {
  const first = vi.fn();
  const second = vi.fn();
  const element = await mount({ "data-state": "ready", onClick: first });
  const control = button(element);
  control.click();

  element.attrs = { disabled: true, onClick: second };
  element.requestUpdate();
  await element.updateComplete;
  expect(control.hasAttribute("data-state")).toBe(false);
  expect(control.disabled).toBe(true);

  element.attrs = { disabled: false, onClick: second };
  element.requestUpdate();
  await element.updateComplete;
  control.click();
  expect(control.disabled).toBe(false);
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
});

test("disconnect removes listeners and reconnect binds them once", async () => {
  const onClick = vi.fn();
  const element = await mount({ onClick });
  const control = button(element);

  element.remove();
  control.click();
  expect(onClick).not.toHaveBeenCalled();

  document.body.append(element);
  await element.updateComplete;
  control.click();
  expect(onClick).toHaveBeenCalledOnce();
});

test("SVG attributes and classes retain the correct spelling", () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const cleanup = spreadProps(
    svg,
    normalizeProps.svg({
      className: "icon",
      fillRule: "evenodd",
      strokeWidth: 2,
      viewBox: "0 0 24 24",
    }),
  );
  expect(svg.getAttribute("class")).toBe("icon");
  expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
  expect(svg.getAttribute("stroke-width")).toBe("2");
  expect(svg.getAttribute("fill-rule")).toBe("evenodd");
  cleanup();
});

test("boolean attributes, enumerated attributes and live input properties reconcile", () => {
  const input = document.createElement("input");
  spreadProps(
    input,
    normalizeProps.input({
      "aria-invalid": false,
      checked: true,
      "data-active": false,
      disabled: true,
      spellCheck: false,
      style: { "--size": "2px", backgroundColor: "red", color: undefined },
      value: "first",
    }),
  );
  expect(input.value).toBe("first");
  expect(input.checked).toBe(true);
  expect(input.disabled).toBe(true);
  expect(input.getAttribute("spellcheck")).toBe("false");
  expect(input.getAttribute("aria-invalid")).toBe("false");
  expect(input.getAttribute("data-active")).toBe("false");
  expect(input.style.backgroundColor).toBe("red");
  expect(input.style.getPropertyValue("--size")).toBe("2px");
  const cleanup = spreadProps(input, {});
  expect(input.value).toBe("");
  expect(input.checked).toBe(false);
  expect(input.disabled).toBe(false);
  expect(input.getAttribute("style")).toBeNull();
  cleanup();
});

test("stale cleanup and independent machine bindings cannot remove current listeners", () => {
  const node = document.createElement("button");
  const old = vi.fn();
  const current = vi.fn();
  const second = vi.fn();
  const staleCleanup = spreadProps(node, { onClick: old }, "first");
  const currentCleanup = spreadProps(node, { onClick: current }, "first");
  const secondCleanup = spreadProps(node, { onClick: second }, "second");
  staleCleanup();
  node.click();
  expect(old).not.toHaveBeenCalled();
  expect(current).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  currentCleanup();
  node.click();
  expect(current).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledTimes(2);
  secondCleanup();
});

test("unchanged props restore live input properties after user edits", () => {
  const input = document.createElement("input");
  const attrs = { checked: true, indeterminate: true, value: "controlled" };
  spreadProps(input, attrs);
  input.value = "edited";
  input.checked = false;
  input.indeterminate = false;
  const cleanup = spreadProps(input, attrs);
  expect(input.value).toBe("controlled");
  expect(input.checked).toBe(true);
  expect(input.indeterminate).toBe(true);
  cleanup();
});

test("object styles preserve positioning variables and remove only owned properties", () => {
  const node = document.createElement("div");
  const style = { color: "red" };
  spreadProps(node, normalizeProps.element({ style }));
  node.style.setProperty("--x", "24px");
  node.style.setProperty("--layer-index", "2");
  style.color = "blue";
  spreadProps(
    node,
    normalizeProps.element(mergeProps({ style }, { style: { opacity: 0.5 } })),
  );
  expect(node.style.color).toBe("blue");
  expect(node.style.opacity).toBe("0.5");
  expect(node.style.getPropertyValue("--x")).toBe("24px");
  const cleanup = spreadProps(node, {});
  expect(node.style.color).toBe("");
  expect(node.style.opacity).toBe("");
  expect(node.style.getPropertyValue("--x")).toBe("24px");
  expect(node.style.getPropertyValue("--layer-index")).toBe("2");
  cleanup();
});

test("style snapshots reconcile an object mutated between renders", () => {
  const node = document.createElement("div");
  const style: Record<string, unknown> = {
    backgroundColor: "red",
    color: "blue",
  };
  spreadProps(node, { style });
  delete style.color;
  style.backgroundColor = "green";
  const cleanup = spreadProps(node, { style });
  expect(node.style.color).toBe("");
  expect(node.style.backgroundColor).toBe("green");
  cleanup();
});

test("string styles replace the attribute and can switch back to object styles", () => {
  const node = document.createElement("div");
  node.style.setProperty("--external", "1");
  spreadProps(node, { style: "color:red;background-color:blue" });
  expect(node.style.getPropertyValue("--external")).toBe("");
  spreadProps(node, { style: { color: "green" } });
  expect(node.style.color).toBe("green");
  expect(node.style.backgroundColor).toBe("");
  spreadProps(node, { style: "color:blue" });
  const cleanup = spreadProps(node, {});
  expect(node.getAttribute("style")).toBeNull();
  cleanup();
});

test("detached updates remove stale props without reconnecting listeners", async () => {
  const first = vi.fn();
  const second = vi.fn();
  const element = await mount({ "data-state": "ready", onClick: first });
  const control = button(element);
  element.remove();
  element.attrs = { onClick: second };
  element.requestUpdate();
  await element.updateComplete;
  control.click();
  expect(first).not.toHaveBeenCalled();
  expect(second).not.toHaveBeenCalled();
  expect(control.hasAttribute("data-state")).toBe(false);
  document.body.append(element);
  await element.updateComplete;
  control.click();
  expect(second).toHaveBeenCalledOnce();
});

test("a directive first rendered while disconnected waits to attach listeners", () => {
  const onClick = vi.fn();
  const container = document.createElement("div");
  const part = render(
    html`<button ${spread({ onClick })}>go</button>`,
    container,
    {
      isConnected: false,
    },
  );
  const control = container.querySelector("button");
  control?.click();
  expect(onClick).not.toHaveBeenCalled();
  part.setConnected(true);
  control?.click();
  expect(onClick).toHaveBeenCalledOnce();
  render(html``, container);
  control?.click();
  expect(onClick).toHaveBeenCalledOnce();
});

test("independent scopes retain a shared callback when one scope is disposed", () => {
  const node = document.createElement("button");
  const callback = vi.fn();
  const firstCleanup = spreadProps(node, { onClick: callback }, "first");
  const secondCleanup = spreadProps(node, { onClick: callback }, "second");
  firstCleanup();
  node.click();
  expect(callback).toHaveBeenCalledOnce();
  secondCleanup();
  node.click();
  expect(callback).toHaveBeenCalledOnce();
});

test("multiple spread directives keep independent listeners on one element", () => {
  const first = vi.fn();
  const second = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const part = render(
    html`<button ${spread({ onClick: first })} ${spread({ onClick: second })}>
      go
    </button>`,
    container,
  );
  const control = container.querySelector("button");
  control?.click();
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  part.setConnected(false);
  control?.click();
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
});
