import { types, util } from "@nexusmods/vortex-api";

import * as actions from "./actions";

const reducer: types.IReducerSpec = {
  reducers: {
    [actions.setOpenMWLocation as any]: (state, payload) =>
      util.setSafe(state, ["location"], payload),
  },
  defaults: {
    location: "",
  },
};

export default reducer;
