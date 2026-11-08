import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseExcelFile, buildWorkbook } from "../src/excel.js";
import { validateStore } from "../src/model.js";

const sourcePath = process.argv[2];
if (!sourcePath)
  throw new Error("Kullanım: npm run import:local -- /dosya/yolu/TAKIP.xlsm");
const directory = fileURLToPath(new URL("../.local/", import.meta.url));
const destination = resolve(directory, "imported-data.json");
try {
  await access(destination);
  throw new Error(
    "Bir defalık başlangıç aktarımı zaten tamamlanmış. Mevcut kayıtların üzerine yazılmadı.",
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const bytes = await readFile(sourcePath);
const result = await parseExcelFile({
  name: basename(sourcePath),
  arrayBuffer: async () => bytes,
});
const store = validateStore({ version: 1, records: result.records });
const counts = Object.fromEntries(
  [...new Set(store.records.map((record) => record.type))].map((type) => [
    type,
    store.records.filter((record) => record.type === type).length,
  ]),
);
const migration = {
  sourceName: basename(sourcePath),
  importedAt: new Date().toISOString(),
  counts,
  warnings: result.warnings,
  report: result.report,
};
const backup = await buildWorkbook(store.records).xlsx.writeBuffer();
await mkdir(directory, { recursive: true, mode: 0o700 });
await writeFile(resolve(directory, "TAKIP-web-yedek.xlsx"), backup, {
  flag: "wx",
  mode: 0o600,
});
await writeFile(destination, JSON.stringify({ ...store, migration }, null, 2), {
  flag: "wx",
  mode: 0o600,
});
console.log(
  JSON.stringify(
    {
      total: store.records.length,
      counts,
      warnings: result.warnings.length,
      report: { ...result.report, unresolvedLinkDetails: undefined },
      output: ".local/imported-data.json",
      backup: ".local/TAKIP-web-yedek.xlsx",
    },
    null,
    2,
  ),
);
