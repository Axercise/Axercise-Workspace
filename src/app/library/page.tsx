import { requireSetup } from "@/server/setup";
import { SavedLibrary } from "@/components/saved-library";
export default async function LibraryPage() { await requireSetup(); return <SavedLibrary />; }
