import { types, selectors } from "@nexusmods/vortex-api";

import reducer from "./reducers";
import Settings from "./Settings";

const SETTINGS_KEY = "openmw";
const MORROWIND_ID = "morrowind";

function init(context: types.IExtensionContext) {
  context.registerReducer(["settings", SETTINGS_KEY], reducer);

  // Shown in the "Mods" tab of the Settings page, only while Morrowind is the active game.
  context.registerSettings(
    "Mods",
    Settings,
    undefined,
    () => selectors.activeGameId(context.api.getState()) === MORROWIND_ID,
    150,
  );
}

module.exports = {
  default: init
};
