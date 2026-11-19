import { NextResponse } from "next/server";
import { z } from "zod";
import { body, fail, localRequest } from "@/server/http";
import { syncAssignmentTask, refreshAssignmentTasks, syncLearningCalendar, syncPlanTasks } from "@/server/learning-integrations";
const input = z.discriminatedUnion("action", [z.object({ action: z.literal("task"), id: z.uuid(), use: z.enum(["local", "remote"]).optional(), quadrant: z.number().int().min(0).max(3).optional() }), z.object({ action: z.literal("refreshTasks") }), z.object({ action: z.literal("calendar"), kind: z.enum(["assessments", "plans"]), id: z.uuid() }), z.object({ action: z.literal("planTasks"), id: z.uuid() })]);
export const maxDuration = 300;
export async function POST(req: Request) { try { localRequest(req); const v = input.parse(await body(req, 2000)); const result = v.action === "task" ? await syncAssignmentTask(v.id, v.use, v.quadrant) : v.action === "refreshTasks" ? await refreshAssignmentTasks() : v.action === "calendar" ? await syncLearningCalendar(v.kind, v.id) : await syncPlanTasks(v.id); return NextResponse.json(result); } catch (e) { return fail(e); } }
