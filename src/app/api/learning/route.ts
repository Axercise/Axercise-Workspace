import { NextResponse } from "next/server";
import { z } from "zod";
import { body, fail, localRequest } from "@/server/http";
import { kinds, type LearningRecord } from "@/lib/learning";
import { readLearning, hash } from "@/server/learning-store";
import { queuePendingExtractions } from "@/server/learning-files";
import { config } from "@/server/store";
import { saveAndScheduleLearning, queuePendingAssignmentTasks } from "@/server/learning-integrations";
import { cleanupDeletedDocuments } from "@/server/learning-delete";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) { try { localRequest(req); cleanupDeletedDocuments(); queuePendingAssignmentTasks(); queuePendingExtractions(); const state = readLearning(); return NextResponse.json({ ...state, records: { ...state.records, documents: state.records.documents.filter(d => !d.deletedAt) }, status: { pending: kinds.flatMap<LearningRecord>(k => state.records[k]).filter(r => "deletedAt" in r && r.deletedAt ? !r.notionDeletedAt : hash(r) !== state.sync.items[r.id]?.baseHash).length, conflicts: Object.values(state.sync.items).filter(i => i.conflict).length, notionConfigured: !!(config().notion.token && config().notion.parentPageId) } }); } catch (e) { return fail(e); } }
const input = z.object({ kind: z.enum(kinds as [typeof kinds[number], ...typeof kinds[number][]]), id: z.uuid().optional(), revision: z.number().int().positive().optional(), data: z.record(z.string(), z.unknown()) }).strict().refine(v => !v.id || v.revision !== undefined, "โหลดรายการพร้อม revision ล่าสุดก่อนแก้ไข");
export async function POST(req: Request) { try { localRequest(req); const v = input.parse(await body(req, 300000)); return NextResponse.json(saveAndScheduleLearning(v.kind, v.data, v.id, v.revision)); } catch (e) { return fail(e); } }
