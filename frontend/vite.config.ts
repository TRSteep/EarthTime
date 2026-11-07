import { defineConfig } from "vite";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [
    {
      name: "texture-edition-assets",
      closeBundle() {
        if (process.env.VITE_EARTHTIME_TERRAIN === "false") {
          rmSync(fileURLToPath(new URL("./dist/terrain", import.meta.url)), {
            recursive: true,
            force: true,
          });
        }
      },
    },
  ],
});
