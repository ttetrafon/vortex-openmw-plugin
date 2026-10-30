import { FlexLayout, Icon, tooltip, types } from "@nexusmods/vortex-api";
import React from "react";
import { ControlLabel, FormControl, FormGroup, HelpBlock, InputGroup, Panel } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { useSelector, useStore } from "react-redux";

import { setOpenMWLocation } from "./actions";

// vortex-api ships its own React typings, which clash with the local @types/react.
const VFlexLayout = FlexLayout as any;
const VIcon = Icon as any;
const VButton = tooltip.Button as any;
const VFormControl = FormControl as any;
const VInputGroup = InputGroup as any;

interface IProps {
  api: types.IExtensionApi;
}

function Settings(props: IProps) {
  const { api } = props;
  const { t } = useTranslation();
  const store = useStore();

  const location: string = useSelector(
    (state: types.IState) => (state.settings as any)["openmw"]?.location ?? "",
  );

  const setLocation = React.useCallback(
    (value: string) => {
      store.dispatch(setOpenMWLocation(value) as any);
    },
    [store],
  );

  const onChange = React.useCallback(
    (evt: React.ChangeEvent<HTMLInputElement>) => setLocation(evt.target.value),
    [setLocation],
  );

  const browse = React.useCallback(() => {
    api
      .selectDir({
        title: t("Select the OpenMW settings directory"),
        ...(location !== "" ? { defaultPath: location } : {}),
      })
      .then((dir: string) => {
        if (dir !== undefined) {
          setLocation(dir);
        }
      })
      .catch(() => undefined);
  }, [api, location, setLocation, t]);

  const label = t("OpenMW Settings Location");

  return (
    <form onSubmit={(evt) => evt.preventDefault()}>
      <Panel>
        <Panel.Body>
          <FormGroup id="openmw-location-form">
            <ControlLabel>{label}</ControlLabel>
            <VFlexLayout type="row">
              <VFlexLayout.Fixed>
                <VInputGroup>
                  <VFormControl
                    className="install-path-input"
                    placeholder={label}
                    value={location}
                    onChange={onChange}
                  />
                  <VInputGroup.Button className="inset-btn">
                    <VButton tooltip={t("Browse")} onClick={browse}>
                      <VIcon name="browse" />
                    </VButton>
                  </VInputGroup.Button>
                </VInputGroup>
              </VFlexLayout.Fixed>
            </VFlexLayout>
            <HelpBlock>
              {t("The location of 'launcher.cfg' and 'openmw.cfg' files for the current user")}
            </HelpBlock>
          </FormGroup>
        </Panel.Body>
      </Panel>
    </form>
  );
}

export default Settings;
