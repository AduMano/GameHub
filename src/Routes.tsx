import { createHashRouter } from "react-router";
import App from "./App";
import Play from "./Play";

// Implements hash-based navigation to bypass GitHub Pages directory constraints
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
