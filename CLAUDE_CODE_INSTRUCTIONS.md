# CLAUDE_CODE_INSTRUCTIONS.md — How to Use Claude Code on doddl-pm
**For:** Jon Fawcett | **Version:** 1.0 | **April 2026**

---

## Prerequisites — Complete Before Opening Claude Code

- [x] staging branch exists in D0DDL/doddl-pm
- [x] doddl-pm-staging Supabase project exists with schema applied
- [x] .env.local exists in repo root with staging values
- [x] Vercel staging environment configured with staging env vars
- [x] CLAUDE.md committed to staging branch
- [ ] Azure redirect URI added for staging Vercel URL (complete after first deploy)
- [ ] Claude Code installed: npm install -g @anthropic-ai/claude-code

---

## Installing Claude Code

npm install -g @anthropic-ai/claude-code

Verify: claude --version

---

## Starting a Session

Step 1 — Navigate to repo in terminal:
cd C:\Users\JonFawcett\Documents\doddl-pm
git checkout staging
git pull origin staging

Step 2 — Confirm staging branch:
git branch
(should show: * staging)

Step 3 — Open Claude Code:
claude

Step 4 — Run setup verification (paste this as first message):

Before we do anything else, run the setup verification checklist.
Read CLAUDE.md in full, then confirm the following one by one:
1. Confirm you are on the staging branch — run: git branch
2. Confirm .env.local exists and NEXT_PUBLIC_SUPABASE_URL contains iknwprxycshrickpswjz — do not print the value, just confirm
3. Confirm node_modules exists — if not run: npm install
4. Run: npm run build — confirm zero errors
5. Run: npm run dev and confirm app starts on localhost:3000
6. Test Supabase connection — SELECT COUNT(*) from projects on staging, confirm it returns a result
7. Confirm staging Supabase URL is different from any production URL in git history
8. List every file in the repo

Report each as PASS or FAIL. If anything FAILs, stop and tell me what needs fixing.

---

## Expected Passing Verification Output

VERIFICATION CHECKLIST
1. Git branch: PASS — on staging
2. .env.local: PASS — staging URL confirmed
3. node_modules: PASS
4. npm run build: PASS — no errors
5. npm run dev: PASS — starts on localhost:3000
6. Supabase connection: PASS — returned 0 rows
7. Staging isolation: PASS — distinct from production
8. File structure: [lists files]
All checks passed. Ready to begin Task 1.

---

## Starting Task 1

Once verification passes, paste this:

Verification passed. Begin Task 1 — Codebase Decomposition, as defined in CLAUDE.md.
Before writing any code:
1. Read pages/index.js in full
2. List every distinct UI concern you identify
3. Confirm proposed structure matches CLAUDE.md
4. Wait for my confirmation before extracting first component
Work one component at a time. After each: confirm file exists, index.js updated, npm run build passes, no logic changed.

---

## Starting Task 2

Task 1 complete and confirmed. Begin Task 2 — Agent API Access Layer, as defined in CLAUDE.md.
Before writing any code:
1. Confirm Task 1 acceptance criteria all met
2. Propose AGENT_SERVICE_KEY env var — format and usage
3. Show proposed SQL migration for agent_audit_log
4. Wait for confirmation on both before proceeding.

---

## Starting Task 3

Task 2 complete and confirmed. Begin Task 3 — Approval Artefact Model, as defined in CLAUDE.md.
Before writing any code:
1. Confirm Task 2 acceptance criteria all met
2. Show proposed SQL migration for tasks table additions
3. Show draft of lib/artefactTypes.js with two example types
4. Wait for confirmation before proceeding.

---

## Starting Task 4

Task 3 complete. Begin Task 4 — RLS Policies, as defined in CLAUDE.md.
Before writing any code:
1. Confirm Tasks 1-3 all met
2. Produce complete migration SQL for all three policy levels
3. Identify every query touching the database and confirm each works under new policies
4. Wait for my review before I apply to staging.

---

## Approving SQL Migrations

When Claude Code proposes a migration:
1. It creates lib/migrations/[task]-[description].sql
2. You read it. If correct, say: Migration approved — applying now
3. Go to Supabase dashboard > staging project > SQL Editor > paste > Run
4. Tell Claude Code: Migration applied. Continue.
Never ask Claude Code to apply migrations directly.

---

## New Session Mid-Task

Claude Code has no memory between sessions. Start each new session with:
Read CLAUDE.md. We are on Task [X].
Last completed: [describe last step].
[Paste relevant acceptance criteria]
Continue from where we left off.

---

## Hard Stop Triggers

If Claude Code proposes touching main branch or production Supabase — stop immediately.
Type Ctrl+C, then: Re-read CLAUDE.md. Explain why you proposed touching [main/production].

---

## MVP Complete When

- [ ] Task 1: npm run build clean, monolith decomposed
- [ ] Task 2: Agent API routes live in staging, audit log populated
- [ ] Task 3: Approval task visible in staging UI with all fields
- [ ] Task 4: RLS policies applied, staging tested, Jon approved production deploy
