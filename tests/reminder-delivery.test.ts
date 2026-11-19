import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axercise-reminder-test-"));
process.env.AXERCISE_DATA_DIR = directory;
const store = await import("../src/server/store.ts");
const reminders = await import("../src/server/reminders.ts");
const { newReminderState } = await import("../src/server/reminder-engine.ts");
const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = originalFetch;
  store.atomicJSON(path.join(directory, "reminders.json"), newReminderState());
  store.updateConfig(c => { const bot = c.discord.find(b => b.agent === "secretary")!; bot.token = "TEST_BOT_SECRET"; bot.channelId = "123456789012345678"; bot.allowedUserId = "987654321098765432"; });
});
after(() => {
  globalThis.fetch = originalFetch;
  const target = path.resolve(directory);
  assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(path.basename(target).startsWith("axercise-reminder-test-"));
  fs.rmSync(target, { recursive: true, force: true });
});

test("Windows snooze and acknowledge stop shared pending deliveries and survive reloading", () => {
  const { id } = reminders.addTestReminder();
  const delivery = reminders.leaseDesktopReminders()[0];
  assert.equal(delivery.reminderId, id);
  assert.equal(reminders.leaseDesktopReminders().length, 0, "an outstanding lease must not dispatch twice");
  reminders.desktopFeedback({ action: "snooze", deliveryId: delivery.deliveryId });
  assert.ok(reminders.reminderState().reminders[0].snoozedUntil >= Date.now() + 9 * 60000);
  assert.equal(reminders.leaseDesktopReminders().length, 0);
  assert.ok(reminders.reminderState().deliveries.every(d => d.superseded));
  reminders.desktopFeedback({ action: "acknowledge", deliveryId: delivery.deliveryId });
  assert.equal(reminders.reminderState().reminders[0].status, "acknowledged");
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "reminders.json"), "utf8")).reminders[0].status, "acknowledged");
});

test("Discord only accepts the owner, consumes snooze once, and still accepts acknowledge on that message", async () => {
  const { id } = reminders.addTestReminder();
  let reactingUser = "someone-else", emoji = "💤";
  let posts = 0;
  globalThis.fetch = async (input, options) => {
    const url = String(input), method = options?.method || "GET";
    if (method === "POST") { posts++; return Response.json({ id: "111111111111111111" }); }
    if (method === "GET") return Response.json(url.includes(encodeURIComponent(emoji)) ? [{ id: reactingUser }] : []);
    if (method === "DELETE") return new Response(null, { status: 403 }); // Bot need not have Manage Messages.
    return new Response(null, { status: method === "PUT" ? 204 : 200 });
  };
  await reminders.dispatchDiscordReminders();
  assert.equal(posts, 1);
  const resetPoll = () => reminders.changeReminders(s => { s.deliveries[0].reactionsCheckedAt = 0; });
  resetPoll(); await reminders.dispatchDiscordReminders();
  assert.equal(reminders.reminderState().reminders[0].snoozedUntil, 0, "other users cannot operate an alert");
  reactingUser = store.config().discord.find(b => b.agent === "secretary")!.allowedUserId;
  resetPoll(); await reminders.dispatchDiscordReminders();
  const snoozed = reminders.reminderState().reminders[0].snoozedUntil;
  assert.ok(snoozed > Date.now());
  assert.deepEqual(reminders.reminderState().deliveries[0].consumedReactions, ["💤"]);
  resetPoll(); await reminders.dispatchDiscordReminders();
  assert.equal(reminders.reminderState().reminders[0].snoozedUntil, snoozed, "a retained reaction must not extend the snooze repeatedly");
  emoji = "✅";
  resetPoll(); await reminders.dispatchDiscordReminders();
  assert.equal(reminders.reminderState().reminders.find(r => r.id === id)?.status, "acknowledged");
  assert.equal(posts, 1, "controls must not send a duplicate reminder");
});

test("native dispatch can retry a failure without creating a second occurrence", () => {
  reminders.addTestReminder();
  const delivery = reminders.leaseDesktopReminders()[0];
  reminders.desktopFeedback({ action: "failed", deliveryId: delivery.deliveryId });
  reminders.changeReminders(s => { s.deliveries[0].desktop.attemptedAt = 0; });
  assert.equal(reminders.leaseDesktopReminders()[0].deliveryId, delivery.deliveryId);
  reminders.desktopFeedback({ action: "sent", deliveryId: delivery.deliveryId });
  assert.equal(reminders.leaseDesktopReminders().length, 0);
  assert.equal(reminders.reminderState().deliveries.length, 1);
});
