import { connection } from "next/server";
import { setupStatus } from "@/server/setup";
import { MachineSetup } from "@/components/machine-setup";

export default async function SetupPage() {
  await connection();
  return <MachineSetup initial={setupStatus()} />;
}
