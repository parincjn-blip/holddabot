# Template Studio deployment — 6 October 2026

## Verified status

- Public HTTPS: `https://bot.hold-bet.com`
- DNS A: `165.245.178.197`; HTTP redirects to HTTPS
- Host verified: `codex-agent-sgp1-20260627` / Tailscale `100.73.90.77`
- Runtime: `/home/ai/services/disbot`
- `disbot.service` and `disbot-dashboard.service`: active/running, NRestarts=0 after deployment
- Dashboard bound only to `127.0.0.1:8787`
- `/healthz`: `{ "ok": true, "oauthReady": true }` after OAuth configuration on 6 October 2026
- Certificate matches `bot.hold-bet.com`, expires 4 January 2027; existing Certbot timer enabled, nginx reload hook installed
- Original macro-events HTTPS health endpoint still returns 200
- Migration 007 applied; original guild configuration digest unchanged:
  `871c85dbab6b33b38d2cf247113079e8cd98c255dd45b3ac610beddc8dd8e0d4`
- Existing live setup: 1 guild, 5 configured destinations, 9 rank rules, 10/12 features enabled; no XP/rank/feature policy changes
- 32 tests passed locally and on the bot host; isolated-schema integration passed and temporary schema was removed
- Desktop/mobile UI checked using synthetic data; a synthetic save persisted and reloaded the selected template. Real public landing page verified in browser

## OAuth configuration completed; real login acceptance pending

- The application owner registered `https://bot.hold-bet.com/auth/discord/callback`.
- With explicit owner approval, the Client Secret was verified against Discord using a client-credentials request and stored only in the protected host-side `.dashboard.env`. No secret or returned access token was printed or saved locally.
- Existing dashboard settings were preserved and a mode-600 host-local backup was created before the update.
- Only `disbot-dashboard.service` was restarted. The bot process ID stayed unchanged; both services remained active/running with NRestarts=0.
- Public `/api/status` reports `oauthReady:true`; `/auth/discord` returns 302 to Discord with the exact callback, `identify guilds` scopes and a Secure/HttpOnly/SameSite=Lax state cookie. Unauthenticated `/api/me` returns 401.

The owner still needs to complete a real Discord login. Authorized guild selection, real template save/next-event rendering, history/reset and logout are not yet verified end-to-end. Do not send unapproved test announcements or Role pings. Credentials must stay outside chat, Git and frontend code.

## Recoverable host-local backup

- `/home/ai/services/disbot-dashboard-backup-eMxUPW/code-before-dashboard.tar.gz`
- Directory mode 700, archive mode 600; includes the original environment and must stay on the bot host
- Staging: `/home/ai/services/disbot-dashboard-stage-fgJEH3`
- Dashboard secret file: `/home/ai/services/disbot/.dashboard.env` (not copied to the Mac or Git)

Only dedicated nginx virtual hosts for this domain were added. Existing hosts and firewall ports were preserved. See `docs/DASHBOARD.md` for implementation, deployment and rollback procedures.

## Original rank-card Studio update

- Added authenticated previews of all 9 approved rank cards, using the unchanged kit renderer, backgrounds, overlays and fonts.
- The preview uses the signed-in account's name/avatar; actual announcements use the promoted member's server Display Name/avatar. Selecting a preview rank does not change rank rules.
- Rank announcements default to image-only. Optional accompanying text can be edited outside the image; replacement artwork is rejected.
- 38 tests and isolated-schema integration passed on the bot host. Mock-browser selection/save/reload passed; real public landing shows the new rank-card badge.
- Both services restarted successfully: active/running, NRestarts=0; public health returns 200 with OAuth ready. Unauthenticated rank previews return 401.
- Original artwork checksums, environment-file digests and existing configuration remained unchanged. Configuration digest: `1a24c5cfd6e8502da43c56f6f61d3250ae3d17a21d6f17fe3a9a3e553c6b65db`.
- Recoverable host-only backup: `/home/ai/services/disbot-rank-web-backup-MjgnLQ/code-before-web-update.tar.gz` (directory 700, archive 600). Do not copy it off-host because it includes environment files.
- Real Discord login and production member-event acceptance remain pending; no test announcements or Role pings were sent.
