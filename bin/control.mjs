import net from "node:net";
import { timingSafeEqual } from "node:crypto";

export const CONTROL_HOST = "127.0.0.1";
export const CONTROL_PORT = 3211;

export function isControllerAbsent(error) {
  return error?.code === "ECONNREFUSED" || error?.code === "ENOENT";
}

function matchesToken(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  const a = Buffer.from(provided), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** @param {{getToken: () => string, getStatus: () => object, onStop: () => void, onRestartAgent?: (agent: string) => boolean | Promise<boolean>}} options */
export function createController({ getToken, getStatus, onStop, onRestartAgent }) {
  return net.createServer(socket => {
    let buffer = "", handled = false;
    socket.setEncoding("utf8");
    socket.setTimeout(3000, () => socket.destroy());
    socket.on("error", () => {});
    socket.on("data", async chunk => {
      if (handled) return;
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 2048) return socket.destroy();
      if (!buffer.includes("\n")) return;
      handled = true;
      try {
        const request = JSON.parse(buffer.split("\n")[0]);
        if (!matchesToken(request.token, getToken())) return socket.end(JSON.stringify({ ok: false, error: "unauthorized" }) + "\n");
        if (request.action === "restart_agent") {
          if (!onRestartAgent || !["hermes", "secretary", "developer"].includes(request.agent)) return socket.end(JSON.stringify({ ok: false, error: "unsupported_action" }) + "\n");
          if (!await onRestartAgent(request.agent)) return socket.end(JSON.stringify({ ok: false, error: "agent_busy" }) + "\n");
          return socket.end(JSON.stringify({ ...getStatus(), ok: true, name: "axercise", protocol: 1, restarting: request.agent }) + "\n");
        }
        if (!["status", "stop"].includes(request.action)) return socket.end(JSON.stringify({ ok: false, error: "unsupported_action" }) + "\n");
        socket.end(JSON.stringify({ ...getStatus(), ok: true, name: "axercise", protocol: 1, stopping: request.action === "stop" }) + "\n");
        if (request.action === "stop") setTimeout(onStop, 50);
      } catch { socket.end(JSON.stringify({ ok: false, error: "invalid_request" }) + "\n"); }
    });
  });
}

export function requestControl(action, token, { host = CONTROL_HOST, port = CONTROL_PORT, timeout = 2000, agent = "" } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    let buffer = "", settled = false;
    function finish(error, value) {
      if (settled) return; settled = true; socket.destroy();
      if (error) reject(error); else resolve(value);
    }
    socket.setEncoding("utf8");
    socket.setTimeout(timeout, () => finish(new Error("The Axercise controller did not respond. The workspace may still be running.")));
    socket.on("connect", () => socket.write(JSON.stringify({ action, token, ...(action === "restart_agent" ? { agent } : {}) }) + "\n"));
    socket.on("data", chunk => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 16384) return finish(new Error("Invalid response from the Axercise controller."));
      if (!buffer.includes("\n")) return;
      try {
        const value = JSON.parse(buffer.split("\n")[0]);
        if (value.error === "agent_busy") throw new Error("The agent is working and cannot be restarted yet.");
        if (!value.ok || value.name !== "axercise" || value.protocol !== 1 || typeof value.instanceId !== "string" || !Number.isInteger(value.pid)) throw new Error("The Axercise controller could not be authenticated. The workspace may still be running.");
        finish(null, value);
      } catch (error) { finish(error); }
    });
    socket.on("error", error => finish(isControllerAbsent(error) ? null : new Error(`Cannot reach the Axercise controller (${error.code || "connection error"}). The workspace may still be running.`), null));
    socket.on("end", () => { if (!settled) finish(new Error("The Axercise controller closed the connection without a valid response.")); });
  });
}

export function matchingInstance(controller, web) {
  return !!(controller?.ok && web?.name === "axercise" && web.managed && controller.instanceId && web.instanceId === controller.instanceId && web.controllerPid === controller.pid);
}
