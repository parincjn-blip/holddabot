# Rank-up announcements — original HoldDaBET kit

- Artwork source: `/Users/nnanatt/Downloads/HoldDaBET-RankCard-Kit`.
- The original backgrounds, overlays, fonts, coordinates, renderer and rank names are copied unchanged into `assets/rank-up-kit/`. `original-files.sha256.json` records their source hashes.
- The card uses the member's current guild Display Name and Discord avatar. It adds no XP, Chat Level or Talk Level data. The normal announcement for the nine matching roles is an image attachment only; separate level-up messages remain unchanged.
- An exact role-name match with `ranks.json` selects the artwork. This does not infer a tier from level, XP or priority, and does not introduce cross-guild Role ID mappings. Unknown custom roles retain the existing text announcement.
- Avatar/CDN errors fall back to the existing announcement without interrupting role assignment. Rank channels must permit Attach Files.
- Existing rank eligibility, role replacement, feature switches, destinations, database records, web-template overrides and old Discord messages are preserved. Web-template text is optional and stays outside the image; rank templates cannot replace the approved artwork. Previously saved override rows are not rewritten by deployment.

Verification:

```sh
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p tsconfig.json
node --test tests/unit.test.mjs tests/dashboard.test.mjs tests/dashboard-http.test.mjs tests/rank-up-card.test.mjs
node scripts/verify-rank-up-deployment.mjs
```

Run the final command only on the bot host. It reads configuration, checks original artwork hashes and actual role/channel permissions, and outputs only a configuration digest and counts. It does not send announcements or modify roles.

## Production verification — 6 October 2026

- Deployed to `/home/ai/services/disbot` on verified host `codex-agent-sgp1-20260627` (`hell-factory`).
- 37 tests passed locally and on the host, including all nine original card renders. Isolated-schema integration verified a single image-only promotion under concurrent role sync and safe fallback on avatar failure; no live test announcements were sent.
- All nine existing rank Role names match the kit; the actual announcement channel allows file attachments. Original kit hashes passed on the host.
- Existing settings, rank rules, feature switches and template overrides retained the same configuration digest before/after deployment. Both protected environment files retained their hashes.
- Restarted only `disbot.service`; both bot and dashboard are active/running, NRestarts=0. Public dashboard health returns 200 with OAuth ready.
- Backup: `/home/ai/services/disbot-rank-card-backup-vg04xg/code-before-rank-card.tar.gz` (host-local, mode 600; contains protected environment files and must not be copied to Git or another host).
- Staging: `/home/ai/services/disbot-rank-card-stage-wjqj6G` (host-local, mode 700).
- The next real promotion will use the approved card. Already-posted messages were not changed; a real promotion event has not been artificially triggered for testing.
