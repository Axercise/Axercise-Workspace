<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Git workflow — user instruction

- The initial upload of the existing workspace to `main` is authorized.
- For every subsequent change, check out `test` before editing; commit and push work to `test`.
- Treat `main` as the accepted version. Merge `test` into `main` and push `main` only after the user explicitly confirms that the particular reviewed changes passed. Under this workflow that confirmation authorizes their merge; do not ask for a second approval.
- Passing automated tests alone does not authorize a merge. Do not enable automatic merging or bypass the user's confirmation.
- Keep local credentials, `.axercise/`, Hermes profiles/memory/sessions, uploaded study files, runtime logs and generated screenshots out of Git. Never add ignored files with `git add -f`.
- Before every commit or push, review the staged filenames and changes for secrets. Scan for the machine's configured credentials without printing their values. Publish source, documentation and dummy test fixtures only.
