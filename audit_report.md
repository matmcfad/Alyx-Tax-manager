# Audit Report - November 2026

Scope: `index.html` (tax engine, weekly allocation, storage, Drive sync), `service-worker.js`,
`workers/auth-worker`, deploy workflow. Bugs below were reproduced in a real browser
(Chromium, clock and Drive API mocked) against the pre-audit code, then re-run against the fix.

## 1. Tax constants - verified correct for 2026

Brackets, $16,100 standard deduction, $184,500 Social Security wage base, QBI threshold
$201,750 / $276,750 with the $75k OBBBA phase-in range and $400 minimum all match
Rev. Proc. 2025-32 and SSA. Hand-check at $108k gross / $8k expenses: SE tax $14,130,
QBI $15,367, income tax $8,235, total $22,365 - matches the app to the dollar.

## 2. Fixed in this audit

| # | Problem | Consequence before the fix |
|---|---------|----------------------------|
| 1 | `getCurrentWeek()` returned 53 on Dec 28-31, 2026 (ISO 2026 has 53 weeks; the app has 52 slots) | Dashboard threw and the whole app rendered a blank white page for the last four days of the year |
| 2 | From Jan 4, 2027 `getCurrentWeek()` returned 1 | Dashboard silently pointed back at week 1 of 2026 |
| 3 | Settings > Save with an empty "2025 tax" or "standard deduction" field stored `NaN` | Saved as `null`; the next load failed validation, reset to setup and overwrote all recorded weeks |
| 4 | "Starting fresh, old data preserved" was not true - the auto-save effect overwrote it immediately | Any failed validation or unparseable storage meant permanent local data loss |
| 5 | Blank pre-setup data was auto-synced when Drive was still connected | After a local reset, the blank state was uploaded over the real Drive backup |
| 6 | Drive pull replaced local data with no copy kept, then pushed stale pre-pull data back | Edits that never reached Drive were unrecoverable; redundant overwrites of the newer backup |
| 7 | Restore-from-Drive during setup and "Import backup" did not validate the file | A wrong or damaged file replaced all data and then synced to Drive |
| 8 | Half-of-SE-tax deduction included the 0.9% Additional Medicare Tax (not deductible) | Income tax understated above ~$217k net profit |
| 9 | QBI in the SSTB phase-out applied the reduction once; with no W-2 wages it applies twice, and QBI was not reduced by the SE tax deduction | Together with #8: tax understated by up to ~$4,700 (peak near $272k net profit). Results are identical below ~$217k net profit and never lower than before |
| 10 | Service worker was cache-first for `index.html` | A deployed fix never reached the user unless `CACHE_NAME` was also bumped |
| 11 | Service worker cached PapaParse from unpkg; the page loads it from cdnjs. One failed CDN aborted the whole install | CSV import/export broken offline; offline support all-or-nothing |
| 12 | React and Babel loaded from floating version tags | Same failure mode as the earlier blank-page incident. Now pinned exactly |
| 13 | OAuth `state` carried only the return origin (no CSRF nonce) | A crafted `/auth/callback` link could attach the user's session to someone else's Google account, sending backups to their Drive |
| 14 | Malformed `Referer` crashed the worker (500); session cookie matched by substring | Minor robustness |

Where recovery copies live: `alyxIncomeManager2026_recovery_invalid-data` and
`alyxIncomeManager2026_recovery_before-drive-pull` in localStorage (latest copy of each).

**After merging:** the worker auto-deploys. The state check was exercised locally with
`wrangler dev`, but the full Google round trip cannot be tested outside production -
disconnect and reconnect Google Drive once to confirm.

## 3. Recommendations - need a decision, not changed

Ordered by money at risk.

1. **Weeks off cannot be recorded.** Income must be > 0, so a vacation week stays "missing"
   forever. `weeksElapsed` is the count of *recorded* weeks, so the Dashboard's
   "weeks remaining" (52 - recorded) is too high after any skipped week and the annual
   smoothing rate is too low. The Taxes screen computes weeks remaining from the calendar
   instead, so the two screens can disagree. Suggested: allow $0 weeks, and use one
   calendar-based helper in both places.
2. **Safe harbor is assumed to be 100% of 2025 tax.** It is 110% when 2025 AGI exceeded
   $150,000. Quarterly amounts are fixed at 2025 tax / 4.
3. **Quarterly payments have no "actual amount paid".** The balance assumes exactly the
   scheduled amount was paid, and editing the 2025 tax in Settings rewrites the amount on
   quarters already marked paid.
4. **The Schedule C deduction is the budget, not actual spending.** If real expenses come in
   under budget, projected tax is too low.
5. **Not modelled at all:** state income tax, self-employed health insurance deduction,
   retirement contributions, other income, credits. The last four make the app conservative;
   state tax does not. Worth confirming which apply.
6. **Two-device sync.** A push never checks whether Drive changed since this device last
   synced, so a stale open tab overwrites newer data from another device. CLAUDE.md says
   "the user decides" on conflict; the code always takes Drive on connect and local on push.
7. **No automated tests, and JSX is compiled in the browser on every load** (~3 MB Babel).
   A precompiled build with vendored libraries plus a small test file for the tax functions
   would remove the CDN dependency and guard against regressions. Tailwind's play CDN is
   still a floating, not-for-production dependency.
8. Minor: session cookie can be `SameSite=Lax` (app and auth share a site); wrangler 3 and a
   2024 compatibility date are dated; `.claude/settings.local.json` is committed despite
   `.gitignore`.

## 4. 2027 rollover

The 2026 app now stays on week 52 and shows a "tax year has ended" notice from Jan 1, 2027.
For the 2027 version:

- **2027 has 53 Fridays** (Jan 1 through Dec 31). The app hard-codes 52 weeks in
  validation, week bounds, CSV import and every `* 52` projection.
- 2027 figures are published (Rev. Proc. 2026-35, Nov 5, 2026; SSA Oct 2026). From
  secondary sources - confirm against the IRS PDF before use: standard deduction $16,600;
  10% bracket to $12,800; 22% from $52,025; 37% from $661,375; QBI threshold $208,300;
  Social Security wage base $192,300.
- Run the Year-End Close in Settings before switching, and compare the app's 2026 total
  against the filed 2026 return (see AUDIT_METHODOLOGY.md).
