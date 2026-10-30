import { FormPathItem, types } from "@nexusmods/vortex-api";
import React from "react";
import { Panel } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { useSelector, useStore } from "react-redux";

import { setOpenMWLocation } from "./actions";

const PathItem = FormPathItem as any;

function Settings() {
  const { t } = useTranslation();
  const store = useStore();

  const location = useSelector(
    (state: types.IState) => (state.settings as any)["openmw"]?.location ?? "",
  );

  const onChange = React.useCallback((_key: string, value: string) => {
    store.dispatch(setOpenMWLocation(value) as any);
  }, [store]);

  return (
    <form>
      <Panel>
        <Panel.Body>
          <PathItem
            t={t}
            controlId="openmw-location"
            label={t("OpenMW Settings Location")}
            placeholder={t("Select the OpenMW settings directory")}
            stateKey="location"
            value={location}
            onChangeValue={onChange}
            directory={true}
          />
        </Panel.Body>
      </Panel>
    </form>
  );
}

export default Settings;