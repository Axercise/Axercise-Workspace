# Development workflow

`main` contains the version accepted by the owner. The first upload establishes this baseline.

All later changes start on `test`:

```powershell
git switch test
git pull --ff-only origin test
```

Implement and verify changes, review the staged files for credentials or personal data, then commit and push to `test`. Show the owner what changed and how it was verified. Keep the work on `test` while awaiting the owner's explicit confirmation that the reviewed changes passed.

That confirmation authorizes merging the reviewed changes into `main` and pushing; a second approval is unnecessary. Automated tests do not replace the owner's confirmation. Do not enable automatic merging. Return to `test` before starting another change.

## Local data

The repository stores application source, documentation and dummy test fixtures. `.axercise/` contains private service keys, OAuth tokens, bot credentials, Hermes sessions and memory, uploaded documents and local application data. It must remain local. Environment files, private keys, databases, logs, build output and test screenshots are excluded by `.gitignore` as well.

Configure connected accounts through the application on each installation. Do not paste real credentials into source, documentation, issues, pull requests or commit messages. Use placeholders in examples and review staged content before every push.

## Verification

Use checks appropriate to the change. Existing commands include `npm run typecheck`, `npm test` and `npm run build`. On a machine with limited memory, run the suite sequentially:

```powershell
node --import tsx --test --test-concurrency=1 tests/*.test.ts
```

Live integration checks require the owner's locally configured accounts; credentials and personal data must not be uploaded to make them run elsewhere.
