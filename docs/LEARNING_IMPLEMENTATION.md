# Learning module

Implemented on 17 November 2026 for this Windows computer, following Project_Plan.md phases 5–10. User acceptance and live Google/Discord setup remain outstanding. Detailed evidence is in VERIFICATION.md.

## Components and storage

- `/learning`: terms/courses, four course tabs, study area, archive, restore preview and Notion conflict decisions. Neutral gray/black/white UI follows Workspace.
- `src/lib/learning.ts`: shared schemas, grades, homework/study status semantics, focus timing and review intervals.
- `src/server/learning-store.ts`: local catalog, revisions, ownership and immutable file references, submission history and study-plan edit history.
- `.axercise/learning/catalog.json`, immutable `files/<uuid>`, extracted `text/<uuid>.json`. Files stay on this PC; service is loopback-only.
- `learning-notion.ts`: manual metadata sync to Axercise · Learning, recovery IDs and explicit conflicts. Database is connected and empty for the user's courses.
- `learning-integrations.ts`: two-way linked Tasks, retryable pending changes, idempotent plan-to-task conversion and stable Calendar event IDs.
- `learning-reminders.ts`: unsubmitted homework, exams and due review sets; shared keys prevent duplicate linked-service reminders. Discord setup is required to send them.
- `learning-backup.ts`: ZIP manifest/checksums, preview and revision fencing; repairs missing/corrupted originals, retaining damaged bytes in `recovered-originals/`. Rejects version-ID/content collisions.
- Five learning MCP tools share the UI's services: list, read, search, save and link to Tasks/Calendar.
- Document DELETE uses a revision-checked confirmation. File payloads/indexes are removed; minimal deleted catalog records retain citation history and prevent resurrection during Notion sync. Locked-file removal retries on later reads. Old backups restore deleted files only with an explicit restore choice.
- Assignments can opt into To-do and select any Eisenhower quadrant. Priority flags, titles, deadlines and completion sync both ways; course links are included in task responses. Task edits preserve a time-specific deadline when its date is unchanged. Concurrent sync requests serialize and reuse the same task.

## Documents and AI

- `npm run setup:learning` installs pinned PyMuPDF 1.28.2 at `%LOCALAPPDATA%/Axercise/runtimes/learning-python`; override with AXERCISE_LEARNING_PYTHON. Runtime/user files are excluded from Next output tracing.
- PDF/image preview, downloads/ranges, Office/text extraction, version notes, per-version bookmarks/reading positions and checksum recovery warnings.
- Limits: file 50 MiB, PDF 500 pages, extracted text 2 million characters, ZIP 256 MiB. Uploaded ZIP/code files are stored, never executed.
- `learning-ai.py` uses the selected provider with tools and profile-memory loading disabled for document generation. Ordinary agent memory remains persistent and separate.
- Ask/summary cite actual file/version/page; OCR reads a selected page. Retrieval supplies at most 10 excerpts and shows coverage.
- Rubric review distinguishes student work from references and forces uncertain checks without work excerpts. Suggestions open for editing before saving.
- Study sets have chapter/tags, cards/quiz, answer history and spaced review. Weak cards and teacher feedback can become review sets/tasks.
- Editable exam plans retain change history. Focus sessions recover timestamps/pauses/draft notes and show a seven-day summary with links to work.

## Verification

- 39 automated tests pass: 23 learning and 16 existing tests. TypeScript and Next 16.4.5 production build pass.
- Real API/browser/ChatGPT/Notion/MCP checks: VERIFICATION.md and `test-results/learning-verification.json`.
- Screenshots `test-results/learning-*.png` use isolated fixtures. Production catalog starts empty; tracked live Notion fixture pages were archived.
- Google/Discord account, notification and cross-channel session tests await credentials. OpenRouter has no key yet. The user still needs to review answers/plans with real course materials.
