# Local e2e tests (run BEFORE pushing to gh-pages)

Repeatable test harness. Runs the real UI against the live Apps Script backend
from your machine, so you verify everything locally first.

## Prereqs
1. Static server on `:8765` serving the project root:
   `python3 -m http.server 8765`
2. Chrome auto-launches headless on `:9222` if not already running.

## Run
```bash
# one command: full regression -> smoke -> backend cleanup (all on :8765)
npm run verify

# full scenario (creates sale, restock, settings changes — writes real data)
npm run test

# read-only render smoke test (dashboard/pos/inventory/reports/settings views)
npm run test:smoke

# reset backend to clean slate + default settings
npm run test:cleanup
```

## Flow
1. Regenerates `test/index.test.html` from `index.html` + `test/driver.js`
2. Launches headless Chrome (notification permission granted)
3. Drives the UI, waits for the `__DONE` title marker
4. Prints OK/FAIL checklist

## After tests
Backend carries test data (product, sale, purchase, settings changes). Reset it
with the browser-based cleanup in `test/cleanup.mjs` (node->GAS is unreliable on
some networks; cleanup runs from inside Chrome which routes fine).

## Coverage (full scenario, ~26 checks)
- Boot, PIN unlock (uses `CHOWHUAY_TEST_PIN` or defaults to `1234`), data sync
- Set `CHOWHUAY_GAS_URL` to test a candidate Apps Script deployment without changing production config
- Set `CHOWHUAY_TEST_PORT` when port `8765` is already in use
- Settings: theme, dark mode, store name, passcode, notification toggle
- POS: scan modal, add-to-cart, checkout with discount + cash → verifies
  discount math (25-5=20), change (50-20=30)
- Dashboard: low-stock restock (+30)
- Inventory: add product via UI form, image upload (compress→Drive), edit,
  category add, bulk purchase add + delete via UI
- Reports: delete sale (stock restored +1), Excel export (XLSX lib loads and a
  real .xlsx file lands in /tmp/chowhuay-dl), PDF export, date-range toggles
- Low-stock browser notification fires (title/body verified)
- Zero uncaught JS errors

## Notes
- `test/index.test.html` is generated, never commit it.
- Push to gh-pages only after the suite is green + backend cleaned.
