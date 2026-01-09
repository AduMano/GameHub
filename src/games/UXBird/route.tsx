import { lazy } from "react";

const UXBird = lazy(() => import("./views/UXBird"));

export const UXBirdRoute = {
  path: "/UX-Bird",
  element: <UXBird />,
};
