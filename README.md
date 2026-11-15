# iOS Safari date picker lab

A standalone page for reproducing an iPhone-only bug in a small custom date picker
(the month arrows reportedly don't change the month in iOS Safari), and for testing candidate fixes.

- `site/` – the lab page, the picker's CSS (copied from the page under test), and the picker
  script: `picker/original.js` plus candidate fixes (`fix*.js` / `fix*.css`).
- `serve.mjs` – tiny dependency-free server. `/?v=<version>` serves the page with that version of the
  picker as plain static tags; `/api/busy` returns a fixed week of reserved days next month.
  GET/HEAD only.
- `tests/` – Playwright checks run against every version in emulated iPhone, small iPhone,
  Android Chrome, desktop Safari and desktop Chrome.

Fonts: Manrope and Cormorant Garamond, SIL Open Font License (see `site/fonts/*-OFL.txt`).

```sh
npm ci && npx playwright install webkit chromium
npx playwright test            # all versions
V=fix8-final npx playwright test
node serve.mjs                 # then open http://localhost:8080/?v=original
```
