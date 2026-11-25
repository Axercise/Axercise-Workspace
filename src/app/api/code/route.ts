import { z } from "zod";
import { AppError, body, fail, localRequest } from "@/server/http";
import { checkpoint, chooseProject, codeFileLimit, codeVersions, createCodeEntry, listCodeEntries, openProject, projectById, projects, readCodeFile, readCodeVersion, saveCodeFile } from "@/server/code-project";
import { proposeCode } from "@/server/code-ai";

const response = (value: unknown) => Response.json(value, { headers: { "Cache-Control": "no-store" } });
const file = { project: z.uuid(), path: z.string().min(1).max(1024) };
const actions = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), directory: z.string().min(1).max(1024) }),
  z.object({ action: z.literal("choose") }),
  z.object({ action: z.literal("create"), ...file, kind: z.enum(["file", "folder"]) }),
  z.object({ action: z.literal("save"), ...file, content: z.string().max(codeFileLimit), revision: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.object({ action: z.literal("checkpoint"), ...file }),
  z.object({ action: z.literal("propose"), ...file, content: z.string().max(48000), instruction: z.string().trim().min(1).max(6000) }),
]);

export async function GET(req: Request) {
  try {
    localRequest(req);
    if (req.headers.get("x-axercise-client") !== "workspace") throw new AppError("เปิดไฟล์จากหน้า Code ใน Workspace", 403);
    const query = new URL(req.url).searchParams;
    const action = query.get("action");
    if (action === "projects") return response(projects());
    const project = projectById(z.uuid().parse(query.get("project")));
    const relative = z.string().max(1024).parse(query.get("path") ?? "");
    if (action === "list") return response(listCodeEntries(project, relative));
    if (!relative) throw new AppError("เลือกไฟล์ก่อน");
    if (action === "file") return response(readCodeFile(project, relative));
    if (action === "versions") return response(await codeVersions(project, relative));
    if (action === "version") return response({ content: await readCodeVersion(project, relative, query.get("version") || "") });
    throw new AppError("ไม่พบคำสั่งในหน้า Code", 404);
  } catch (error) { return fail(error); }
}

export async function POST(req: Request) {
  try {
    localRequest(req);
    const input = actions.parse(await body(req, 7_000_000));
    if (input.action === "open") return response(openProject(input.directory));
    if (input.action === "choose") return response(await chooseProject());
    const project = projectById(input.project);
    if (input.action === "save") return response(saveCodeFile(project, input.path, input.content, input.revision));
    if (input.action === "create") createCodeEntry(project, input.path, input.kind);
    if (input.action === "checkpoint") checkpoint(project, input.path);
    if (input.action === "propose") {
      readCodeFile(project, input.path);
      return response(await proposeCode(input.path, input.content, input.instruction, req.signal));
    }
    return response({ ok: true });
  } catch (error) { return fail(error); }
}
