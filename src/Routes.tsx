import { createHashRouter } from "react-router";
import App from "./App";
import Play from "./Play";

export const router = createHashRouter([
  {
    path: "/",
    element: <App />,
  },
  {
    path: "/play/:gameId",
    element: <Play />,
  },
]);
