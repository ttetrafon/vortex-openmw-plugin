import { types, util, selectors } from "@nexusmods/vortex-api";

function init(context: types.IExtensionContext) {
  // Called when the extension is loaded.
  // Register your features here.

  context.once(() => {
    // Called after all extensions have been loaded.
    // Safe to interact with other extensions here.
  });
}

module.exports = {
  default: init
};