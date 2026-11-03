# Provider and cost check — Eefje's universum

**Checked:** 3 November 2026
**Status:** Evidence gathered for the phase-1 gate; final go/no-go happens at deploy time.
**Sources:** official provider documentation (links inline, accessed 2026-11-03).

## Vercel (hosting + Node serverless functions)

Hobby plan (free, non-commercial personal use — fits a private gift site):

| Item | Limit | Source |
| --- | --- | --- |
| Function max duration | 300 s default and max (fluid compute) | vercel.com/docs/functions/limitations |
| Function memory / CPU | 2 GB / 1 vCPU (fixed on Hobby) | vercel.com/docs/limits |
| Function invocations | 1,000,000 included / 30-day window | vercel.com/docs/plans/hobby |
| Fast data transfer | 100 GB | vercel.com/docs/plans/hobby |
| Active CPU / provisioned memory | 4 CPU-hrs / 360 GB-hrs | vercel.com/docs/plans/hobby |
| On quota exhaustion | Feature pauses until the 30-day window resets | vercel.com/docs/plans/hobby |
| Node.js runtime | Full Node API; sharp works on `nodejs` runtime | vercel.com/docs/functions/limitations |

**Implication for the upload path:** phone photos up to ~10 MiB bypass the
function body limit entirely because the prototype uploads directly to
Supabase Storage via a signed URL. Sharp only touches the file inside
`complete`, well within the 2 GB / 300 s envelope.

## Supabase (PostgreSQL + private Storage)

Free plan:

| Item | Limit | Source |
| --- | --- | --- |
| Database size | 500 MB | supabase.com/pricing |
| File storage | 1 GB | supabase.com/pricing |
| Egress (DB + storage) | 5 GB / month | supabase.com/docs/guides/platform/billing-on-supabase |
| API requests | Unlimited | supabase.com/pricing |
| Automatic backups | **Not included on Free** (Pro: daily, 7-day retention) | supabase.com/pricing |
| Inactivity pausing | Paused after ~1 week of low activity; restorable within 1 year | supabase.com/docs/guides/platform/free-project-pausing |
| Free projects | 2 (dev + prod fits exactly) | supabase.com/docs/guides/platform/billing-on-supabase |

## Risk flags for review

1. **Inactivity pause (main risk).** If Eefje doesn't use the board for a
   week, the Supabase project pauses and the site appears down until
   resumed from the dashboard. Mitigations: keep-alive via a scheduled
   request, or accept a Pro plan (~$25/mo — likely overkill). A cheaper
   middle ground: keep the free tier and treat a resume as a documented
   manual step. **Decision needed before gifting.**
2. **No automatic backups on Free.** The design requires daily backups
   (DB + image files). On the free tier this must be a scheduled script
   (e.g. GitHub Actions cron running `pg_dump` + bucket copy). Pro
   backups are daily/7-day only anyway, so a custom script is needed
   regardless to cover **storage files**.
3. **Storage 1 GB.** At ~0.5–1 MB per processed photo, ~1,000–2,000
   photos fit. Acceptable for a personal board; monitor usage.
4. **Egress 5 GB.** Images are served proxied through Vercel functions —
   both sides count egress. Personal viewing volume stays far below the
   cap.
5. **Two-project limit.** Exactly one dev + one prod project fits; no
   room for a third environment on free.

## Cost estimate

Expected steady state: **€0/month** (both free tiers), assuming the
inactivity pause is acceptable or mitigated. No permanent-free guarantee
is implied — provider terms can change; re-verify at deploy time.
