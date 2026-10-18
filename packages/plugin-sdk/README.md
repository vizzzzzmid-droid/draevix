# Draevix Plugin SDK

Build plugins that extend both the Draevix server and the Draevix web client from a single package.

- `src/index.ts` — server-side entry: router extensions, hooks (`beforeMessageSave`, `beforeFileSave`, …), permissions, activities.
- `src/client.ts` — client-side entry: UI slots (top bar, message actions, user popover, settings, …), plugin commands.

A complete working example lives in the e2e fixtures: [`packages/e2e/tests/fixtures/plugins/e2e-plugin`](../e2e/tests/fixtures/plugins/e2e-plugin) (see its `manifest.json`, `package.json`, `server/index.js` and `client/index.js`). The end-to-end suite in `packages/e2e` exercises it, so it is guaranteed to stay loadable.

Type contracts shared between host and plugins live in `@draevix/shared` (`PluginSlot`, command payloads, file hooks).
