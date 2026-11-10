import { build } from "vite";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { validateStore, emptyStore } from "../src/model.js";
import { cleanupMeetingContacts } from "../src/meeting-contact-cleanup.js";
import { notesFromBackup, normalizeNotes } from "../src/workspace-notes.js";
import { createAppIconPng } from "./app-icon.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = resolve(root, ".local");
let data = emptyStore();
const requestedDataFile = process.env.ODAK_EXPORT_DATA?.trim();
const snapshotFiles = requestedDataFile
  ? [resolve(root, requestedDataFile)]
  : [];
for (const file of snapshotFiles) {
  try {
    const saved = JSON.parse(await readFile(resolve(directory, file), "utf8"));
    const notes = notesFromBackup(saved);
    data = {
      ...validateStore(saved),
      migration: saved.migration || null,
      ...(notes.present ? { notes: notes.notes } : {}),
    };
    break;
  } catch (error) {
    if (requestedDataFile || error.code !== "ENOENT") throw error;
  }
}
data.records = cleanupMeetingContacts(data.records);
const result = await build({
  root,
  build: {
    write: false,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const output = result.output;
const script = output.find((file) => file.type === "chunk" && file.isEntry);
const css = output
  .filter((file) => file.type === "asset" && file.fileName.endsWith(".css"))
  .map((file) => file.source)
  .join("\n");
let html = String(output.find((file) => file.fileName === "index.html").source);
html = html.replace(/<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/g, "");
html = html.replace(
  /<link\b[^>]*\brel="(?:stylesheet|modulepreload)"[^>]*>/g,
  "",
);
html = html.replace("</head>", () => `<style>${css}</style></head>`);
html = html.replace(
  /<link\b[^>]*\brel="icon"[^>]*>/g,
  `<link rel="icon" type="image/png" sizes="256x256" href="data:image/png;base64,${createAppIconPng().toString("base64")}">`,
);
const safeData = JSON.stringify(data).replace(/</g, "\\u003c");
const safeScript = script.code.replace(/<\/script/gi, "<\\/script");
html = html.replace(
  "</body>",
  () =>
    `<script type="application/json" id="initial-data">${safeData}</script><script type="module">${safeScript}</script></body>`,
);
await mkdir(directory, { recursive: true, mode: 0o700 });
const destination = resolve(directory, "TAKIP.html");
await writeFile(destination, html, { mode: 0o600 });
await writeFile(
  resolve(
    directory,
    data.records.length
      ? "ODAK-guncel-kayit-yedegi.json"
      : "ODAK-bos-kayit-yedegi.json",
  ),
  JSON.stringify(
    {
      ...validateStore(data),
      ...(Object.hasOwn(data, "notes")
        ? { notes: normalizeNotes(data.notes) }
        : {}),
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  `Tek dosya hazır: .local/TAKIP.html (${data.records.length} başlangıç kaydı).${data.records.length || Object.hasOwn(data, "notes") || Object.hasOwn(data, "choiceLists") ? " Bu dosya kişisel verileri içerir; herkese açık yayımlamayın." : " Boş başlangıç verisiyle paylaşılabilir."}`,
);
