import { createBrowserRouter } from "react-router";
import App from "./App";
import Play from "./Play";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
  },
  {
    path: "/play/:gameId",
    element: <Play />,
  },
]);
