import { Modal, types, util } from "@nexusmods/vortex-api";
import React from "react";
import { Button } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";

import { openPluginEditor, setPluginRules } from "../actions";
import GroupGraph from "../groups/GroupGraph";
import type { ISubgroup } from "../groups/reducers";
import { defaultPluginRules, getCachedPlugins, pluginBaseName } from "./scan";

const VModal = Modal as any;

interface IProps {
  gameId: string;
}

function PluginEditor(props: IProps) {
  const { gameId } = props;
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const modId: string | undefined = useSelector(
    (s: types.IState) => (s.session as any).openmw?.pluginEditorMod,
  );
  const mod: any = useSelector((s: types.IState) =>
    modId !== undefined ? util.getSafe(s, ["persistent", "mods", gameId, modId], undefined) : undefined,
  );
  const stored: { [plugin: string]: string[] } | undefined = useSelector((s: types.IState) =>
    modId !== undefined ? (s.persistent as any).openmw?.pluginRules?.[modId] : undefined,
  );

  const plugins = (modId !== undefined ? getCachedPlugins(modId) : undefined) ?? [];

  // what the user saved if there is anything, the defaults for plugins that aren't in there
  const nodes: ISubgroup[] = React.useMemo(() => {
    const defaults = defaultPluginRules(plugins);
    return plugins.map((name) => ({
      name,
      after: (stored?.[name] ?? defaults[name] ?? []).filter((a) => plugins.includes(a)),
    }));
  }, [plugins.join("\n"), stored]);

  const run = (action: unknown) => dispatch(action as any);

  // the whole set is saved on every change, so the defaults don't come back for a removed rule
  const save = (changed: { [plugin: string]: string[] }) => {
    if (modId === undefined) return;
    const all: { [plugin: string]: string[] } = {};
    nodes.forEach((node) => {
      all[node.name] = node.after;
    });
    run(setPluginRules(modId, { ...all, ...changed }));
  };

  const after = (plugin: string) => nodes.find((n) => n.name === plugin)?.after ?? [];

  const close = () => run(openPluginEditor(undefined));

  const modName = mod?.attributes?.customFileName ?? mod?.attributes?.logicalFileName ?? mod?.attributes?.name ?? modId ?? "";

  return (
    <VModal id="openmw-plugin-editor" show={modId !== undefined} onHide={close}>
      <VModal.Header>
        <VModal.Title>{t("Plugins - {{name}}", { replace: { name: modName } })}</VModal.Title>
      </VModal.Header>
      <VModal.Body>
        <div className="openmw-group-usage">
          <div>{t("Click a plugin to select it, ctrl+click another to make the selected plugin load before it.")}</div>
          <div>{t("Right click a line to remove the corresponding rule.")}</div>
        </div>
        <GroupGraph
          id="openmw-plugins"
          groups={nodes}
          label={pluginBaseName}
          onAddRule={(plugin, before) => save({ [plugin]: [...after(plugin), before] })}
          onRemoveRule={(plugin, before) => save({ [plugin]: after(plugin).filter((a) => a !== before) })}
        />
      </VModal.Body>
      <VModal.Footer>
        <Button onClick={() => modId !== undefined && run(setPluginRules(modId, undefined))}>
          {t("Reset to defaults")}
        </Button>
        <Button onClick={close}>{t("Close")}</Button>
      </VModal.Footer>
    </VModal>
  );
}

export default PluginEditor;
