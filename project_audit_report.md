# 🔬 NeupBase Dynamic Scheduler — Full Project Audit Report

> **Scope**: Every file in every folder of `c:\OneDrive\Desktop\NeupBase\dynamic_scheduler`
> **Date**: 2026-05-29
> **Method**: Manual code review of all 55+ files, `tsc --noEmit`, `eslint`, `next build`, and dry-run analysis
> **Rule**: NO code edits were made. This document is observation-only.

---

## Build & Toolchain Results Summary

| Check | Result |
|---|---|
| `tsc --noEmit` | ✅ Pass (0 errors) |
| `eslint src` | ⚠️ 1 error (`ComplianceChart.tsx:4` — `any` type) |
| `next build` | ❌ **FATAL** — `supabaseUrl is required` in `/api/cron` |

---

## 🔴 CRITICAL Issues (Build-Breaking / Data-Corrupting)

### C-01: Build Failure — Missing Supabase Environment Variables
- **File**: [.env](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/.env)
- **Problem**: The `.env` file only contains `DATABASE_URL` and `GEMINI_API_KEY`. It is **missing all Supabase and push-notification keys** required by the application:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `CRON_SECRET`
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
- **Impact**: `next build` crashes at the `/api/cron` route because `createClient()` is called at **module scope** (line 8) with `process.env.NEXT_PUBLIC_SUPABASE_URL!` which is `undefined`.
- **Fix Required**: Add all 6 missing variables to `.env` (or `.env.local`).

### C-02: Module-Scope Supabase Client Crashes Build
- **File**: [api/cron/route.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/app/api/cron/route.ts#L8-L11)
- **Problem**: `createClient()` is called at the **top level** (line 8-11), outside any function. During `next build`, this code runs at **compile time** when env vars are not loaded. This immediately throws `supabaseUrl is required`.
- **Fix Required**: Move `createClient()` call inside the `GET()` handler.

### C-03: Prisma + Supabase Dual-Database Architecture Conflict
- **Files**: [prisma/schema.prisma](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/prisma/schema.prisma), [api/schedule/generate/route.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/app/api/schedule/generate/route.ts)
- **Problem**: The schedule generator route uses `PrismaClient` (line 11) to query models like `User`, `FixedCommitment`, and `FloatingRoutine` from the Prisma schema. But **every other route** uses Supabase PostgREST to query completely different tables (`tasks`, `subjects`, `topics`, `push_subscriptions`). The Prisma schema defines models that **do not exist** in any of the 6 SQL schema files, and the SQL schema files define tables that **do not exist** in the Prisma schema.
- **Impact**: The schedule generator cannot work against the Supabase database. The two data layers are completely disconnected.
- **Fix Required**: Unify the data model — either migrate Prisma models into SQL schemas (and use Supabase client everywhere), or generate Prisma schema from the Supabase tables.

### C-04: SQL Schema Files Are Mutually Incompatible
- **Files**: All 6 `supabase_*.sql` files
- **Problem**: Multiple schema files define the **same table names** with **completely different column structures**. Applying all schemas to a single Postgres database is impossible.

| Table | `daily_brief_schema` | `pwa_schema` | `telemetry_schema` |
|---|---|---|---|
| `subjects`/`courses` | `courses(id, name, description)` | `subjects(id, user_id, name, semester_tag, exam_date)` | `subjects(subject_id, user_id, subject_name, midterm_date)` |
| `topics` | `topics(id, course_id, name)` | `topics(id, subject_id, user_id, name, week_number, topic_type)` | `topics(topic_id, subject_id, topic_name, course_week_number)` |
| `tasks` | `tasks(id, user_id, subtopic_id, scheduled_date, status, est_duration)` | `tasks(id, user_id, subject_id, topic_id, title, status, ...)` | N/A (uses `micro_tasks`) |

- **Fix Required**: Consolidate all 6 SQL files into a single unified schema.

### C-05: Edge Function Auth + Payload Mismatch
- **File**: [generate-checkpoints/index.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/supabase/functions/generate-checkpoints/index.ts)
- **Problem 1 (Auth)**: The function calls `supabaseClient.auth.getUser()` (line 35). But it's invoked by `pg_net` from `secure_checkpoint_trigger()`, which sends a `service_role` key — not a user JWT. `getUser()` returns an error for service-role tokens → always returns 401.
- **Problem 2 (Payload)**: The function expects `{ user_id, week_number }` (line 46). But the SQL trigger sends `jsonb_build_object('invocation_timestamp', NOW())` — no `user_id` or `week_number`. Both will be `undefined`.
- **Problem 3 (RPCs)**: Calls 3 RPC functions that **do not exist** in any schema file: `calculate_overall_preparation`, `calculate_subject_coverage`, `get_lagging_topics`.
- **Fix Required**: Rewrite auth logic, fix the trigger payload, and create the missing RPCs.

### C-06: `course-tree/route.ts` Uses `pg` Pool with Incompatible Connection String
- **File**: [api/course-tree/route.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/app/api/course-tree/route.ts#L9-L12)
- **Problem**: Uses `new Pool({ connectionString: process.env.DATABASE_URL })`. The `.env` file has `DATABASE_URL` set to a `prisma+postgres://` URL (Prisma Accelerate format). The `pg` library does **not understand** this protocol — it requires a standard `postgres://` connection string.
- **Impact**: Every call to the course-tree API will fail with a connection error.
- **Fix Required**: Use a standard Postgres connection string or switch to the Supabase client.

### C-07: `course_tree` SQL Query References Non-Existent Column
- **File**: [api/course-tree/route.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/app/api/course-tree/route.ts#L169)
- **Problem**: The GET handler's recursive CTE selects a column `week_number` (line 169, 188, 207). But the `course_tree` table (defined in `supabase_course_tree_schema.sql`) has **no** `week_number` column. The query will fail with `column "week_number" does not exist`.
- **Fix Required**: Either add `week_number` to the schema or remove it from the query.

---

## 🟠 HIGH Issues (Runtime Errors / Security)

### H-01: `TodayStudyBrief.tsx` — `'use client'` Placed After Import
- **File**: [TodayStudyBrief.tsx](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/components/TodayStudyBrief.tsx#L3-L4)
- **Problem**: Line 3 is `import React from 'react';` and Line 4 is `'use client';`. The `'use client'` directive **must be the very first line** of the file. Placing it after an import makes it a no-op string literal, causing the component to be treated as a Server Component. Since it uses `useState`, `useEffect`, and `useCallback`, this will crash at runtime.
- **Fix Required**: Move `'use client';` to line 1.

### H-02: Duplicate `@ts-nocheck` Directives
- **Files**: [chat/route.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/app/api/chat/route.ts#L2-L3), [StudyChatUI.tsx](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/components/StudyChatUI.tsx#L2-L3)
- **Problem**: Both files have `// @ts-nocheck` written **twice** (lines 2 and 3). Harmless but indicates copy-paste error and suppresses all type safety.
- **Fix Required**: Remove the duplicate line.

### H-03: Missing `cookies` Import Usage
- **Files**: [api/metrics/route.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/app/api/metrics/route.ts#L4), [api/tasks/log/route.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/app/api/tasks/log/route.ts#L4)
- **Problem**: Both files `import { cookies } from 'next/headers'` but **never use it**. This is dead code.
- **Fix Required**: Remove unused import.

### H-04: Deprecated Auth Method `getSession()` Used
- **Files**: [api/metrics/route.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/app/api/metrics/route.ts#L17), [api/tasks/log/route.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/app/api/tasks/log/route.ts#L22)
- **Problem**: Both routes use `supabase.auth.getSession()` which is **deprecated** in `@supabase/ssr`. Supabase docs say to use `getUser()` instead, as `getSession()` reads from potentially stale cookies without server-side verification.
- **Fix Required**: Replace `getSession()` with `getUser()`.

### H-05: `proxy.ts` is Not a Valid Next.js 16 Middleware
- **File**: [proxy.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/proxy.ts)
- **Problem**: The file exports `proxy` function and a `config` object. Next.js middleware requires a file named `middleware.ts` at `src/middleware.ts` that exports a **default** function or a function named `middleware`. The file `proxy.ts` with a function named `proxy` will **never be invoked** by the Next.js request pipeline.
- **Impact**: Authentication protection is completely non-functional. All routes are publicly accessible without login.
- **Fix Required**: Rename the file to `middleware.ts` and rename the function to `middleware`.

### H-06: Missing PWA Icon Assets
- **File**: [manifest.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/app/manifest.ts#L14-L25)
- **Problem**: References `/icons/icon-192x192.png` and `/icons/icon-512x512.png`. The `public/` directory contains **no `icons/` folder** — only SVG files and `sw.js`.
- **Also**: The service worker (`sw.js`) references `/icons/badge-72x72.png` which also doesn't exist.
- **Impact**: PWA installation will fail with broken icon references; push notifications will show no icon.
- **Fix Required**: Generate and add the icon files to `public/icons/`.

### H-07: `next-pwa` Uses CommonJS `require()` in ESM-Era Next.js 16
- **File**: [next.config.js](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/next.config.js#L1)
- **Problem**: `const withPWA = require("next-pwa")(...)` uses CommonJS `require()`. `next-pwa` v5.6 is also not maintained and has known incompatibilities with Next.js 14+, let alone Next.js 16. This may produce silent failures during build or development.
- **Fix Required**: Consider migrating to `@ducanh2912/next-pwa` or `serwist` for Next.js 16 compatibility.

### H-08: `$$$` Dollar-Quoting in SQL Function
- **File**: [supabase_schema.sql](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/supabase_schema.sql#L77)
- **Problem**: The `calculate_subject_prep_score` function uses `$$$` as the dollar-quote delimiter (line 77 and 115). While technically valid in PostgreSQL, this is almost certainly a typo (intended `$$`). It's fragile and confusing.
- **Fix Required**: Change `$$$` to `$$` on both lines 77 and 115.

### H-09: Hardcoded Dummy Value in RPC Function
- **File**: [supabase_schema.sql](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/supabase_schema.sql#L93)
- **Problem**: `SELECT 10 as total_tasks` is hardcoded instead of querying real data. The commented-out query references a `study_tasks` table that doesn't exist. This means the prep score **always divides by 10** regardless of actual task count.
- **Fix Required**: Query the actual task count from the correct table.

### H-10: Python API — SSRF Vulnerability
- **File**: [api/python/index.py](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/api/python/index.py#L44)
- **Problem**: `await client.get(payload.file_url)` fetches **any URL** provided by the client. An attacker could pass internal cloud metadata endpoints (e.g., `http://169.254.169.254/latest/meta-data/`) to exfiltrate server credentials.
- **Fix Required**: Validate the URL against an allowlist of Supabase storage domains.

### H-11: Python API — Blocking I/O in Async Endpoint
- **File**: [api/python/index.py](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/api/python/index.py#L52)
- **Problem**: `extract_text_from_file()` is a synchronous function (using `pdfplumber.open()`, `docx.Document()`) called directly in an `async` handler. This blocks the event loop, degrading concurrent performance.
- **Fix Required**: Wrap in `await asyncio.to_thread(extract_text_from_file, ...)`.

### H-12: Python API — Temp File Leak on Exception
- **File**: [api/python/index.py](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/api/python/index.py#L89)
- **Problem**: `await aiofiles.os.remove(temp_path)` runs only on the success path. If any exception occurs between file creation (line 47) and cleanup (line 89), the temp file is **never deleted**.
- **Fix Required**: Move cleanup into a `finally` block.

### H-13: No RLS on Multiple Tables
- **Files**: `supabase_course_tree_schema.sql`, `supabase_telemetry_schema.sql`
- **Problem**: The `course_tree` table and **all tables** in the telemetry schema (`subjects`, `topics`, `micro_tasks`, `weekly_goals`, `task_status_log`, `checkpoint_reports`) have **no RLS policies**. Any authenticated user can read/write any user's data.
- **Fix Required**: Add proper RLS policies to all tables.

---

## 🟡 MEDIUM Issues (Functional Gaps / Code Quality)

### M-01: Duplicate Supabase Server Client Files
- **Files**: [lib/supabase/server.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/lib/supabase/server.ts) and [utils/supabase/server.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/utils/supabase/server.ts)
- **Problem**: These two files are **byte-for-byte identical** (both 857 bytes, both 30 lines). Different API routes import from different paths, creating confusion about which is canonical.
- **Fix Required**: Delete one and update all imports to point to the surviving file.

### M-02: `LoginPage` Creates Supabase Client on Every Render
- **File**: [login/page.tsx](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/app/(auth)/login/page.tsx#L10-L13)
- **Problem**: `createBrowserClient()` is called **inside the component body** (not in a `useMemo` or outside the component). This creates a new Supabase client instance on every single React re-render.
- **Fix Required**: Move outside the component or wrap in `useMemo`.

### M-03: `tracker/page.tsx` Creates Supabase Client on Every Render
- **File**: [tracker/page.tsx](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/app/(dashboard)/(tracker)/tracker/page.tsx#L9-L12)
- **Problem**: Same issue as M-02 — `createBrowserClient()` inside component body. Additionally, `supabase` is in the `useEffect` dependency array (line 42), which triggers an **infinite re-render loop** because each render creates a new client reference.
- **Fix Required**: Move client creation outside the component.

### M-04: `useRealtimeTaskMetrics` — Infinite Re-subscription
- **File**: [useRealtimeTaskMetrics.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/hooks/useRealtimeTaskMetrics.ts#L56)
- **Problem**: `supabase` is created via `createClient()` inside the hook body (line 5) and listed as a `useEffect` dependency (line 56). Each render creates a new client → new reference → effect re-fires → new WebSocket subscription created, old one cleaned up → infinite loop.
- **Fix Required**: Remove `supabase` from the dependency array or memoize the client.

### M-05: `TodayStudyBrief` — Same Infinite Re-render Risk
- **File**: [TodayStudyBrief.tsx](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/components/TodayStudyBrief.tsx#L31)
- **Problem**: `createClient()` is called inside the component body (line 31). It's then used inside `useCallback` with `[supabase]` as a dependency (line 46), which itself is a dependency of `useEffect` (line 50). New client on every render → new callback → new effect → potential loop.
- **Fix Required**: Move client creation outside component or use a stable singleton.

### M-06: Dashboard Page Uses Dark Text on Potentially Dark Background
- **File**: [dashboard/page.tsx](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/app/(dashboard)/page.tsx#L19)
- **Problem**: Uses `text-slate-900` (nearly black text) but the chart component `ComplianceChart.tsx` renders with `bg-slate-900` (nearly black background). The enclosing page has no explicit dark/light styling, so the text may be invisible depending on the global theme.
- **Fix Required**: Align the color scheme.

### M-07: Root `page.tsx` Uses Dummy Hardcoded Data
- **File**: [page.tsx](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/app/page.tsx)
- **Problem**: The main landing page is entirely built with static mock data (lines 14-23) and a fake `handleGenerate` that does nothing but toggle a boolean for 2 seconds (lines 29-32). It never calls any API endpoint.
- **Fix Required**: Wire up to real `POST /api/schedule/generate` endpoint.

### M-08: Layout Metadata Still Has Boilerplate
- **File**: [layout.tsx](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/app/layout.tsx#L15-L18)
- **Problem**: `title: "Create Next App"` and `description: "Generated by create next app"` — still the default Next.js boilerplate.
- **Fix Required**: Update to reflect the actual application identity.

### M-09: Missing `auth/callback` Route
- **File**: [login/page.tsx](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/app/(auth)/login/page.tsx#L19)
- **Problem**: Magic link redirect points to `/auth/callback` but no such route handler exists in the project. After email authentication, the user will land on a 404 page.
- **Fix Required**: Create `src/app/auth/callback/route.ts` that exchanges the code for a session.

### M-10: `gemini-file-manager.ts` — `uploadedFile.uri` May Be Undefined
- **File**: [gemini-file-manager.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/utils/gemini-file-manager.ts#L67)
- **Problem**: `uploadedFile.uri` is used without null-checking (line 67). If the upload fails silently or the API response shape changes, this will return `undefined` as the URI, causing downstream failures.
- **Fix Required**: Add null guard after upload.

### M-11: Gemini Model Names May Be Invalid
- **Files**: [courseTreeGenerator.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/lib/courseTreeGenerator.ts#L93) (`gemini-3.1-pro`), [generate-checkpoints/index.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/supabase/functions/generate-checkpoints/index.ts#L104) (`gemini-3.5-flash`), [chat/route.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/app/api/chat/route.ts#L107) (`gemini-1.5-pro`)
- **Problem**: Three different Gemini model identifiers used across the project. `gemini-3.1-pro` and `gemini-3.5-flash` may not be valid model IDs (depending on release timeline). Inconsistency suggests copy-paste errors.
- **Fix Required**: Verify all model identifiers against the Google AI API and standardize.

### M-12: Outdated Deno Std Library and Supabase Client in Edge Function
- **File**: [generate-checkpoints/index.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/supabase/functions/generate-checkpoints/index.ts#L2-L4)
- **Problem**: Uses `deno.land/std@0.168.0` (very old) and `@supabase/supabase-js@2.7.1` (very old). Modern Supabase Edge Functions use `Deno.serve()` natively.
- **Fix Required**: Update to current versions.

### M-13: Edge Function — No Response Body Null-Checking
- **File**: [generate-checkpoints/index.ts](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/supabase/functions/generate-checkpoints/index.ts#L131)
- **Problem**: `responseJson.candidates[0].content.parts[0].text` — no null-checking. If Gemini returns an empty candidates array or blocked content, this will throw a `TypeError`.
- **Fix Required**: Add defensive null-checks on the response chain.

### M-14: `StackedSubjectProgress.tsx` — `CustomTooltip` Defined After Export
- **File**: [StackedSubjectProgress.tsx](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/components/StackedSubjectProgress.tsx#L84)
- **Problem**: `CustomTooltip` is defined on the same line where the main component's closing brace ends (line 84: `}const CustomTooltip = ...`). While this doesn't cause a syntax error, it's a formatting issue that makes the code fragile and hard to maintain.
- **Fix Required**: Add proper line separation.

### M-15: Widespread `@ts-nocheck` Suppresses All Type Safety
- **Files**: 10+ files have `// @ts-nocheck` at the top
- **Problem**: This disables **all** TypeScript checking for the entire file. Legitimate type errors (wrong argument types, missing properties, null reference) are silently suppressed.
- **Fix Required**: Remove `@ts-nocheck` and fix the underlying type errors properly.

### M-16: Widespread `/* eslint-disable */` Suppresses All Lint Rules
- **Files**: 10+ files have `/* eslint-disable */` at the top
- **Problem**: Same issue as M-15 but for ESLint. Suppresses unused variable warnings, import order, accessibility rules, etc.
- **Fix Required**: Remove blanket disables and fix individual issues.

---

## 🔵 LOW Issues (Cleanup / Best Practices)

### L-01: Orphaned Fix Scripts at Root
- **Files**: `fix-errors.js`, `fix2.js`, `fix3.js`
- **Problem**: Three script files at the project root that appear to be one-time fix utilities. They add clutter.
- **Fix Required**: Delete if no longer needed, or move to `scripts/`.

### L-02: `requirements.txt` May Be Out of Sync
- **File**: [requirements.txt](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/requirements.txt)
- **Problem**: Should be verified against actual imports in `api/python/index.py` (needs `fastapi`, `pdfplumber`, `python-docx`, `python-pptx`, `aiofiles`, `httpx`, `uvicorn`).
- **Fix Required**: Audit and update.

### L-03: `AGENTS.md` and `CLAUDE.md` Are Minimal
- **Files**: `AGENTS.md` (327 bytes), `CLAUDE.md` (11 bytes)
- **Problem**: These appear to be agent instruction files but are very small. May be incomplete or placeholder.
- **Fix Required**: Review and expand if needed.

### L-04: ESLint `any` Type in ComplianceChart
- **File**: [ComplianceChart.tsx](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/components/charts/ComplianceChart.tsx#L4)
- **Problem**: `{ data: any }` — the only ESLint error in the project. Should use a proper type.
- **Fix Required**: Define a proper interface.

### L-05: `globals.css` References Google Font Not Loaded
- **File**: [globals.css](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/src/app/globals.css#L4)
- **Problem**: `--font-sans: "Inter", ...` but the Inter font is **never imported** (neither via `@import` in CSS nor via `next/font` in the layout). The layout loads `Geist` and `Geist_Mono` instead.
- **Fix Required**: Either import Inter or change the CSS variable to match the loaded fonts.

### L-06: UUID Extension Inconsistency Across SQL Files
- **Problem**: `supabase_pwa_schema.sql` uses `uuid-ossp` (`uuid_generate_v4()`), while `supabase_chat_sessions_schema.sql` uses `pgcrypto` (`gen_random_uuid()`). Should standardize on `gen_random_uuid()` (built-in since PostgreSQL 13).

### L-07: `Obsidian_Vault_Export` Not in `.gitignore`
- **File**: [.gitignore](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/.gitignore)
- **Problem**: The generated export directory will be committed to git if not excluded.
- **Fix Required**: Add `Obsidian_Vault_Export/` to `.gitignore`.

### L-08: Missing `lint` directory for `next lint`
- **Problem**: Running `npx next lint` fails because it looks for a `lint` directory that doesn't exist. The `package.json` `lint` script is configured as just `"eslint"` (without pointing at `src`), which may not match the expected behavior.
- **Fix Required**: Update `"lint"` script to `"eslint src"` or `"next lint --dir src"`.

### L-09: `@supabase/auth-helpers-nextjs` is Deprecated
- **File**: [package.json](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/package.json#L17)
- **Problem**: `@supabase/auth-helpers-nextjs@0.15.0` is installed but **deprecated** in favor of `@supabase/ssr` (which is also installed). No code imports from it.
- **Fix Required**: Remove the deprecated package.

### L-10: `@types/web-push` in Dependencies Instead of DevDependencies
- **File**: [package.json](file:///c:/OneDrive/Desktop/NeupBase/dynamic_scheduler/package.json#L20)
- **Problem**: `@types/web-push` is a type-only package and should be in `devDependencies`.
- **Fix Required**: Move to `devDependencies`.

---

## Summary by Severity

| Severity | Count | Status |
|---|---|---|
| 🔴 CRITICAL | 7 | Build-breaking or data-corrupting — must fix before deploy |
| 🟠 HIGH | 13 | Runtime crashes, security holes, or broken features |
| 🟡 MEDIUM | 16 | Functional gaps, code quality, infinite loops |
| 🔵 LOW | 10 | Cleanup and best practices |
| **TOTAL** | **46** | |

---

## Recommended Fix Priority Order

1. **Add missing env vars** (C-01) → unblocks everything
2. **Move `createClient()` inside handler** in `cron/route.ts` (C-02) → unblocks build
3. **Fix `proxy.ts` → rename to `middleware.ts`** (H-05) → enables auth
4. **Create `auth/callback` route** (M-09) → enables login flow
5. **Fix `'use client'` placement** in `TodayStudyBrief.tsx` (H-01) → prevents crash
6. **Fix infinite re-render loops** (M-03, M-04, M-05) → prevents UI freezes
7. **Unify SQL schemas** (C-04) → enables database setup
8. **Fix `course-tree/route.ts` connection string** (C-06) → enables course tree API
9. **Fix edge function** (C-05) → enables checkpoint reports
10. **Reconcile Prisma ↔ Supabase** (C-03) → enables schedule generator
