import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getStartupStatus, setStartupEnabled } from "../bin/startup.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axercise-startup-test-"));
after(() => {
  const target = path.resolve(directory);
  assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(path.basename(target).startsWith("axercise-startup-test-"));
  fs.rmSync(target, { recursive: true, force: true });
});
function fixture(name: string) {
  const root = path.join(directory, name, "ราก O'Connor & Workspace");
  const options = { root, dataDir: path.join(root, ".axercise"), startupDir: path.join(directory, name, "Startup") };
  fs.mkdirSync(path.join(root, "bin"), { recursive: true });
  fs.writeFileSync(path.join(root, "bin", "startup-runner.mjs"), 'import fs from "node:fs"; fs.writeFileSync(new URL("../startup-result.json", import.meta.url), JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)}));');
  return options;
}

test("Windows sign-in launcher executes hidden with Unicode, spaces, apostrophes and shell metacharacters in the installation path", { skip: process.platform !== "win32" }, () => {
  const options = fixture("launch");
  assert.equal(getStartupStatus(options).enabled, false);
  assert.equal(setStartupEnabled(true, options).enabled, true);
  const host = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "wscript.exe");
  const result = spawnSync(host, ["//B", "//NoLogo", "//E:JScript", path.join(options.dataDir, "startup-launcher.js")], { windowsHide: true, timeout: 15000 });
  assert.equal(result.status, 0);
  const output = JSON.parse(fs.readFileSync(path.join(options.root, "startup-result.json"), "utf8"));
  assert.deepEqual(output, { cwd: options.root, args: [] });
});

test("startup enable is idempotent, stale launchers are detected and repaired, disable removes only its own shortcut", { skip: process.platform !== "win32" }, () => {
  const options = fixture("lifecycle");
  setStartupEnabled(true, options); setStartupEnabled(true, options);
  assert.deepEqual(fs.readdirSync(options.startupDir), ["Axercise Workspace.lnk"]);
  fs.appendFileSync(path.join(options.dataDir, "startup-launcher.js"), "// changed", "utf16le");
  assert.equal(getStartupStatus(options).enabled, false);
  assert.equal(setStartupEnabled(true, options).enabled, true);
  fs.writeFileSync(path.join(options.startupDir, "Another App.txt"), "preserve");
  assert.equal(setStartupEnabled(false, options).installed, false);
  assert.equal(setStartupEnabled(false, options).enabled, false);
  assert.equal(fs.readFileSync(path.join(options.startupDir, "Another App.txt"), "utf8"), "preserve");
});

test("startup cannot replace or delete a foreign entry and validates the runtime before changing an installation", { skip: process.platform !== "win32" }, () => {
  const options = fixture("ownership");
  fs.mkdirSync(options.startupDir, { recursive: true });
  const foreign = path.join(options.startupDir, "Axercise Workspace.lnk");
  fs.writeFileSync(foreign, "foreign entry");
  assert.throws(() => setStartupEnabled(true, options));
  assert.throws(() => setStartupEnabled(false, options));
  assert.equal(fs.readFileSync(foreign, "utf8"), "foreign entry");
  fs.unlinkSync(foreign);
  assert.throws(() => setStartupEnabled(true, { ...options, node: path.join(directory, "missing-node.exe") }));
  assert.equal(fs.existsSync(foreign), false);
});
