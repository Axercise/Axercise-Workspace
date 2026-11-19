import { NextResponse } from "next/server";
import { localRequest, fail } from "@/server/http";
import { agentStatus } from "@/server/hermes";
import { publicSettings } from "@/server/store";
export const dynamic = "force-dynamic";
export async function GET(req: Request) { try { localRequest(req); return NextResponse.json({ name: "axercise", managed: process.env.AXERCISE_MANAGED === "1", instanceId: process.env.AXERCISE_INSTANCE_ID || null, controllerPid: Number(process.env.AXERCISE_CONTROLLER_PID) || null, agents: await agentStatus(), settings: publicSettings() }); } catch (e) { return fail(e); } }
