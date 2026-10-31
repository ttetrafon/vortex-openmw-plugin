/**
 * Master files (.esm) are taken out of their group and listed right after the External section,
 * which is where they are exported too. Only the .esm files, the other plugins of the same mods
 * (.esp, .omwaddon, .omwscripts) stay in their group.
 */
export const isMaster = (plugin: string): boolean => plugin.toLowerCase().endsWith(".esm");
