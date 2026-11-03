# Environments

Three isolated environments; previews never share production data.

| Environment | Hosting | Supabase | Purpose |
| --- | --- | --- | --- |
| local | `vercel dev` | dev project | development, synthetic content |
| preview | Vercel preview deploys | dev project | PR review |
| production | Vercel production | prod project | the real board |

## Configuration

Server-only variables (set in Vercel project settings and `.env.local`,
never via `VITE_*`):

| Variable | Description |
| --- | --- |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service role secret; bypasses RLS — backend only |
| `BOARD_ID` | seed board UUID (`00000000-…-0001` for the prototype) |

Future phases add: `THROTTLE_SECRET`, `JOB_SECRET`, `CANONICAL_ORIGIN`.

## Local setup

1. `npm ci`
2. Create a Supabase **dev** project; apply `supabase/migrations/*.sql`
   (SQL editor or `supabase db push`).
3. Copy `.env.example` → `.env.local`, fill in dev credentials.
4. `npm run dev:vercel` (Vercel CLI; serves the frontend and `api/`
   functions together). Plain `npm run dev` serves the frontend only.

## First deploy (phase-1 upload prototype)

1. Push the repo to GitHub and import it into Vercel (build `npm run
   build`, output `dist/`).
2. Set the env vars above in Vercel (production + preview).
3. Apply the migration to the **prod** Supabase project.
4. Open the deployed URL on a real phone, upload a real camera photo
   (JPEG/PNG/WebP) and confirm it renders through `/api/media/:id/display`.

That last step is the phase-1 acceptance check for the riskiest
assumption (Vercel + Sharp + Supabase within real limits).
