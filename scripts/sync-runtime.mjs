import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot =
  process.env.OPENCLAW_PLUGIN_RUNTIME_DIR ??
  resolve(
    process.env.HOME ?? process.cwd(),
    ".openclaw/workspace/mission-control-telemetry-bridge",
  );

await mkdir(runtimeRoot, { recursive: true });
await rm(resolve(runtimeRoot, "dist"), { recursive: true, force: true });
await cp(resolve(pluginRoot, "dist"), resolve(runtimeRoot, "dist"), {
  recursive: true,
  force: true,
});

await Promise.all([
  copyFile(
    resolve(pluginRoot, "openclaw.plugin.json"),
    resolve(runtimeRoot, "openclaw.plugin.json"),
  ),
  copyFile(
    resolve(pluginRoot, "package.json"),
    resolve(runtimeRoot, "package.json"),
  ),
]);
