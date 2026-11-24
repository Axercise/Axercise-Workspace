import { requireSetup } from "@/server/setup";
import { LearningWorkspace } from "@/components/learning-workspace";
export default async function LearningPage() { await requireSetup(); return <LearningWorkspace />; }
