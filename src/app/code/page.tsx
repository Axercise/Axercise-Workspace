import { CodeRoute } from "@/components/code-session";
import { requireSetup } from "@/server/setup";

export default async function CodePage() {
  await requireSetup();
  return <CodeRoute />;
}
