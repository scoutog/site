import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";

const requiredFiles = [
  "index.html",
  "snake.html",
  "crime.html",
  "running.html",
  "styles.css",
  "running-app.js",
  "running-utils.js",
  "running-config.js",
  "supabase/functions/import-health-data/index.ts",
  "supabase/migrations/202609020001_running_dashboard.sql"
];

for (const file of requiredFiles) {
  await access(file, constants.R_OK);
}

const runningHtml = await readFile("running.html", "utf8");
if (!runningHtml.includes('href="/running.html"')) {
  throw new Error("running.html does not include the Running navigation link.");
}
if (runningHtml.includes("service_role") || runningHtml.includes("INGESTION_BEARER_TOKEN")) {
  throw new Error("running.html appears to expose a server-side secret name/value.");
}

const config = await readFile("running-config.js", "utf8");
if (!config.includes("RUNNING_CONFIG")) {
  throw new Error("running-config.js must define window.RUNNING_CONFIG.");
}

console.log("Static site validation passed.");
