import { actions, Modal, types } from "@nexusmods/vortex-api";
import React from "react";
import { Button } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector, useStore } from "react-redux";

import {
  addGroup,
  addGroupRule,
  openGroupEditor,
  removeGroup,
  removeGroupRule,
  resetGroups,
} from "./actions";
import GroupGraph from "./GroupGraph";
import type { IGroup } from "./reducers";

// vortex-api ships its own React typings, which clash with the local @types/react.
const VModal = Modal as any;

function GroupEditor() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const store = useStore();
  const open: boolean = useSelector((s: types.IState) => !!(s.session as any).openmw?.groupEditorOpen);
  const groups: IGroup[] = useSelector((s: types.IState) => (s.persistent as any).openmw?.groups ?? []);
  const [selected, setSelected] = React.useState<string | undefined>(undefined);

  const parent = groups.find((g) => g.name === selected);
  const run = (action: unknown) => dispatch(action as any);

  const close = () => run(openGroupEditor(false));

  const reset = () => {
    (store.dispatch as any)(
      (actions as any).showDialog(
        "question",
        t("Reset Groups"),
        { text: t("This will remove all your changes to groups and subgroups. This can't be undone!") },
        [{ label: "Cancel" }, { label: "Reset", default: true }],
      ),
    ).then((result: types.IDialogResult) => {
      if (result.action === "Reset") {
        setSelected(undefined);
        run(resetGroups());
      }
    });
  };

  return (
    <VModal id="openmw-group-editor" show={open} onHide={close}>
      <VModal.Header>
        <VModal.Title>{t("Groups")}</VModal.Title>
      </VModal.Header>
      <VModal.Body>
        <div className="openmw-group-usage">
          <div>{t("Click a group to select it and see its subgroups below.")}</div>
          <div>{t("Ctrl+click another group to make the selected one load before it.")}</div>
          <div>{t("Right click a line/node to remove the corresponding rule/group.")}</div>
        </div>
        <GroupGraph
          id="openmw-groups"
          groups={groups}
          selected={selected}
          onSelect={setSelected}
          onAdd={(name) => run(addGroup(name))}
          onRemove={(name) => run(removeGroup(name))}
          onAddRule={(group, after) => run(addGroupRule(group, after))}
          onRemoveRule={(group, after) => run(removeGroupRule(group, after))}
        />
        <hr />
        {parent === undefined ? (
          <div>{t("Select a group above to edit its subgroups.")}</div>
        ) : (
          <div>
            <h5>{t("Subgroups of {{name}}", { replace: { name: parent.name } })}</h5>
            <GroupGraph
              id="openmw-subgroups"
              key={parent.name}
              groups={parent.subgroups}
              onAdd={(name) => run(addGroup(name, parent.name))}
              onRemove={(name) => run(removeGroup(name, parent.name))}
              onAddRule={(group, after) => run(addGroupRule(group, after, parent.name))}
              onRemoveRule={(group, after) => run(removeGroupRule(group, after, parent.name))}
            />
          </div>
        )}
      </VModal.Body>
      <VModal.Footer>
        <Button onClick={reset}>{t("Reset to defaults")}</Button>
        <Button onClick={close}>{t("Close")}</Button>
      </VModal.Footer>
    </VModal>
  );
}

export default GroupEditor;
