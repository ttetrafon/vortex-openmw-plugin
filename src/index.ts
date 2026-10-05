import { types, util, selectors } from "@nexusmods/vortex-api";
import { Promise } from "bluebird";
import path from "path";

const CATEGORIES = [
  { id: 'mw-environment', name: 'Environment', folder: 'Environment' },
  { id: 'mw-creatures', name: 'Creatures', folder: 'Creatures' },
  { id: 'mw-quests', name: 'Quests', folder: 'Quests' },
];

function init(context: types.IExtensionContext) {
  const externalRoot = 'D:\\OneDrive\\Documents\\My Games\\OpenMW\\mods';

  CATEGORIES.forEach((cat, i) => {
    context.registerModType(
      cat.id,
      100 + i,
      (gameId) => gameId === 'morrowind',
      () => path.join(externalRoot, cat.folder),
      () => Promise.resolve(false),
      { name: cat.name }
    );
  });
}

module.exports = {
  default: init
};
