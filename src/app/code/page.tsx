import { CodeWorkspace } from "@/components/code-workspace";
import { requireSetup } from "@/server/setup";

export default async function CodePage() {
  await requireSetup();
  return <CodeWorkspace />;
}
