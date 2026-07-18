# Instructions for the coding agent

Read SPEC.md fully before any work. It is the single source of truth; all technology decisions in it are final.

Rules:
- Implement ONE milestone at a time (SPEC.md §8), in order. Do not begin a milestone until the previous one's acceptance criteria pass.
- Do NOT add anything listed in SPEC.md §9 (Non-Goals).
- Security requirements in §10 are blocking, not optional.
- After each milestone, run the test suite and print the milestone's acceptance-criteria checklist with an explicit PASS/FAIL for each item, plus evidence (test names or command output).
- If an acceptance criterion cannot be verified without external credentials (R2, Resend), implement against the real SDKs per the spec, but provide a dev-mode fallback ONLY where the spec explicitly allows it (e.g. "log link in dev" for verification emails), and say clearly which criteria are pending real credentials.

Local environment facts:
- PostgreSQL 16 runs locally via Homebrew (`brew services`), superuser is the local macOS user (no password), host `localhost:5432`. Databases `sales_job_board` (dev) and `sales_job_board_test` (tests) already exist. CLI tools are keg-only: use `/opt/homebrew/opt/postgresql@16/bin/psql` etc.
- Keep secrets in `.env` (gitignored) loaded via dotenv; `.env.example` documents every variable from SPEC.md §3.
- Node 22 / npm 10 are installed.

Workflow:
- Commit your work with a descriptive message when the milestone's checklist is done.
- Never store binary data in Postgres. Never expose original proof uploads publicly.
