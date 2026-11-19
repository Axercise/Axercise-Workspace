import { after, NextResponse } from "next/server";
import { fail, localRequest } from "@/server/http";
import { queuePendingAssignmentTasks } from "@/server/learning-integrations";
import { dispatchDiscordReminders, leaseDesktopReminders, runReminderTick } from "@/server/reminders";
import { dispatchTaskCalendar } from "@/server/task-calendar";
import { dispatchHealthDiscord, leaseHealthDesktop, runHealthCheck } from "@/server/health";
import { leaseBriefingDesktop, runBriefingTick } from "@/server/briefings";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    localRequest(req, true);
    after(async () => { await Promise.allSettled([dispatchDiscordReminders(), dispatchTaskCalendar(), runBriefingTick(), (async () => { await runHealthCheck(); await dispatchHealthDiscord(); })()]); });
    let desktop: ReturnType<typeof leaseDesktopReminders> = [], remindersAvailable = true;
    try { queuePendingAssignmentTasks(); await runReminderTick(); desktop = leaseDesktopReminders(); } catch { remindersAvailable = false; }
    const healthDesktop = (() => { try { return leaseHealthDesktop(); } catch { return []; } })();
    const briefingDesktop = (() => { try { return leaseBriefingDesktop(); } catch { return []; } })();
    return NextResponse.json({ enabled: true, desktop, healthDesktop, briefingDesktop, remindersAvailable });
  }
  catch (e) { return fail(e); }
}
