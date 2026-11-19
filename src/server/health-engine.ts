import { createHash } from "node:crypto";
import { healthProblem, type HealthState, type HealthResult, type HealthEvent, type HealthAlert } from "../lib/health";
const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 24);
export function emptyHealth(): HealthState { return { version: 1, settings: { alertsEnabled: true, desktop: true, discord: true }, services: {}, events: [], alerts: [], lastFullCheckAt: 0 }; }
function alertText(events: HealthEvent[]) {
  const down = events.filter(event => event.kind === "down"), recovered = events.filter(event => event.kind === "recovered");
  return { title: down.length && recovered.length ? "Axercise · สถานะการเชื่อมต่อเปลี่ยนแปลง" : down.length ? "Axercise · การเชื่อมต่อมีปัญหา" : "Axercise · เชื่อมต่อได้อีกครั้ง", message: [down.length ? `ต้องดูแล: ${down.map(event => event.name).join(", ")}\n${down.map(event => event.message).filter((message, index, all) => all.indexOf(message) === index).join(" · ")}` : "", recovered.length ? `กลับมาพร้อม: ${recovered.map(event => event.name).join(", ")}` : ""].filter(Boolean).join("\n").slice(0, 900) };
}
export function refreshHealthAlerts(state: HealthState, now: number) {
  for (const alert of state.alerts) {
    if (alert.expiresAt <= now) { alert.superseded = true; continue; }
    const relevant = state.events.filter(event => alert.eventIds.includes(event.id) && (event.kind === "down" ? state.services[event.serviceId]?.incident?.id === event.incidentId : state.services[event.serviceId]?.status === "healthy"));
    if (!relevant.length) alert.superseded = true;
    else Object.assign(alert, alertText(relevant));
  }
  state.alerts = state.alerts.filter(alert => alert.createdAt > now - 7 * 86400000).slice(-100);
  state.events = state.events.slice(-100);
}
export function applyHealthResults(state: HealthState, results: HealthResult[], now: number, full = false) {
  const transitions: HealthEvent[] = [];
  for (const result of results) {
    const old = state.services[result.id];
    const next = { ...result, lastSuccessAt: old?.lastSuccessAt, failures: 0, firstFailureAt: undefined, incident: old?.incident } as NonNullable<HealthState["services"][typeof result.id]>;
    if (result.status === "healthy") {
      next.lastSuccessAt = now;
      if (old?.incident?.announced) transitions.push({ id: hash(`${old.incident.id}:recovered`), serviceId: result.id, incidentId: old.incident.id, kind: "recovered", name: result.name, message: result.message, at: now });
      next.incident = undefined;
    } else if (result.status === "unconfigured") next.incident = undefined;
    else if (healthProblem(result.status)) {
      next.failures = (old?.failures || 0) + 1;
      next.firstFailureAt = old?.firstFailureAt || now;
      next.incident = old?.incident || { id: hash(`${result.id}:${now}`), startedAt: now, announced: false };
      const persistent = next.failures >= 2 && now - next.firstFailureAt >= 30000;
      const agent = result.id.split(":")[1] as "hermes" | "secretary" | "developer";
      const grace = /^(ai|discord):/.test(result.id) && (state.repairGrace?.[agent] || 0) > now;
      if (!grace && !next.incident.announced && (persistent || (result.problem === "auth" && old?.status === "healthy"))) {
        next.incident = { ...next.incident, announced: true };
        transitions.push({ id: hash(`${next.incident.id}:down`), serviceId: result.id, incidentId: next.incident.id, kind: "down", name: result.name, message: result.message, at: now });
      }
    }
    state.services[result.id] = next;
  }
  state.events.push(...transitions);
  if (transitions.length && state.settings.alertsEnabled) {
    const eventIds = transitions.map(event => event.id);
    const alert: HealthAlert = { id: hash(eventIds.join(":")), eventIds, ...alertText(transitions), createdAt: now, expiresAt: now + 4 * 3600000, desktop: { state: "pending" }, discord: { state: "pending" } };
    if (!state.alerts.some(item => item.id === alert.id)) state.alerts.push(alert);
  }
  if (full) state.lastFullCheckAt = now;
  for (const agent of ["hermes", "secretary", "developer"] as const) {
    const until = state.repairGrace?.[agent];
    if (!until) continue;
    const ai = state.services[`ai:${agent}`], discord = state.services[`discord:${agent}`];
    if (until <= now || (ai?.status === "healthy" && discord?.status === "healthy" && ai.checkedAt >= until - 90000 && discord.checkedAt >= until - 90000)) delete state.repairGrace![agent];
  }
  refreshHealthAlerts(state, now);
}
