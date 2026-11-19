import { NextResponse } from "next/server";
import { z } from "zod";
import { body, fail, localRequest, AppError } from "@/server/http";
import { listTasks, listNotes, saveTask, saveNote, archiveNotion } from "@/server/notion";
import { listEvents, saveEvent, removeEvent } from "@/server/calendar";
import { delegate } from "@/server/hermes";
import { reminderFeed, updateReminder } from "@/server/reminders";
import { briefingFeed, generateBriefing, readBriefing, updateBriefingSettings } from "@/server/briefings";
import { readLearning, record, saveLearningRecord } from "@/server/learning-store";
import { sourceSearch } from "@/server/learning-files";
import { kinds } from "@/lib/learning";
import { libraryList, libraryRead, saveLibrary, deleteLibrary, importAgentLibraryFile } from "@/server/library";
import { saveAndScheduleLearning, syncAssignmentTask, syncPlanTasks, syncLearningCalendar } from "@/server/learning-integrations";
const schema = z.object({ action: z.string().max(60), agent: z.enum(["hermes", "secretary", "developer"]), args: z.record(z.string(), z.unknown()).default({}) });
export async function POST(req: Request) {
  try {
    localRequest(req, true); const { action, agent, args } = schema.parse(await body(req, 1000000)); let result: unknown;
    switch (action) {
      case "briefings_list": result = briefingFeed(true); break;
      case "briefings_read": result = readBriefing(z.string().regex(/^[a-f0-9]{24}$/).parse(args.id)); break;
      case "briefings_generate": { const report = await generateBriefing(z.enum(["morning", "evening"]).parse(args.period), "agent"); result = { ...report, url: `http://127.0.0.1:3210/briefing?report=${report.id}` }; break; }
      case "briefings_settings": result = updateBriefingSettings(args); break;
      case "library_list": result = libraryList(args); break;
      case "library_read": result = libraryRead(z.uuid().parse(args.id)); break;
      case "library_save": {
        const { id, revision, filePaths, ...data } = args;
        const imported = z.array(z.string().max(2000)).max(12).parse(filePaths || []).map(file => importAgentLibraryFile(file, agent));
        if (imported.length) { const preserved = data.attachmentIds === undefined && id ? libraryRead(z.uuid().parse(id)).fileIds : z.array(z.uuid()).parse(data.attachmentIds || []); data.attachmentIds = [...new Set([...preserved, ...imported.map(f => f.id)])]; }
        const item = saveLibrary(data, id ? z.uuid().parse(id) : undefined, revision === undefined ? undefined : z.number().int().positive().parse(revision), agent);
        result = { ...item, url: `http://127.0.0.1:3210/library?item=${item.id}` }; break;
      }
      case "library_trash": result = deleteLibrary(z.uuid().parse(args.id), z.number().int().positive().parse(args.revision), "trash"); break;
      case "tasks_list": result = await listTasks(); break;
      case "tasks_create": result = await saveTask(args); break;
      case "tasks_update": result = await saveTask(args, z.string().parse(args.id)); break;
      case "tasks_archive": result = await archiveNotion("task", z.string().parse(args.id)); break;
      case "notes_list": result = await listNotes(); break;
      case "notes_create": result = await saveNote(args); break;
      case "notes_update": result = await saveNote(args, z.string().parse(args.id)); break;
      case "notes_archive": result = await archiveNotion("note", z.string().parse(args.id)); break;
      case "calendar_list": result = await listEvents(z.string().parse(args.from), z.string().parse(args.to)); break;
      case "calendar_create": result = await saveEvent(args); break;
      case "calendar_update": result = await saveEvent(args, z.string().parse(args.id)); break;
      case "calendar_delete": result = await removeEvent(z.string().parse(args.id)); break;
      case "reminders_list": result = reminderFeed(); break;
      case "reminders_update": { updateReminder(z.string().regex(/^[a-f0-9]{24}$/).parse(args.id), z.enum(["acknowledge", "snooze", "resume"]).parse(args.action), args.minutes === undefined ? 10 : z.number().int().min(1).max(1440).parse(args.minutes)); result = reminderFeed(); break; }
      case "agent_delegate": result = await delegate(agent, z.enum(["secretary", "developer"]).parse(args.target), z.string().parse(args.prompt)); break;
      case "learning_list": {
        const state = readLearning(), kind = args.kind ? z.enum(kinds as [typeof kinds[number], ...typeof kinds[number][]]).parse(args.kind) : undefined;
        const courseId = args.courseId ? z.uuid().parse(args.courseId) : undefined;
        result = kind ? state.records[kind].filter(r => (!("deletedAt" in r) || !r.deletedAt) && (args.includeArchived === true || !r.archived) && (!courseId || ("courseId" in r && r.courseId === courseId))) : { terms: state.records.terms.filter(t => !t.archived), courses: state.records.courses.filter(c => !c.archived) };
        break;
      }
      case "learning_read": { const item = record(readLearning(), z.enum(kinds as [typeof kinds[number], ...typeof kinds[number][]]).parse(args.kind), z.uuid().parse(args.id)); if ("deletedAt" in item && item.deletedAt) throw new AppError("เอกสารถูกลบแล้ว", 404); result = item; break; }
      case "learning_search": result = sourceSearch(z.uuid().parse(args.courseId), z.string().max(1000).parse(args.query || "")); break;
      case "learning_save": { if (args.id && args.revision === undefined) throw new AppError("Read the record and supply its current revision before updating", 409); result = saveAndScheduleLearning(z.enum(kinds as [typeof kinds[number], ...typeof kinds[number][]]).parse(args.kind), z.record(z.string(), z.unknown()).parse(args.data), args.id ? z.uuid().parse(args.id) : undefined, args.revision === undefined ? undefined : z.number().int().positive().parse(args.revision)); break; }
      case "learning_link": {
        const kind = z.enum(["assignments", "plans", "assessments"]).parse(args.kind), id = z.uuid().parse(args.id), destination = z.enum(["tasks", "calendar"]).parse(args.destination);
        if (destination === "tasks" && kind === "assessments" || destination === "calendar" && kind === "assignments") throw new AppError("Tasks รองรับการบ้าน/แผนอ่าน ส่วน Calendar รองรับวันสอบ/แผนอ่าน");
        const placement = args.quadrant === undefined ? undefined : z.number().int().min(0).max(3).parse(args.quadrant);
        result = destination === "tasks" ? kind === "plans" ? await syncPlanTasks(id) : await syncAssignmentTask(id, undefined, placement) : await syncLearningCalendar(kind as "plans" | "assessments", id); break;
      }
      default: throw new AppError("ไม่พบเครื่องมือ", 404);
    }
    return NextResponse.json(result);
  } catch (e) { return fail(e); }
}
