import { types, selectors } from "@nexusmods/vortex-api";

import { openGroupEditor } from "./actions";
import { registerGroupColumns } from "./groups/columns";
import GroupEditor from "./groups/GroupEditor";
import { groupsReducer, sessionReducer } from "./groups/reducers";
import { exportLoadOrder } from "./openmw/exportLoadOrder";
import { importLoadOrder } from "./openmw/importLoadOrder";
import OpenMWPage from "./openmw/OpenMWPage";
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

  // The load order is also imported when Vortex starts, without any notifications
  context.once(() => {
    void importLoadOrder(context.api, MORROWIND_ID, { silent: true });
  });

  // Button in the toolbar of the OpenMW page
  context.registerAction(
    "openmw-icons",
    100,
    "import",
    {},
    "Import Load Order",
    () => {
      void importLoadOrder(context.api, MORROWIND_ID);
    },
  );

  // Button in the toolbar of the OpenMW page, writes the load order to launcher.cfg
  context.registerAction(
    "openmw-icons",
    110,
    // Vortex has no "export" icon, "deploy" is the one that means writing the result out
    "deploy",
    {},
    "Export Load List",
    () => {
      void exportLoadOrder(context.api);
    },
  );

  // The "OpenMW" page, a tab of its own that uses the icon of the Plugins page.
  context.registerMainPage("plugins", "OpenMW", OpenMWPage, {
    id: "openmw-plugins-page",
    group: "per-game",
    priority: 35,
    visible: () => selectors.activeGameId(context.api.getState()) === MORROWIND_ID,
    props: () => ({ gameId: MORROWIND_ID }),
  });

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
