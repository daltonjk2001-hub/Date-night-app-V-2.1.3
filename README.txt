DATE NIGHT DECIDER — VERSION 2.2 CORE BUILD

Files
- index.html: app screens and dialogs
- styles.css: responsive dark-purple/pink/gold interface
- app.js: 18 curated cards, games, filters, history, tracker and backup
- manifest.json: install metadata
- service-worker.js: offline app-shell caching
- icon-192.png and icon-512.png: app icons

Run locally
Serve this folder over localhost or HTTPS (for example, Acode's local server). Service workers and PWA installation do not work when opened directly as a file.

Core behavior
- Matcher: two independent likes/pass turns; matching liked ideas move to the winner workflow.
- Draft: randomly selects up to 10 eligible cards; players alternate eliminating cards.
- Surprise: randomly selects one eligible card.
- Winner selection: randomized 50/50 Player 1 / Player 2.
- History: decisions stored locally; mark dates completed separately.
- Weekly tracker: counts completed dates from Monday through Sunday.
- Library: all 18 official curated cards.
- Filters: three packs and At Home / Going Out activity types.
- Backup: JSON export/import of history.
- Offline: app shell cached by the service worker.

Data stays in this browser. Export a backup before clearing browser data or moving to another device.
