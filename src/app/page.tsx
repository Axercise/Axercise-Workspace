import { requireSetup } from "@/server/setup";
import { Workspace } from "@/components/workspace";
export default async function Page() { await requireSetup(); return <Workspace />; }
