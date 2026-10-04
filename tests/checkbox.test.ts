import type { SchemaOf } from "../src/index.js";
import type { PropertyDeclarations } from "lit";

import * as checkbox from "@zag-js/checkbox";
import { html, LitElement } from "lit";
import { afterEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";

import { MachineController, normalizeProps, spread } from "../src/index.js";

// A consumer fixture, not a component exported by the adapter.
class CheckboxFixture extends LitElement {
  static properties: PropertyDeclarations = {
    checked: { type: Boolean },
    disabled: { type: Boolean },
  };

  declare checked: boolean;
  readonly controller: MachineController<SchemaOf<checkbox.Machine>>;

  declare disabled: boolean;

  constructor() {
    super();
    this.checked = false;
    this.disabled = false;
    this.controller = new MachineController(this, checkbox.machine, () => {
      return {
        checked: this.checked,
        disabled: this.disabled,
        getRootNode: () => {
          return this.ownerDocument;
        },
        id: "consumer-checkbox",
        name: "accepted",
        onCheckedChange: ({ checked }) => {
          this.checked = checked === true;
        },
      };
    });
  }

  protected createRenderRoot(): this {
    return this;
  }

  protected render(): unknown {
    const api = checkbox.connect(this.controller.service, normalizeProps);
    return html`
      <label ${spread(api.getRootProps())}>
        <span ${spread(api.getLabelProps())}>Accept</span>
        <div ${spread(api.getControlProps())}></div>
        <input ${spread(api.getHiddenInputProps())} />
      </label>
    `;
  }
}

customElements.define("zag-lit-checkbox-fixture", CheckboxFixture);

afterEach(() => {
  document.body.replaceChildren();
});

test("a real Zag checkbox supports user changes and external form submission", async () => {
  const form = document.createElement("form");
  const element = new CheckboxFixture();
  form.append(element);
  document.body.append(form);
  await element.updateComplete;

  const control = element.querySelector<HTMLElement>("[data-part='label']");
  if (control === null) {
    throw new Error("Missing checkbox control");
  }
  await userEvent.click(control);
  await expect
    .poll(() => {
      return new FormData(form).get("accepted");
    })
    .toBe("on");
  expect(element.checked).toBe(true);

  element.checked = false;
  await expect
    .poll(() => {
      return element.querySelector("input")?.checked;
    })
    .toBe(false);
  expect(new FormData(form).has("accepted")).toBe(false);

  element.checked = true;
  element.disabled = true;
  await element.updateComplete;
  expect(element.querySelector("input")?.disabled).toBe(true);
  expect(new FormData(form).has("accepted")).toBe(false);
});
