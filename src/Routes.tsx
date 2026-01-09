import { createBrowserRouter } from "react-router";
import App from "./App";

import { Suspense } from "react";
import { UXBirdRoute } from "./games/UXBird/route";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
  },
  {
    ...UXBirdRoute,
    element: <Suspense fallback={null}>{UXBirdRoute.element}</Suspense>,
  },
]);
