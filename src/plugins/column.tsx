import { selectors, tooltip, types } from "@nexusmods/vortex-api";
import path from "path";

import { openPluginEditor } from "../actions";
import { forgetMod, getCachedPlugins, markAllStale, scanMod } from "./scan";

const VIconButton = tooltip.IconButton as any;

interface IModRow {
  id: string;
  state?: string;
  installationPath?: string;
}

/** Adds the "Plugins" column to the mods table of the given game. */
export function registerPluginColumn(context: types.IExtensionContext, gameId: string) {
  const stagingFolder = (mod: IModRow): string | undefined => {
    if (mod.installationPath === undefined) return undefined;
    const base = selectors.installPathForGame(context.api.getState(), gameId);
    return base !== undefined ? path.join(base, mod.installationPath) : undefined;
  };

  context.once(() => {
    // the files of a mod change when it is installed again
    context.api.events.on("did-install-mod", (installedGame: string, _archiveId: string, modId: string) => {
      if (installedGame === gameId) forgetMod(modId);
    });
    // files can be removed from or added to the staging folders, the next deployment applies that
    const rescan = () => {
      if (selectors.activeGameId(context.api.getState()) === gameId) markAllStale();
    };
    context.api.events.on("did-deploy", rescan);
    context.api.events.on("did-purge", rescan);
  });

  context.registerTableAttribute("mods", {
    id: "openmw-plugins",
    name: "Plugins",
    description: "OpenMW plugin files of the mod",
    icon: "plugins",
    placement: "table",
    position: 125,
    condition: () => selectors.activeGameId(context.api.getState()) === gameId,
    isToggleable: true,
    isSortable: true,
    // the number of plugin files, found by looking into the staging folder. The cell is redrawn
    // when this arrives, which is when the button can use the files.
    calc: (mod: IModRow): number | Promise<number> => {
      const dir = stagingFolder(mod);
      return dir === undefined ? 0 : scanMod(mod.id, dir).then((plugins) => plugins.length);
    },
    customRenderer: (mod: IModRow, _detail: boolean, t: (s: string) => string) => {
      // no button at all for mods without plugin files (or until the scan has found some)
      if ((getCachedPlugins(mod.id) ?? []).length < 2) {
        return <></>;
      }
      return (
        <VIconButton
          id={`openmw-plugins-${mod.id}`}
          className="btn-embed"
          icon="plugins"
          tooltip={t("Sort plugins of this mod")}
          onClick={() => context.api.store?.dispatch(openPluginEditor(mod.id) as any)}
        />
      );
    },
    edit: {},
  } as types.ITableAttribute);
}
