import { requireSetup } from "@/server/setup";
import { DailyBriefing } from "@/components/daily-briefing";
export default async function BriefingPage() { await requireSetup(); return <DailyBriefing />; }
