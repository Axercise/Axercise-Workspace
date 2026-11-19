import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, localRequest } from "@/server/http";
import { sourceSearch } from "@/server/learning-files";
export const dynamic = "force-dynamic";
export async function GET(req: Request) { try { localRequest(req); const url = new URL(req.url), id = z.uuid().parse(url.searchParams.get("course")), query = z.string().max(1000).parse(url.searchParams.get("q") || ""), result = sourceSearch(id, query); return NextResponse.json({ ...result, sources: query.trim() ? result.sources.filter(s => s.score > 0) : result.sources }); } catch (e) { return fail(e); } }
