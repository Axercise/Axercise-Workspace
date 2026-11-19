import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import net, { type Server } from "node:net";
import { createController, requestControl, matchingInstance, isControllerAbsent } from "../bin/control.mjs";

const token = "test-controller-token";
const status = { pid: 1234, instanceId: "test-instance" };
async function listen(t: TestContext, server: Server) {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen({ host: "127.0.0.1", port: 0 }, resolve); });
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  assert.equal(address.address, "127.0.0.1"); return address.port;
}
test("controller reports the authenticated instance over loopback TCP", async t => {
  const server = createController({ getToken: () => token, getStatus: () => status, onStop: () => {} });
  const port = await listen(t, server);
  const value = await requestControl("status", token, { port });
  assert.deepEqual(value, { ...status, ok: true, name: "axercise", protocol: 1, stopping: false });
});
test("wrong credentials cannot report stopped or trigger shutdown", async t => {
  let stopped = false;
  const port = await listen(t, createController({ getToken: () => token, getStatus: () => status, onStop: () => { stopped = true; } }));
  await assert.rejects(requestControl("stop", "wrong-token", { port }), /authenticated/);
  assert.equal(stopped, false);
  await assert.rejects(requestControl("execute", token, { port }), /authenticated/);
  assert.equal(stopped, false);
});
test("authenticated agent restart accepts only named profiles and leaves the controller running", async t => {
  const restarted: string[] = [];
  const port = await listen(t, createController({ getToken: () => token, getStatus: () => status, onStop: () => assert.fail("must not stop"), onRestartAgent: agent => { restarted.push(agent); return true; } }));
  await requestControl("restart_agent", token, { port, agent: "secretary" }); assert.deepEqual(restarted, ["secretary"]);
  await assert.rejects(requestControl("restart_agent", token, { port, agent: "arbitrary-process" }));
  await assert.rejects(requestControl("restart_agent", "wrong-token", { port, agent: "hermes" }));
  assert.deepEqual(restarted, ["secretary"]); assert.equal((await requestControl("status", token, { port })).pid, status.pid);
});
test("an agent with active work can reject restart", async t => {
  const port = await listen(t, createController({ getToken: () => token, getStatus: () => status, onStop: () => {}, onRestartAgent: () => false }));
  await assert.rejects(requestControl("restart_agent", token, { port, agent: "developer" }), /working/);
});
test("authenticated shutdown is acknowledged before the stop callback", async t => {
  let complete: () => void = () => {};
  const stopped = new Promise<void>(resolve => { complete = resolve; });
  const port = await listen(t, createController({ getToken: () => token, getStatus: () => status, onStop: complete }));
  const result = await requestControl("stop", token, { port }) as { stopping: boolean };
  assert.equal(result.stopping, true); await stopped;
});
test("permission failures and timeouts are distinct from a stopped controller", async t => {
  assert.equal(isControllerAbsent({ code: "ECONNREFUSED" }), true);
  assert.equal(isControllerAbsent({ code: "EPERM" }), false);
  assert.equal(isControllerAbsent({ code: "EACCES" }), false);
  const server = net.createServer(socket => { socket.on("data", () => {}); });
  const port = await listen(t, server);
  await assert.rejects(requestControl("status", token, { port, timeout: 50 }), /did not respond/);
});
test("a closed controller port reports stopped", async () => {
  const server = net.createServer(); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>(resolve => server.close(() => resolve()));
  assert.equal(await requestControl("status", token, { port: address.port }), null);
});
test("startup cannot accept a web server belonging to another controller", () => {
  const controller = { ...status, ok: true };
  const web = { name: "axercise", managed: true, instanceId: status.instanceId, controllerPid: status.pid };
  assert.equal(matchingInstance(controller, web), true);
  assert.equal(matchingInstance(controller, { ...web, instanceId: "older-instance" }), false);
  assert.equal(matchingInstance(controller, { ...web, controllerPid: 9999 }), false);
  assert.equal(matchingInstance(null, web), false);
});
