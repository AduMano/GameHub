import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import path from "path";

function gameDiscoveryPlugin() {
  return {
    name: "game-discovery",
    resolveId(id: string) {
      if (id === "virtual:games") {
        return "\0virtual:games";
      }
    },
    load(id: string) {
      if (id === "\0virtual:games") {
        // Matches the exact uppercase 'Games' directory
        const gamesDir = path.resolve(__dirname, "public/Games");
        let games: string[] = [];

        if (fs.existsSync(gamesDir)) {
          games = fs
            .readdirSync(gamesDir, { withFileTypes: true })
            .filter((dirent) => dirent.isDirectory())
            .map((dirent) => dirent.name);
        }

        return `export const games = ${JSON.stringify(games)};`;
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), gameDiscoveryPlugin()],
  base: "/GameHub/",
});
