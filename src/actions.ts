import { createAction } from "redux-act";

export const setOpenMWLocation = createAction(
  "OPENMW_SET_LOCATION",
  (location: string) => location,
);
