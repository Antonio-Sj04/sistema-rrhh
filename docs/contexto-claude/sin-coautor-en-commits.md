---
name: sin-coautor-en-commits
description: Never add the Co-Authored-By Claude trailer to commits in this repo — it blocks Netlify deploys
metadata:
  node_type: memory
  type: feedback
  originSessionId: 2fafbf0d-f394-4761-8029-6c60d99dcea1
  modified: 2026-09-23T22:54:02.490Z
---

Do not add any `Co-Authored-By:` trailer (or any other author/co-author identity) to commits in the sistema-rrhh repo. Commits must be authored only by the user's git identity (Antonio-Sj04 <jsamayoaj2@miumg.edu.gt>).

**Why:** Netlify's free plan blocks builds of private repos when a commit has an unrecognized contributor, and it counts the `noreply@anthropic.com` co-author as one ("Build blocked: Unrecognized Git contributor"). The user chose on 2026-09-23 to drop the trailer rather than make the repo public or pay.

Dropping the trailer alone did not unblock builds: the real fix (2026-09-23) was linking GitHub `Antonio-Sj04` in Netlify → Team settings → Members → Git contributors. Keep the trailer off anyway so no second contributor is counted.

**How to apply:** This overrides the default attribution guidance for this project. After every push, verify the live site bundle actually changed (see [[proyecto-supabase-rrhh]]) instead of assuming Netlify deployed.
