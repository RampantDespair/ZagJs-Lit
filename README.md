# zagjs-lit

A community-maintained Lit framework adapter for Zag state machines with its own
runtime and DOM bindings. This is an independent project, not an official Chakra UI package.
Consumers supply their own templates, styles, and choice of light or shadow DOM.

## API

| Export              | Purpose                                                                  |
| ------------------- | ------------------------------------------------------------------------ |
| `MachineController` | Connect a Zag machine to a Lit host's lifecycle and updates.             |
| `SchemaOf`          | Extract the schema type from a Zag machine type.                         |
| `Attrs`             | Record type for normalized DOM props passed to the binding helpers.      |
| `normalizeProps`    | DOM prop normalizer for Zag `connect()` calls.                           |
| `spread`            | Lit element directive applying normalized props with disconnect cleanup. |
| `spreadProps`       | Imperative DOM prop binding helper with listener cleanup.                |
| `mergeProps`        | Zag's prop, style, and event-handler composition.                        |
| `toStyleString`     | Serialize a style object when a string is explicitly needed.             |

## Usage

Install the adapter, Lit, and the Zag machines your application uses. This
package is tested against Zag 1.44.0 and Lit 3.3.3. Dependency ranges
allow compatible Zag 1.x and Lit 3.x releases; upgrades still need validation.
When working from source, run `npm run build` before importing through the package
entry point.

```sh
npm install zagjs-lit lit @zag-js/checkbox
```

```ts
import * as checkbox from "@zag-js/checkbox";
import { html, LitElement } from "lit";
import { MachineController, normalizeProps, spread } from "zagjs-lit";

class ExampleCheckbox extends LitElement {
  private machine = new MachineController(this, checkbox.machine, () => {
    return {
      id: this.id,
      name: "accepted",
      getRootNode: () => this.ownerDocument,
    };
  });

  protected createRenderRoot(): this {
    return this;
  }

  protected render() {
    const api = checkbox.connect(this.machine.service, normalizeProps);
    return html`
      <label ${spread(api.getRootProps())}>
        <span ${spread(api.getLabelProps())}>Accept</span>
        <div ${spread(api.getControlProps())}></div>
        <input ${spread(api.getHiddenInputProps())} />
      </label>
    `;
  }
}

customElements.define("example-checkbox", ExampleCheckbox);
```

Give each instance a unique ID, for example
`<example-checkbox id="terms"></example-checkbox>`. This example uses light DOM
so the input participates in an enclosing form. For a shadow-root template,
retain Lit's default render root and pass `getRootNode: () => this.shadowRoot!`.
External form integration remains the consumer's responsibility.

The props callback is live. Reactive host properties trigger updates normally;
after changing nonreactive state, call the host's `requestUpdate()`. Initialize
properties used by the callback before constructing the controller. Keep the
`ids` object reference stable unless intentionally changing the machine scope.

Pass normalized props to `spread()` or `spreadProps()`. Style objects are patched
property by property so updates preserve CSS variables written by Zag's positioning
and layering effects. A style string replaces the entire style attribute. Use
`mergeProps()` to combine props that own the same attributes or styles before
passing them to a binding.

`spreadProps(element, props, machineId?)` returns a listener cleanup function;
call it when disposing the binding. Successive calls with the same element and
machine ID reconcile the existing props. Cleanup leaves DOM attributes in place.
The `spread()` directive handles listener cleanup and reconnection automatically,
including updates made while its Lit host is detached.

## Lifecycle and compatibility

The controller creates the service before rendering and starts effects after
Lit commits the DOM. State and context changes request host updates. Host updates
notify Zag prop watchers, including changes that produce no internal machine event.
Queued events carrying the same `replaces` key retain only the latest pending
event, matching Zag's runtime behavior.

Disconnect stops effects and subscriptions. Reconnect creates a fresh machine:
controlled values come from the props callback, while uncontrolled state resets.
Changing `id` or the `ids` object also rebuilds the machine. Use a `getRootNode`
callback that resolves the current root; changing the callback itself does not
rebuild the machine. Do not cache the service across reconnects or scope changes.

The adapter owns its runtime, bindables, refs, dependency tracking, normalization,
and DOM reconciliation. The controller refreshes prop watchers against the live
props callback. The adapter depends on the public `@zag-js/core`, `@zag-js/store`,
`@zag-js/types`, and `@zag-js/utils` packages.

The runtime is implemented in `machine.ts`, `bindable.ts`, `refs.ts`, and
`track.ts`. The `machine-controller.ts` module supplies Lit lifecycle integration;
normalization, merging, and spreading live in their own modules. Consumers provide
components, styles, and custom-element registration. Upstream-derived code is
attributed in [LICENSE](./LICENSE).
