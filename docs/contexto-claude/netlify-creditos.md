---
name: netlify-creditos
description: Netlify free plan uses credits; each production deploy (merge/push to main) costs 15 of 300 monthly credits
metadata:
  node_type: memory
  type: project
  originSessionId: 2fafbf0d-f394-4761-8029-6c60d99dcea1
  modified: 2026-09-28T16:31:26.332Z
---

Netlify team AntonioSJ is on the free credit plan: 300 credits per cycle (cycle Sep 23 – Oct 22, 2026, then monthly). Each production deploy costs 15 credits; by 2026-09-28 it had used ~150 (10 prod deploys) plus the PR #2 merge. Deploy previews did not show as production-deploy charges. Web requests/compute/bandwidth are tiny (<1 credit).

**Why:** hitting the limit can pause the site until the next cycle, right before class deliveries (Fase 2 Oct 10/17, Fase 3 Nov 7).
**How to apply:** batch changes into one PR and merge once; test on the Deploy Preview instead of pushing small commits to main; never push directly to main for trivial fixes. Related: [[proyecto-supabase-rrhh]].
