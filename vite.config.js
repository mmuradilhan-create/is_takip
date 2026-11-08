import { defineConfig } from "vite";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Personal migration data stays outside Git and production bundles.
const localDataPath = fileURLToPath(
  new URL("./.local/imported-data.json", import.meta.url),
);
function localMigrationData() {
  function attach(server) {
    server.middlewares.use("/__local/initial-data", async (req, res) => {
      if (
        req.method !== "GET" ||
        !["", "/"].includes((req.url || "").split("?")[0])
      ) {
        res.statusCode = 404;
        return res.end();
      }
      res.setHeader("Cache-Control", "no-store");
      try {
        const data = await readFile(localDataPath);
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(data);
      } catch (error) {
        res.statusCode = error.code === "ENOENT" ? 204 : 500;
        res.end();
      }
    });
  }
  return {
    name: "local-migration-data",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
export default defineConfig({ plugins: [localMigrationData()] });
