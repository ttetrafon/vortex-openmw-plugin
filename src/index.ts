import { types, selectors } from "@nexusmods/vortex-api";

import { openGroupEditor } from "./actions";
import { registerGroupColumns } from "./groups/columns";
import GroupEditor from "./groups/GroupEditor";
import { groupsReducer, sessionReducer } from "./groups/reducers";
import PluginEditor from "./plugins/PluginEditor";
import { registerPluginColumn } from "./plugins/column";
import reducer from "./reducers";
import Settings from "./Settings";

const SETTINGS_KEY = "openmw";
const MORROWIND_ID = "morrowind";

function init(context: types.IExtensionContext) {
  context.registerReducer(["settings", SETTINGS_KEY], reducer);

  // Own "OpenMW" tab on the Settings page, only while Morrowind is the active game.
  context.registerSettings(
    "OpenMW",
    Settings,
    () => ({ api: context.api }),
    () => selectors.activeGameId(context.api.getState()) === MORROWIND_ID,
    150,
  );

  context.registerReducer(["persistent", SETTINGS_KEY], groupsReducer);
  context.registerReducer(["session", SETTINGS_KEY], sessionReducer);

  context.registerDialog("openmw-group-editor", GroupEditor);
  registerGroupColumns(context, MORROWIND_ID);

  context.registerDialog("openmw-plugin-editor", PluginEditor, () => ({ gameId: MORROWIND_ID }));
  registerPluginColumn(context, MORROWIND_ID);

  // Button in the Mods page toolbar ("..." menu), only while Morrowind is the active game.
  context.registerAction(
    "mod-icons",
    95,
    "groups",
    {},
    "Manage Groups",
    () => {
      context.api.store?.dispatch(openGroupEditor(true) as any);
    },
    () => selectors.activeGameId(context.api.getState()) === MORROWIND_ID,
  );
}

module.exports = {
  default: init
};
