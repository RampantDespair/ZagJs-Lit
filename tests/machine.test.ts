import type { PropertyDeclarations } from "lit";

import { createMachine } from "@zag-js/core";
import { html, LitElement } from "lit";
import { afterEach, expect, test, vi } from "vitest";

import { MachineController } from "../src/index.js";

type TestSchema = {
  action: "increment";
  context: { count: number };
  effect: "observe";
  event: { type: "DISABLE" | "INCREMENT" | "TOGGLE" };
  props: {
    disabled: boolean;
    getRootNode: () => Document | ShadowRoot;
    id: string;
    ids: { button?: string } | undefined;
    onStart: (button: HTMLElement | null) => void;
    onStop: () => void;
  };
  state: "active" | "idle";
};

const machine = createMachine<TestSchema>({
  context({ bindable }) {
    return {
      count: bindable(() => {
        return { defaultValue: 0 };
      }),
    };
  },
  effects: ["observe"],
  implementations: {
    actions: {
      increment({ context }) {
        context.set("count", (count) => {
          return count + 1;
        });
      },
    },
    effects: {
      observe({ prop, scope }) {
        prop("onStart")(
          scope.getById(prop("ids")?.button ?? `${scope.id}-button`),
        );
        return prop("onStop");
      },
    },
  },
  initialState() {
    return "idle";
  },
  on: {
    DISABLE: { target: "idle" },
    INCREMENT: { actions: ["increment"] },
  },
  states: {
    active: { on: { TOGGLE: { target: "idle" } } },
    idle: { on: { TOGGLE: { target: "active" } } },
  },
  watch({ prop, send, track }) {
    track(
      [
        () => {
          return prop("disabled");
        },
      ],
      () => {
        if (prop("disabled")) {
          send({ type: "DISABLE" });
        }
      },
    );
  },
});

class MachineFixture extends LitElement {
  static properties: PropertyDeclarations = {
    disabled: { type: Boolean },
    ids: { attribute: false },
    machineId: {},
  };

  readonly controller: MachineController<TestSchema>;
  declare disabled: boolean;
  declare ids: TestSchema["props"]["ids"];

  declare machineId: string;
  readonly onStart = vi.fn();
  readonly onStop = vi.fn();

  constructor() {
    super();
    this.disabled = false;
    this.machineId = "fixture";
    this.controller = new MachineController(this, machine, () => {
      return {
        disabled: this.disabled,
        getRootNode: () => {
          return this.shadowRoot ?? this.ownerDocument;
        },
        id: this.machineId,
        ids: this.ids,
        onStart: this.onStart,
        onStop: this.onStop,
      };
    });
  }

  protected render(): unknown {
    const service = this.controller.service;
    return html`
      <button
        id=${this.ids?.button ?? `${this.machineId}-button`}
        @click=${() => {
          service.send({ type: "TOGGLE" });
        }}
      >
        ${service.state.get()}
      </button>
      <output>${service.context.get("count")}</output>
    `;
  }
}

class LightMachineFixture extends MachineFixture {
  protected createRenderRoot(): this {
    return this;
  }
}

customElements.define("zag-lit-machine-fixture", MachineFixture);
customElements.define("zag-lit-light-machine-fixture", LightMachineFixture);

afterEach(() => {
  document.body.replaceChildren();
});

async function mount(light = false): Promise<MachineFixture> {
  const element = light ? new LightMachineFixture() : new MachineFixture();
  document.body.append(element);
  await element.updateComplete;
  await element.updateComplete;
  return element;
}

for (const light of [false, true]) {
  test(`effects see committed ${light ? "light" : "shadow"} DOM and start only once`, async () => {
    const element = await mount(light);
    expect(element.onStart).toHaveBeenCalledExactlyOnceWith(
      element.renderRoot.querySelector("button"),
    );
    expect(element.onStart.mock.calls[0]?.[0]).not.toBeNull();

    element.requestUpdate();
    await element.updateComplete;
    expect(element.onStart).toHaveBeenCalledTimes(1);
  });
}

test("state and context updates both render through Lit", async () => {
  const element = await mount();
  element.renderRoot.querySelector("button")?.click();
  await expect
    .poll(() => {
      return element.renderRoot.textContent;
    })
    .toContain("active");
  element.controller.service.send({ type: "INCREMENT" });
  await expect
    .poll(() => {
      return element.renderRoot.querySelector("output")?.textContent;
    })
    .toBe("1");
});

test("host-only prop changes run Zag watchers without an internal event", async () => {
  const element = await mount();
  element.controller.service.send({ type: "TOGGLE" });
  await expect
    .poll(() => {
      return element.renderRoot.textContent;
    })
    .toContain("active");
  element.disabled = true;
  await expect
    .poll(() => {
      return element.renderRoot.textContent;
    })
    .toContain("idle");
  expect(element.onStart).toHaveBeenCalledTimes(1);
});

test("disconnect cleans effects and repeated reconnects restore subscriptions", async () => {
  const element = await mount();
  for (let cycle = 1; cycle <= 3; cycle++) {
    element.remove();
    expect(element.onStop).toHaveBeenCalledTimes(cycle);
    document.body.append(element);
    await element.updateComplete;
    element.controller.service.send({ type: "INCREMENT" });
    await expect
      .poll(() => {
        return element.renderRoot.querySelector("output")?.textContent;
      })
      .toBe("1");
    element.renderRoot.querySelector("button")?.click();
    await expect
      .poll(() => {
        return element.renderRoot.textContent;
      })
      .toContain("active");
    expect(element.onStart).toHaveBeenCalledTimes(cycle + 1);
  }
});

test("new scope ids rebuild before rendering and start after the new DOM commits", async () => {
  const element = await mount();
  element.machineId = "changed";
  await element.updateComplete;
  expect(element.controller.service.scope.id).toBe("changed");
  expect(element.onStart).toHaveBeenLastCalledWith(
    element.renderRoot.querySelector("#changed-button"),
  );
  expect(element.onStop).toHaveBeenCalledTimes(1);

  element.ids = { button: "custom-button" };
  await element.updateComplete;
  expect(element.onStart).toHaveBeenLastCalledWith(
    element.renderRoot.querySelector("#custom-button"),
  );
  expect(element.onStart).toHaveBeenCalledTimes(3);
});

test("updates while detached do not restart machine effects", async () => {
  const element = await mount();
  element.remove();
  element.disabled = true;
  await element.updateComplete;
  expect(element.onStart).toHaveBeenCalledTimes(1);
  expect(element.onStop).toHaveBeenCalledTimes(1);
});
