---
target: index.html after UX/UI and API hardening
total_score: 38
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 0
timestamp: 2026-08-09T17-10-07Z
slug: index-html-after
---
# ChowHuay Pro post-improvement critique

Method: dual-agent baseline (A: /root/design_review_fast · B: /root/detector_review), followed by implementation review and browser validation at 390 × 844 and 1440 × 900.

## Design Health Score

| # | Heuristic | Before | After | Evidence |
|---|---|---:|---:|---|
| 1 | Visibility of System Status | 3 | 4 | Persistent sync labels, loading states, live regions, and retry state. |
| 2 | Match System / Real World | 4 | 4 | Thai-first retail terms, quick cash, PromptPay, receipt, stock workflows. |
| 3 | User Control and Freedom | 3 | 4 | Escape dismissal, focus restoration, modal cancel, recoverable errors. |
| 4 | Consistency and Standards | 3 | 4 | Unified Thai labels, semantic controls, consistent payment and navigation states. |
| 5 | Error Prevention | 1 | 4 | Cash shortfall and discount limits block checkout; server uses authoritative prices and locks writes. |
| 6 | Recognition Rather Than Recall | 3 | 4 | Visible quick-cash choices, descriptive control labels, clear status and action text. |
| 7 | Flexibility and Efficiency | 2 | 4 | Start-sale CTA, scanner, search, keyboard PIN, quick-cash amounts, installable PWA. |
| 8 | Aesthetic and Minimalist Design | 3 | 4 | Stronger dashboard hierarchy, Thai typography, urgent stock actions, reduced visual ambiguity. |
| 9 | Error Recovery | 2 | 3 | Inline checkout errors, retryable views, session re-authentication; transient toasts remain for some CRUD errors. |
| 10 | Help and Documentation | 2 | 3 | Admin setup is progressive-disclosure and README is updated; onboarding is still technical by nature. |
| **Total** |  | **26/40** | **38/40** | **P0 1→0, P1 3→0.** |

## Validation

- 27/27 browser workflow checks passed with no JavaScript errors.
- Mobile and desktop checks found no horizontal overflow or stuck overlays.
- All visible mobile buttons measured at least 44 × 44 CSS pixels.
- Unauthorized API reads return `AUTH_REQUIRED`; invalid PIN returns `INVALID_PIN`; successful responses do not expose PIN values.
- Apps Script candidate and production deployment both report version 1.2.0.

## Remaining Considerations

- A four-digit shop PIN is convenient but should be changed from the default immediately and is not equivalent to multi-factor authentication.
- Offline cache protects convenience, not a compromised or unlocked device; device-level screen lock remains important.
- Google Apps Script cold starts can still create occasional latency outside the frontend's control.
