# Alyx Income Tax Manager - Development Guide

## What This Is

A Progressive Web App for managing weekly income, business expenses, and tax savings for a self-employed therapist (sole proprietor, single filer). Built as a single-file React application with local-first storage and Google Drive backup.

**Who it's for:** One person - Alyx Steadman Therapy PLLC

**Why it matters:** This application calculates tax liability, tracks quarterly estimated payments, and manages financial records. Errors directly impact real money and IRS compliance.

---

## The Core Principle

**This is a financial tax application. It cannot make mistakes.**

What does that mean in practice?

### Real Consequences of Bugs

- **Tax liability errors**: A calculation bug could tell the user to save $500/week when they need $700. By April, they're $10,000 short. This happened - an early version had a 27% error ($7,110 on $108k income) because two deductions were missing.

- **Data loss**: If a year of weekly income records disappears, the user has no financial history. They can't verify their tax situation, can't prove income if audited, can't plan for next year.

- **Silent bugs are the worst kind**: A crash is obvious. A subtle calculation error means the user trusts wrong numbers for months until they file taxes and discover the problem.

### The Mindset

Every feature in this app is "financial infrastructure." Even UI polish matters because a confusing interface leads to user input errors. A "minor" refactor could break a calculation the user depends on.

Before making changes, ask:
- Could this cause incorrect tax calculations?
- Could this cause data loss?
- Could this confuse the user into entering wrong data?
- If this breaks silently, how long until someone notices?

---

## Data Integrity Rules

These principles prevent data loss - the most unrecoverable failure mode.

### State Persistence

**Why this matters:** This is a PWA. Users close the browser tab, the computer crashes, they switch devices. Unlike a server-based app, there's no backend holding their data.

**The principle:** Any data the user would be upset to lose must persist immediately. Not "on save," not "when they navigate away" - immediately.

**How to think about it:** At any moment, ask yourself: "If the browser crashes right now, what data is lost?" If the answer is anything the user entered, that's a bug.

**The anti-pattern:** Important values living only in React component state. Component state is for UI concerns (is the modal open? what's typed in an input before submission?). Financial data belongs in the persisted `appData` state.

**Current implementation:** All financial data lives in `appData` state in the App component. A useEffect auto-saves to localStorage on every change. The `useSyncManager` hook syncs to Google Drive with a 5-second debounce.

### Single Source of Truth

**Why this matters:** When the same data exists in multiple places, they will eventually disagree. Which one is right? The user doesn't know. Neither does the code.

**The principle:** One authoritative location for each piece of data. Everything else is a cache or a derived view.

**Current implementation:**
- Financial data: `appData` state (authoritative) → localStorage (fast cache) → Google Drive (backup/sync)
- If there's a conflict, Drive has a timestamp and the user decides

### Consider User Notification for Constraints

**The context:** When the app applies limits or caps that affect the user's money, they might need to know. For example, if business expense allocation is capped at 50% of income, and their actual expenses are higher, they might not realize they're under-allocating.

**However:** Not every constraint needs a warning. Too many alerts train users to click "OK" without reading. This is a balance between transparency and UX.

**Guidance:** When a cap/limit/constraint affects real money, consider whether the user should know. If you're unsure, discuss the tradeoffs before implementing.

---

## Tax Calculation Integrity

Tax calculations are the core of this application. Getting them wrong defeats the entire purpose.

### Completeness Over Correctness

**The lesson from our audit failure:** The original code was mathematically "correct" for what it calculated. But it was missing two major deductions (QBI and business expenses in the tax formula). The code did what it said - it just didn't say what it should.

**The mindset shift:** Don't just ask "is this calculation right?" Ask "what's missing?" Before implementing tax logic, establish what a complete calculation requires. Then verify each component exists.

**Reference:** See [AUDIT_METHODOLOGY.md](AUDIT_METHODOLOGY.md) for the full post-mortem on how we missed a 27% error and how to prevent it.

### Domain Knowledge Required

**Tax calculations aren't just math** - they're IRS rules. The 0.9235 multiplier in self-employment tax isn't arbitrary; it's because you can deduct the employer-equivalent portion. The QBI deduction phases out for "specified service trades or businesses" above certain income thresholds. A therapist is an SSTB.

**Before adding or changing tax logic:**
1. Research the actual IRS rules (publications, forms, instructions)
2. Understand why the calculation works the way it does
3. Consider edge cases (income thresholds, phase-outs, caps)

**When in doubt, calculate conservatively.** It's better for the user to slightly overpay estimated taxes (and get a refund) than to underpay (and owe penalties).

### Verification Against Reality

**The 27% error was caught** not by code review, but by comparing the app's output to an actual tax return. That comparison should have happened earlier.

**Principle:** Tax calculations should be validated against real tax returns when possible. If the app says $25,000 tax liability and the actual return was $32,000, something is wrong.

---

## Code Organization Philosophy

Not prescriptive rules, but the thinking behind good structure for this codebase.

### Auditability

**Why this matters:** When something goes wrong (or someone asks "does X work?"), you need to be able to answer by looking at code. If the answer requires tracing through 15 files and understanding implicit dependencies, bugs hide.

**The principle:** Related functionality should be co-located. You should be able to answer "how does [feature] work?" by looking in one place.

**Example thinking:** "If someone asks 'how does sync work?', can I point to one place?" Yes - the `useSyncManager` hook. That's the goal for any significant feature.

### Centralization of Concerns

**Why this matters:** When the same logic exists in multiple places, changes get applied inconsistently. One place gets updated, the others don't. Now there are two behaviors and nobody knows which is correct.

**The principle:** If you find yourself doing the same thing in multiple places, it should probably be a single function.

**Example thinking:** "This validation exists in 3 places. What happens when the rules change?" All 3 need to be updated. That's a maintenance burden and a bug waiting to happen. Extract it to one function.

### Explicit Over Implicit

**Why this matters for financial code:** When something goes wrong, you need to trace what happened. Clever one-liners and implicit behavior make that hard. Verbose but obvious code is easier to audit.

**The principle:** Make data flow obvious, even if it means more lines of code.

**Anti-patterns to avoid:**
- Magic numbers without comments explaining what they represent
- Implicit type coercion (relying on JavaScript's loose typing)
- Clever one-liners that require mental parsing to understand
- Side effects hidden in seemingly pure functions

---

## PWA-Specific Considerations

This is a Progressive Web App, which adds constraints that a traditional web app or native app doesn't have.

### The Browser is Not Reliable Storage

**Reality check:**
- Users clear browser data (intentionally or accidentally)
- Browsers can evict localStorage under storage pressure
- Private/incognito mode doesn't persist anything
- Different browsers on different devices don't share storage

**Current mitigation:** Google Drive backup. But users can skip the sign-in, so local-only mode still exists and is still risky.

### Design for Interruption

**The principle:** Design as if the app will be force-closed mid-operation.

- Save data before starting long operations, not after
- Don't rely on "cleanup" code running (it might not)
- If an operation is multi-step, consider what happens if only step 1 completes

### Offline Must Work

The app needs to function when there's no internet connection. Users might be entering income data on a plane or in a coffee shop with bad wifi.

**Current approach:**
- Core app cached via service worker for offline use
- localStorage works offline
- Google Drive sync queues when offline and retries when back online

---

## Quick Reference

### Running the App

- **Web (recommended):** https://matmcfad.github.io/Alyx-Tax-manager/
- **Local development:** Run `START.bat` (Windows) or `START.sh` (Mac/Linux)
- **Don't open index.html directly** - PWA features require a web server

### Key Files

| File | Purpose |
|------|---------|
| `index.html` | All application code (~4,300 lines) |
| `service-worker.js` | Offline caching |
| `manifest.json` | PWA metadata |
| `AUDIT_METHODOLOGY.md` | Lessons learned from the 27% tax error |
| `audit_report.md` | Full code audit with recommendations |

### Data Storage

- **localStorage key:** `alyxIncomeManager`
- **Google Drive:** Hidden app folder, file `alyx-tax-manager-2025-backup.json`

### Key Functions (in index.html)

| Function | Purpose |
|----------|---------|
| `calculateTotalTax()` | Master tax calculation (SE + income tax + QBI) |
| `calculateSelfEmploymentTax()` | SE tax with proper wage base caps |
| `calculateSmartTaxSavings()` | Weekly savings recommendation algorithm |
| `useSyncManager()` | Google Drive sync hook |
| `saveToLocalStorage()` / `loadFromLocalStorage()` | Persistence |

---

## When You're Unsure

If you're making a change and you're not sure if it could affect financial calculations, data integrity, or user trust: ask. It's better to discuss than to ship a bug that costs real money.
