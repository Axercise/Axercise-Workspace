import { z } from "zod";
import { AppError, body, fail, localRequest } from "@/server/http";
import { projectById } from "@/server/code-project";
import { closeTerminal, createTerminal, terminalInput, terminalOutput, terminalResize } from "@/server/code-terminal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dimensions = { cols: z.number().int().min(10).max(400), rows: z.number().int().min(4).max(200) };
const project = { project: z.uuid() };
const session = { ...project, id: z.uuid() };
const requests = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), ...project, ...dimensions, mode: z.enum(["cmd", "resume"]) }),
  z.object({ action: z.literal("input"), ...session, data: z.string().min(1).max(16_384) }),
  z.object({ action: z.literal("resize"), ...session, ...dimensions }),
  z.object({ action: z.literal("close"), ...session }),
]);

function terminalRequest(req: Request) {
  localRequest(req);
  if (req.headers.get("x-axercise-client") !== "workspace") throw new AppError("เปิด Terminal จากหน้า Code", 403);
}

export async function POST(req: Request) {
  try {
    terminalRequest(req);
    const input = requests.parse(await body(req, 110_000));
    if (input.action === "start") {
      const id = createTerminal(projectById(input.project), input.mode, input.cols, input.rows);
      return Response.json({ id }, { headers: { "Cache-Control": "no-store" } });
    }
    if (input.action === "input") terminalInput(input.project, input.id, input.data);
    if (input.action === "resize") terminalResize(input.project, input.id, input.cols, input.rows);
    if (input.action === "close") closeTerminal(input.project, input.id);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(error); }
}

export async function GET(req: Request) {
  try {
    terminalRequest(req);
    const query = new URL(req.url).searchParams;
    const { project, id } = z.object(session).parse(Object.fromEntries(query));
    return new Response(terminalOutput(project, id, req.signal), {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" },
    });
  } catch (error) { return fail(error); }
}
