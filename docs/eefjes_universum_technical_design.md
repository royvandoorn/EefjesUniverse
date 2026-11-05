# Eefje's universum — Technical Design

**Version:** 1.0  
**Status:** Phases 1–5 implemented; PC/phone testing reported for phases 1–4; phase 5 additions (text elements, drafts, session recovery) await phone verification; release gates tracked below

**Date:** 5 November 2026

**Source:** [Product Requirements Document v1.0](./eefjes_universum_requirements.md)

## 1. Scope and design assumptions

Build one private, free-form scrapbook board with shared viewer/editor passwords, notes, photographs, checkable lists, visual groupings, touch-friendly positioning, and automatic persistence.

This document began as a proposed design. Phases 1–4 now have an implementation; the checkpoint in section 12.4 distinguishes reported verification, deferred phase 5 work and outstanding release checks. Earlier proposed details are not all descriptions of the current code.

Include captions and visual groupings because the PRD MVP checklist includes them, despite some detailed requirements marking them Should-have. Plan resizing, optional note titles, note colours and image replacement as Should-have features; record any release deferral explicitly. Operational backups are included; a user-facing export interface remains optional.

Exclude individual accounts, collaboration, multiple boards, public sharing, drawing, filtering, AI and advanced history. Runtime category creation and stacking-order controls are deferred Could-haves.

**Simplicity principle (review decision):** this is a personal gift for one likely-only user. Prefer the simplest solution that satisfies the Must requirements over the most robust or scalable one. Where this document describes two implementation phases, build the simple first version and defer the advanced parts. Do not add infrastructure "for later" that the MVP does not need.

## 2. Architecture

### 2.1 Recommended stack

| Layer | Proposed choice | Reason |
| --- | --- | --- |
| Frontend | React, TypeScript, Vite | Small, typed interactive application |
| Styling | Tailwind CSS and CSS variables | Responsive styling and personal design tokens |
| Hosting/API | Vercel static hosting and Node.js serverless functions | Same-origin HTTPS without an always-running server |
| Database | Supabase PostgreSQL | Transactions, relational constraints, managed persistence |
| Images | Private Supabase Storage | Persistent binaries separate from database rows |
| Authentication | Shared-password verification and opaque database-backed sessions | Direct match for two shared access roles |
| Validation | Shared schemas, proposed Zod | Shared shapes with authoritative server validation |
| Processing | Proposed Sharp | Decode validation, orientation, metadata removal, derivatives |
| Tests | Vitest, React Testing Library, Playwright | Unit, component, integration and browser coverage |

These packages are not installed. Choose supported stable versions, check runtime compatibility and commit a lockfile during implementation. Vercel is preferred over Cloudflare for the proposed Node hashing/image libraries; Cloudflare would require a runtime compatibility review. Supabase Auth is unnecessary for shared passwords.

```text
Browser: React application and in-memory drafts
        |
        | HTTPS /api/*, same origin, HTTP-only cookie
        v
Vercel Node functions
  sessions, roles, validation, transactions,
  image processing, authenticated media delivery
        |                         |
        v                         v
Supabase PostgreSQL       Private Supabase Storage
content and sessions      staging and derivatives
```

The browser never receives privileged Supabase credentials or directly reads tables. All personal content and media reads pass through authenticated functions. Static assets contain application code/login UI only, not embedded personal data.

### 2.2 Proposed module layout

```text
src/app/                 shell and authentication state
src/features/auth/       login and expiry flows
src/features/board/      viewport, placement, drag, resize, groups
src/features/elements/   note, picture and list views/editors
src/features/saving/     drafts, mutation queue, save indicators
src/shared/              schemas, API client, design tokens
api/                     thin HTTP handlers
server/auth/             hashing, sessions, shared role guards
server/db/               transactional persistence
server/media/            processing, delivery, cleanup
supabase/migrations/     schema, constraints, policies, functions
scripts/                 password administration, backup, restore
tests/                   integration and browser fixtures
```

## 3. Authentication and privacy

### 3.1 Passwords

Store two distinct Argon2id hashes in a protected credential table. One login input accepts either password; check both hashes and return a generic failure. To avoid leaking which role matched via timing differences, always verify against both hashes and use the hash library's constant-time comparison; do not return early on the first match. Reject identical viewer/editor passwords during administration.

Keep authentication fully separate from the frontend and from content logic: exactly one central `requireSession` function and one `requireEditor` guard used by every handler. Implement and test this layer standalone — including anonymous and viewer calls to every endpoint — **before** building content features on top of it.

Configure and rotate passwords through a deployment administrator command using hidden interactive input. Never put plaintext passwords in command arguments, URLs, migrations, logs or client configuration. No public reset endpoint or administrative web UI is required.

Rate limit login attempts simply: a durable counter in the database (not in-memory, which resets per serverless instance) — e.g. five failures per source address per 15 minutes triggers a temporary block. Keep it simple; a site-wide circuit breaker is optional.

### 3.2 Sessions

Generate a random opaque token. Store its SHA-256 digest, role and expiry timestamp. Deliver the raw token only in a production cookie:

```text
__Host-eefje_session=<opaque>; Secure; HttpOnly; SameSite=Strict; Path=/
```

No Domain attribute, localStorage tokens or session-bearing URLs. Document local HTTPS or a development-only cookie configuration.

Keep expiry simple: sessions expire after a fixed period (proposed: 7 days for both roles). Check expiry on every protected request. Login creates a fresh token; logout revokes it. Password rotation deletes that role's sessions, leaving the other role unchanged — no credential-generation bookkeeping needed.

**Caveat:** a 7-day editor session left open on a shared computer keeps editing access for a week. If Eefje ever uses shared devices, prefer a shorter editor expiry or idle timeout — see section 11. A visible "log out" button on the board mitigates this cheaply.

### 3.3 Authorization

| Operation | Anonymous | Viewer | Editor |
| --- | --- | --- | --- |
| Login shell/login endpoint | Allowed, throttled | Allowed, throttled | Allowed, throttled |
| Board and media reads | Denied | Allowed | Allowed |
| Own session/logout | No board data | Allowed | Allowed |
| Create/edit/delete/move/resize | Denied | Denied | Allowed |
| Toggle list completion | Denied | Denied | Allowed |
| Upload/finalize/replace image | Denied | Denied | Allowed |
| Password administration/restore | Administrator only | Denied | Denied |

Use the shared `requireSession` and `requireEditor` guards for every handler. Check every supplied element/item/group/media ID belongs to the configured board. UI restrictions are not security boundaries. Test every endpoint explicitly as anonymous and as viewer — this is a release gate.

Enable table RLS with no public/browser access policies. Private storage has no public read/write policies. Backend service credentials bypass RLS, so role checks in every handler remain mandatory. Never expose privileged credentials through `VITE_*` variables.

### 3.4 Other controls

- Verify exact Origin and session-bound CSRF token for mutations; require JSON except explicit upload routes. No permissive CORS.
- Render content as text, never injected HTML; rich text is excluded.
- Personal API/media responses use `Cache-Control: private, no-store`; exclude them from CDN/service-worker caching. No offline cache.
- Use restrictive CSP, `frame-ancestors 'none'`, nosniff, no-referrer and HSTS after HTTPS setup.
- Send `X-Robots-Tag: noindex, nofollow, noarchive`, HTML robots metadata and robots disallow rules. No sitemap. Authentication, not obscurity/indexing directives, protects content.
- Log request IDs, operation, status and duration, not passwords, cookies, note/list text, upload capabilities or image bytes. Disable body capture in monitoring.
- No analytics, advertising or external image embeds. Viewers can still copy/screenshot accessible content.

## 4. Persistent data model

**Decision (review):** keep the schema simple — one `elements` table with a `type` column and a validated JSONB `content` field, instead of separate child tables per content type plus database triggers enforcing one-child-per-element. That earlier variant was over-engineered for three content types on a personal board. List items stay relational because they are individually toggled and ordered; media stays in its own table because of its lifecycle.

Use UUIDs, UTC timestamps, foreign keys, database checks and migrations. Seed one board; derive its ID server-side.

| Table | Principal fields |
| --- | --- |
| `boards` | ID, title, minimum width/height, validated settings, timestamps |
| `elements` | ID, board ID, type (`note`, `image`, `list`), x/y, width/height, z-index, optional group ID, revision, JSONB `content`, timestamps |
| `list_items` | ID, parent element ID, text, completed, integer position |
| `visual_groups` | ID, board ID, name, colour key, x/y, width/height |
| `media_assets` | ID, board ID, storage key(s), MIME, dimensions, byte count, lifecycle status, timestamps |
| `access_credentials` | Role PK, password hash, timestamps |
| `sessions` | Unique token digest, role, expiry timestamp |
| `login_throttles` | Key, window, counter, blocked-until |

JSONB `content` per type (validated with the shared schema on every read/write):
- `note`: `{ title?, body, colourKey }`
- `image`: `{ mediaId, caption? }` — `mediaId` references `media_assets`
- `list`: `{ title }` — items live in `list_items`

Validate `content` server-side on every mutation; the JSONB field is a convenience, not a trust boundary. List items and their parent form one versioned aggregate; any item mutation increments the parent element's revision.

Constraints: finite non-negative coordinates, bounded positive dimensions, trimmed non-empty list titles/items, same-board references. Groups are optional backgrounds, not containers: deleting one does not move or delete cards.

Proposed limits: note body 10,000 characters; titles 120; captions 1,000; item text 500; 200 items/list; 500 elements/board; 20 groups. Validate server-side; return actionable errors without silent truncation.

Index elements/groups by board, items by parent/position, sessions by digest/expiry. `list_items` cascade on element deletion. Media files are deleted *after* the database commit that removes their reference (see section 8), with a best-effort retry — never inside the same transaction.

## 5. HTTP API

All endpoints are same-origin. Errors use `{error:{code,message,requestId,details?}}`, without SQL/stack traces. Statuses: 400 malformed, 401 expired/missing session, 403 role/CSRF/origin denied, 404 unavailable, 409 conflict, 413 oversized, 415 unsupported media, 422 invalid fields, 429 throttled.

| Method/path | Access | Contract |
| --- | --- | --- |
| `POST /api/auth/login` | Public | Password; sets cookie, returns role/CSRF token |
| `GET /api/auth/session` | Authenticated | Role, expiry, CSRF token; never raw token |
| `POST /api/auth/logout` | Authenticated | Revoke session and clear cookie |
| `GET /api/board` | Viewer/editor | Board, groups, typed elements/items, revisions and media IDs |
| `POST /api/elements` | Editor | Client UUID, type, geometry and typed content |
| `PATCH /api/elements/:id` | Editor | Expected revision and changed content/layout |
| `DELETE /api/elements/:id` | Editor | Expected revision; delete aggregate and queue cleanup |
| `PUT /api/elements/:id/items` | Editor | Expected parent revision, ordered item array |
| `POST /api/media/uploads` | Editor | Size/type; expiring ticket and staging upload capability |
| `POST /api/media/uploads/:id/complete` | Editor | Validate/process; return ready media ID and dimensions |
| `GET /api/media/:id/:variant` | Viewer/editor | Authorize then stream attached display/thumbnail bytes |

Mutations return canonical data and revision. Attach ready media when creating a picture; replacement patches its media ID. Groups are initially seeded through administration; runtime category editing is deferred.

Keep idempotency simple: updates compare-and-swap on revision, so a stale or retried update fails safely with 409 and the client refetches. Creation uses client-generated UUIDs so a retry of the same create is harmless.

## 6. Canvas and responsive interactions

Use an accessible DOM surface with absolutely positioned cards, not a bitmap canvas. World coordinates are CSS pixels independent of viewport size. Start at 2400 × 1600 pixels; expand to the furthest element/group edge plus 160 pixels padding, capped at a configurable 12,000 pixels/axis.

Scroll both axes; mobile never rewrites saved coordinates. No custom zoom initially; preserve browser pinch zoom.

**Mobile is the biggest risk.** Build and test the basics first — drag, auto-placement, scroll, edit, save — on a real phone before adding anything else. A "Find content" list/drawer (titles and text previews that scroll a card into view) is a useful fallback if a 2400×1600 board proves disorienting on a small screen, but it is a second-phase addition, not part of the first canvas build.

Place new cards near the visible world-space centre. Try a bounded free-rectangle grid search, then allow overlap with an offset. Groups render behind cards without intercepting pointers. Zero groups remains usable.

- Pointer Events and pointer capture on visible drag handles; `touch-action: none` only on drag/resize handles, preserving native scrolling elsewhere.
- Movement threshold separates click/drag. Suppress editing clicks after drag. Inputs and checkboxes never initiate drag.
- Update transient transforms at animation-frame cadence and persist on release, not every pointer event. Escape/pointer cancellation cancels.
- Edge auto-scroll allows moving beyond the viewport; coordinate conversion includes scroll offsets.
- Resize handles plus keyboard-accessible dimension controls; images retain aspect ratio by default. Proposed card widths 200–900 pixels with bounded heights.
- Long content scrolls within cards; desktop dialogs/mobile sheets provide full editing. One editor at a time. “Done” closes, not the only save action.
- Confirm card deletion/image replacement. Stable stored stacking order; explicit reorder controls deferred.
- Viewer cards expose no editing controls and completion is read-only.

Provide keyboard move/resize alternatives, labelled controls, visible focus, sufficient contrast, preferred 44-pixel touch targets, live save announcements, dialog focus management and reduced-motion support. Nothing essential depends on hover.

## 7. Autosave, client state and failures

Separate canonical server data from local drafts using a small reducer/context and API client. No real-time subscription or heavy state framework is initially needed.

Track saved/dirty/saving/failed/conflict per aggregate. Debounce text about 600 ms; queue completion changes immediately and geometry at interaction end. Serialize writes per element, coalesce unsent edits and use the latest acknowledged revision. Old responses must not overwrite newer typing.

Display persistent “Saving…”, “Saved” and “Not saved — retry”. Retry transient errors with bounded exponential backoff/jitter; stop on authorization, validation or conflict errors. Retain drafts in memory and keep editors open. Session expiry offers login without discarding the draft, then revalidation before resuming.

On 409 fetch current server data and retain local edits separately; offer discard/reload or explicit reviewed reapply. Multiple tabs can conflict despite one intended editor. Do not silently use last-write-wins.

Warn before navigation while dirty and flush on explicit navigation/page hiding where practical.

**Local drafts (review decision):** store *only unconfirmed changes* in IndexedDB as drafts, clearly distinguished in the UI from server-saved content ("not yet saved"). On reload, restore drafts and retry saving. Once the server acknowledges a change, delete the local draft immediately. If a draft is left behind (e.g. the element was deleted elsewhere or the server rejects it), offer the user an explicit choice to **retry or discard** the draft — never silently drop it and never keep retrying forever. This closes most of the DATA-09 gap (crash/refresh before acknowledgement) at low cost. Never mark an unacknowledged change "Saved".

Viewers get snapshots/manual refresh. Revalidate on tab return without replacing dirty editor drafts.

## 8. Image handling

**First version (MVP):**
- Accept JPEG/PNG/WebP up to ~10 MiB. Reject other types clearly. **Check first which formats Eefje's phone actually produces** — if it's HEIC, either support conversion or document that she selects JPEG in camera settings.
- Upload via the serverless function (file up to the provider's body limit) or directly to private storage with a short-lived upload URL — pick whichever the provider supports most simply.
- Validate the file actually is an image (magic bytes / decode), strip EXIF/GPS, re-encode to a reasonable display size (max ~2400 px), store in the private bucket.
- Serve images through the authenticated media endpoint — no public URLs.
- On deleting a picture: **first commit the database change, then delete the file**. Database and storage are separate systems — if the file delete fails after the DB commit, the board stays consistent and the file is simply orphaned. Retry the file deletion best-effort (e.g. on next delete request or a lightweight periodic check that removes storage files with no `media_assets` row). No complex job queue needed.

**Second version (only if needed):** thumbnails as separate variants, staging buckets with ticket lifecycle, automated cleanup jobs, retries, HEIC support.

**Verify in a prototype before building:** that the chosen combination of Vercel Node functions + Sharp + Supabase upload actually works within memory/time/body limits. This is the riskiest technical assumption — test it early with a real photo from Eefje's phone.

Board cards use lazy loading, explicit dimensions and placeholders. Broken images do not block notes/lists.

## 9. Visuals and performance

Use shared tokens for palette, typography, spacing, shadows and radii. Distinguish paper notes, photo frames and checklists. Decoration is non-interactive and hidden from assistive technology where appropriate. Confirm language, background, fonts, colours and group names; do not invent personal starting content.

Render text/card shells before images. Avoid original-sized downloads, heavy graphics libraries and whole-board rerenders during drag. Profile at the 500-card cap before introducing virtualization.

Proposed targets, not measured claims: usable board within three seconds on a representative mobile connection with 50 mixed cards; drag near device refresh rate on agreed hardware; no per-pointer network writes; immediate failure indication when detected. Record dataset, network, device and cold-start conditions.

### 9.1 Standalone text elements — planned phase 5 addition

Implement PRD TEXT-01–05 as a fourth element type, `text`, using the existing element geometry, revision, autosave and editor/viewer authorization model. This is a planned schema/API/UI extension, not an already supported type and not a missing phase 4 feature.

- Proposed validated content: `{ body, fontSize, colourKey, alignment }`. Keep text plain (no injected HTML), reuse the note-body length limit, bound font size to a useful heading range and validate alignment and colour against allowlists. Choose the exact size range and palette during phase 5 styling.
- Extend shared type/content schemas, database type/content constraints and API validation/read mapping together. Preserve compatibility with existing notes, lists and images; do not disguise text as transparent notes. Continue server-enforced board scoping and editor-only mutations.
- Render text directly on the board without a paper background, border or frame. Show move/resize/edit controls only to editors, with touch and keyboard alternatives. Provide font-size, colour and alignment controls. Viewers see styled text only.
- Headings label nearby cards visually; they do not create group membership or change surrounding cards' coordinates. Keep visual-group backgrounds as a separate concept.
- Initialize one “Eefje's universum” text element centred near the initial 2400 × 1600 board's middle (1200, 800 world pixels). Use an explicitly applied, one-time migration or setup action that does not overwrite existing content. Do not create it during page load, recenter it as the board expands, or recreate it after user deletion. It remains editable and movable.
- Test text CRUD, style/geometry persistence, viewer denial, plain-text rendering, phone readability and one-time title initialization. Broader note/list font-size choices are also phase 5 work.

## 10. Deployment, cost and recovery

### 10.1 Environments and release

Isolate local/test/production databases/buckets. Previews never inherit production content/credentials. Use synthetic development content. Select an appropriate data region and nearby compute where available.

Server-only configuration: Supabase endpoint/backend secret, board ID, canonical origin, throttle hashing secret and scheduled-job secret. Keep hashes/generations in protected tables. Ignore local secret files; use hosting secret management and commit placeholders only.

Setup: scaffold/lock dependencies → apply schema/policies/private buckets → seed board/groups → configure passwords privately → configure HTTPS/headers/API routing → verify runtime/uploads/scheduler → test staging and restore → deploy stable provider URL → repeat production role/privacy tests → private handover.

CI gates: typecheck, unit/component tests, API/database tests, browser tests and production build. Concrete package scripts will be defined during implementation; none exist yet. Back up before destructive migrations. Roll back application code only when schema-compatible, otherwise use corrective migrations.

### 10.2 Provider and cost gate

Current pricing, free-tier eligibility, limits and availability have not been verified. Before selection/deployment, record dated official-provider evidence for hosting request/CPU/memory/body/response limits, bandwidth, scheduler support, database size/connections, inactivity pausing, storage/egress, backup/restore access, upload restrictions, minimum paid tiers, budget controls and quota-exhaustion behavior.

Estimate costs from photo count × derivative bytes, visits × transferred bytes and backup retention. Check additional egress from proxy delivery. Do not promise permanent free operation or free-tier availability guarantees. If inactivity pausing is unsuitable, explicitly approve a low-cost paid plan.

### 10.3 Backup and restore

**Backups: daily, not weekly.** For a personal scrapbook of photos and memories, losing up to a week is too much. Proposal: automatic daily backup containing **both the database export and the actual image files** — a database dump alone only stores references and is worthless without the files. Verify in the restore test that photos actually render. 8–30 retained points depending on cost, plus a manual backup before any migration. Keep it simple — a scheduled script that dumps the DB and copies the storage bucket files is enough; no read-only maintenance mode needed for a single-user board.

**Test restore once for real** before the gift: restore into a throwaway environment, check the board renders. That single rehearsal matters more than elaborate procedures.

If Supabase's built-in backups cover this at acceptable cost, prefer them over a custom script.

Monitor login spikes, error/latency rates, image failures, cleanup backlog, backup age, storage and egress without personal content.

## 11. Open confirmations

| Topic | Proposed default | Confirm |
| --- | --- | --- |
| Providers | Vercel + Supabase, subject to checks | Capabilities and monthly budget |
| Canvas | Bounded expanding surface; scroll, no custom zoom | Actual phone usability |
| Groups | Seeded backgrounds | Names, colours and placement |
| Resize | Free bounded dimensions, image aspect lock | Mobile controls |
| Sessions | Fixed 7-day expiry, both roles | Convenience/privacy; idle expiry optional |
| Images | JPEG/PNG/WebP, ~10 MiB, basic optimization | Which formats Eefje's phone produces (HEIC?) |
| Deletion | Confirmation for cards/replacement | Interaction preference |
| Style | Scrapbook design tokens | Language, fonts, palette/background |
| Drafts | Unconfirmed changes in IndexedDB | Confirm acceptable on Eefje's device |
| Backups | Daily automatic, 8–30 points | Provider support and cost |
| Delivery | After security/mobile/restore gates | Gift date and test devices |

## 12. Verification and traceability

### 12.1 Tests

**Security first (before content features):** every endpoint called as anonymous and as viewer must be denied for writes; login timing does not reveal which role matched; cookies have correct flags; raw bucket/media access denied; no secrets in built assets/logs/URLs.

**Unit:** schema validation, geometry/placement, revision handling, save coalescing, image type/size validation.

**Browser (desktop + real phone):** login → board; create/edit/delete notes/lists/photos; drag vs. edit; scroll; reload persistence; failed save retry; IndexedDB draft recovery after refresh; viewer read-only.

**Operational:** prototype the Vercel + Sharp + Supabase upload path with a real phone photo; one real backup restore; provider quota check.

### 12.2 Coverage

| PRD IDs | Design and release evidence |
| --- | --- |
| SEC-01–12 | Section 3/8; role, direct API/storage, rotation and session tests |
| WEB-01–08 | Stable HTTPS hosting, noindex, private resources, cost review |
| UX-01–07 | Sections 6/9; desktop/mobile, off-screen navigation and discoverability |
| CAN-01–08, CAN-10–11 | Geometry, touch drag, scroll, placement, overlap, resize, reload |
| CAN-09 | Stored stacking order; explicit reorder UI deferred Could-have |
| CAT-01–05 | Optional seeded backgrounds on one board; zero-group usability |
| CAT-06–07 | Custom editing/filtering deferred |
| NOTE-01–08 | CRUD, optional title, palette, movement/resize/persistence |
| NOTE-09 | Stored timestamps; display optional |
| TEXT-01–05 | Section 9.1; phase 5 standalone headings, styling, persistence, permissions and one-time central title |
| IMG-01–10 | Upload/caption/replace/delete, validation, aspect, optimization |
| LIST-01–10 | Required title, item CRUD/completion/order, resize/reload |
| CNT-01–06 | Shared guards, transactional content mutations, cleanup |
| DATA-01–08 | Persistent data/media, autosave feedback, failed drafts, restore |
| DATA-09 | IndexedDB drafts for unconfirmed changes; restore-and-retry on reload |
| VIS-01–08 | Named, personalized, readable mobile scrapbook review |
| NFR-01–12 | Profiling, accessibility, browser tests, simple stack, secure setup |
| COST-01–04 | Dated provider/pricing check before deployment |

### 12.3 Implementation order

1. Foundation: scaffold, CI, environments, provider/cost checks, **upload prototype** (Vercel + Sharp + Supabase with a real phone photo).
2. Security: schema, private bucket, password setup, sessions, authorization — tested standalone before any content work.
3. Canvas basics: drag, auto-placement, scroll, edit, save — **tested on a real phone** before extra navigation features.
4. Content: notes, lists, pictures (simple version).
5. Polish: standalone text headings and one-time central title (section 9.1), personal styling, broader font sizes, IndexedDB drafts, failed-save/session-recovery handling, "Find content" only if mobile testing shows it's needed.
6. Operations: daily backups, one real restore test, production privacy checks, handover.

### 12.4 Phase 4 checkpoint and carry-over — 5 November 2026

Phase 4 content implementation is complete. Implemented: note/list editing and persistence; private photo upload and captions; upload-then-Done replacement with Cancel; duplicate-create prevention; deletion progress feedback; save-response reconciliation to prevent stale position/text resets; photo widths up to 2400 px (subject to height/board bounds), proportional size controls and full-screen viewing with zoom for both roles.

Verification: 81 automated tests, typecheck and production build pass. The user reported PC and phone testing. Recheck the latest photo-size and full-screen controls on the actual phone; do not treat this as already verified or as evidence of hosted production behaviour.

Explicit phase 5 carry-over — now implemented, awaiting phone verification:
- Standalone text/section headings and the one-time central “Eefje's universum” element (section 9.1; PRD TEXT-01–05): `text` element type with body/font size/colour/alignment, seeded centrally by migration 0004.
- Personal styling (paper-dot board surface, serif display text) and a wider note/list font-size range (S/M/L/XL).
- IndexedDB drafts for unconfirmed changes with restore-and-retry on reload and explicit retry/discard for drafts whose card no longer exists.
- 401 session expiry is now distinguished from 403 permission/origin/CSRF denial, and the pending save queue is carried across re-login. "Find content" navigation remains deferred until mobile testing shows it is needed. Manual recovery checks on the real phone remain outstanding.

Before production release, confirm remaining viewer, failure/retry and session-recovery acceptance cases, real-photo upload through hosted Vercel/Supabase, hosted privacy controls, backups and a restore. Local automated tests and reported phone use do not replace those checks.

Release when all Musts pass, planned Shoulds pass or are explicitly deferred, no anonymous/viewer mutation route remains, the actual phone is usable, and recovery is demonstrated. Open product/provider decisions remain tracked rather than treated as implemented facts.
