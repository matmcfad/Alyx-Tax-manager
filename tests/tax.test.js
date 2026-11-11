/**
 * Tests for the tax and date logic in index.html.
 *
 * Run before and after ANY change to tax logic:
 *
 *     node tests/tax.test.js
 *
 * No install step and no dependencies - it only needs Node.js.
 *
 * How it works: the tax, date and expense functions in index.html are plain
 * JavaScript (no JSX). This file reads index.html, takes the section between
 * the "CONSTANTS" and "LOCAL STORAGE FUNCTIONS" banners, and runs it as-is.
 * So these tests exercise the real code the app ships, not a copy.
 *
 * Expected dollar values below were worked out BY HAND from IRS rules
 * (Schedule SE, Form 8995/8995-A, Rev. Proc. 2025-32), not copied from the
 * app's output. If a test fails after a change, do not just update the
 * number - work out which one is right.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// ---------------------------------------------------------------------------
// Load the real code out of index.html
// ---------------------------------------------------------------------------
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const START_MARKER = '// CONSTANTS - 2026 TAX YEAR';
const END_MARKER = '// LOCAL STORAGE FUNCTIONS';
const start = html.indexOf(START_MARKER);
const end = html.indexOf(END_MARKER);
assert.ok(start > 0 && end > start, 'Could not find the tax code section in index.html');

const EXPORTED_NAMES = [
    'TAX_BRACKETS_2026', 'QUARTERLY_DUE_DATES', 'SE_TAX_2026', 'QBI_2026', 'TAX_YEAR',
    'calculateSelfEmploymentTax', 'calculateQBIDeduction', 'calculateIncomeTax', 'calculateTotalTax',
    'computeQuarterlyCatchup', 'calculateSmartTaxSavings', 'recalculateQuarterlyAmounts',
    'getWeekNumber', 'getFridayOfWeek', 'getCurrentWeek', 'isTaxYearOver',
    'calculateAnnualBusinessExpenses'
];
const sandbox = { console: { error() {}, warn() {}, log() {} } };
vm.createContext(sandbox);
vm.runInContext(
    html.slice(start, end) + `\n;globalThis.__exports = { ${EXPORTED_NAMES.join(', ')} };`,
    sandbox,
    { filename: 'index.html (tax section)' }
);
const app = sandbox.__exports;

// ---------------------------------------------------------------------------
// Tiny test runner
// ---------------------------------------------------------------------------
let passed = 0;
const failures = [];
function test(name, fn) {
    try {
        fn();
        passed++;
    } catch (error) {
        failures.push({ name, error });
    }
}
/** Dollar amounts must match to the cent. */
function assertDollars(actual, expected, label) {
    assert.ok(
        Math.abs(actual - expected) < 0.01,
        `${label}: expected $${expected.toFixed(2)}, got $${Number(actual).toFixed(2)}`
    );
}

const STANDARD_DEDUCTION = 16100;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
test('2026 constants match Rev. Proc. 2025-32 and SSA', () => {
    assert.strictEqual(app.SE_TAX_2026.socialSecurityWageBase, 184500);
    assert.strictEqual(app.SE_TAX_2026.seTaxBaseMultiplier, 0.9235);
    assert.strictEqual(app.QBI_2026.sstbThresholdSingle, 201750);
    assert.strictEqual(app.QBI_2026.sstbPhaseOutSingle, 276750);
    const lowerBounds = app.TAX_BRACKETS_2026.map(b => b.min);
    assert.deepStrictEqual(Array.from(lowerBounds), [0, 12400, 50400, 105700, 201775, 256225, 640600]);
    const rates = app.TAX_BRACKETS_2026.map(b => b.rate);
    assert.deepStrictEqual(Array.from(rates), [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37]);
});

test('tax brackets are contiguous (no gaps or overlaps)', () => {
    const brackets = app.TAX_BRACKETS_2026;
    for (let i = 1; i < brackets.length; i++) {
        assert.strictEqual(brackets[i].min, brackets[i - 1].max, `gap before bracket ${i}`);
    }
    assert.strictEqual(brackets[brackets.length - 1].max, Infinity);
});

// ---------------------------------------------------------------------------
// Full calculation - hand-worked cases
// ---------------------------------------------------------------------------
test('typical year: $108,000 gross, $8,000 expenses', () => {
    // Net profit 100,000. SE base = 100,000 x 0.9235 = 92,350.
    // SS 92,350 x 12.4% = 11,451.40; Medicare 92,350 x 2.9% = 2,678.15; SE tax 14,129.55.
    // Half SE = 7,064.775. AGI 92,935.225. Less std deduction 16,100 = 76,835.225.
    // QBI = 20% x 76,835.225 = 15,367.045 (taxable-income limit binds).
    // Taxable 61,468.18. Tax = 5,800 + 22% x (61,468.18 - 50,400) = 8,235.00.
    const t = app.calculateTotalTax(108000, 8000, STANDARD_DEDUCTION);
    assertDollars(t.netProfit, 100000, 'net profit');
    assertDollars(t.seTax, 14129.55, 'SE tax');
    assertDollars(t.seTaxDeduction, 7064.78, 'half SE tax');
    assertDollars(t.qbiDeduction, 15367.05, 'QBI deduction');
    assertDollars(t.taxableIncome, 61468.18, 'taxable income');
    assertDollars(t.incomeTax, 8235.00, 'income tax');
    assertDollars(t.totalTax, 22364.55, 'total tax');
});

test('low year: $20,000 net profit', () => {
    // SE base 18,470. SE tax = 18,470 x 15.3% = 2,825.91. Half = 1,412.955.
    // 20,000 - 1,412.955 - 16,100 = 2,487.045. QBI = 497.409. Taxable 1,989.636.
    // Tax = 10% = 198.96.
    const t = app.calculateTotalTax(20000, 0, STANDARD_DEDUCTION);
    assertDollars(t.seTax, 2825.91, 'SE tax');
    assertDollars(t.qbiDeduction, 497.41, 'QBI deduction');
    assertDollars(t.incomeTax, 198.96, 'income tax');
    assertDollars(t.totalTax, 3024.87, 'total tax');
});

test('income below the standard deduction still owes SE tax', () => {
    // Net 10,000: SE tax = 9,235 x 15.3% = 1,412.96. No income tax.
    const t = app.calculateTotalTax(10000, 0, STANDARD_DEDUCTION);
    assertDollars(t.seTax, 1412.96, 'SE tax');
    assertDollars(t.incomeTax, 0, 'income tax');
    assertDollars(t.qbiDeduction, 0, 'QBI deduction');
});

test('zero income is zero tax', () => {
    const t = app.calculateTotalTax(0, 0, STANDARD_DEDUCTION);
    assertDollars(t.totalTax, 0, 'total tax');
});

test('high income: Social Security cap, Additional Medicare, QBI fully phased out', () => {
    // Net 400,000. SE base 369,400.
    // SS capped: 184,500 x 12.4% = 22,878.00. Medicare 369,400 x 2.9% = 10,712.60.
    // Additional Medicare (369,400 - 200,000) x 0.9% = 1,524.60. SE tax 35,115.20.
    // Deductible half EXCLUDES Additional Medicare: (22,878 + 10,712.60) / 2 = 16,795.30.
    const t = app.calculateTotalTax(400000, 0, STANDARD_DEDUCTION);
    assertDollars(t.ssTax, 22878.00, 'Social Security tax');
    assertDollars(t.additionalMedicareTax, 1524.60, 'Additional Medicare Tax');
    assertDollars(t.seTax, 35115.20, 'SE tax');
    assertDollars(t.seTaxDeduction, 16795.30, 'half SE tax');
    assert.strictEqual(t.ssWageBaseCapped, true);
    assertDollars(t.qbiDeduction, 0, 'QBI deduction (therapist is an SSTB)');
});

test('QBI inside the SSTB phase-out is 20% x QBI x (applicable %) squared', () => {
    const t = app.calculateTotalTax(270000, 0, STANDARD_DEDUCTION);
    assert.ok(t.taxableIncomeBeforeQBI > 201750 && t.taxableIncomeBeforeQBI < 276750, 'case must be in the phase-out');
    const applicablePct = 1 - (t.taxableIncomeBeforeQBI - 201750) / 75000;
    const expected = 0.20 * (270000 - t.seTaxDeduction) * applicablePct * applicablePct;
    assertDollars(t.qbiDeduction, expected, 'QBI deduction');
});

test('QBI never exceeds 20% of taxable income before QBI', () => {
    for (let net = 0; net <= 500000; net += 2500) {
        const t = app.calculateTotalTax(net, 0, STANDARD_DEDUCTION);
        assert.ok(t.qbiDeduction <= 0.20 * t.taxableIncomeBeforeQBI + 0.01 || t.qbiDeduction === 400,
            `QBI too large at net ${net}`);
    }
});

test('total tax is finite, non-negative and never falls as income rises', () => {
    let previous = 0;
    for (let net = 0; net <= 700000; net += 500) {
        const total = app.calculateTotalTax(net, 0, STANDARD_DEDUCTION).totalTax;
        assert.ok(Number.isFinite(total) && total >= 0, `bad total at net ${net}: ${total}`);
        assert.ok(total >= previous - 0.01, `tax fell from ${previous} to ${total} at net ${net}`);
        previous = total;
    }
});

test('business expenses reduce tax; bad input returns zeros instead of NaN', () => {
    const without = app.calculateTotalTax(108000, 0, STANDARD_DEDUCTION).totalTax;
    const withExpenses = app.calculateTotalTax(108000, 8000, STANDARD_DEDUCTION).totalTax;
    assert.ok(withExpenses < without);
    assert.strictEqual(app.calculateTotalTax(NaN, 0, STANDARD_DEDUCTION).totalTax, 0);
    assert.strictEqual(app.calculateTotalTax('108000', 0, STANDARD_DEDUCTION).totalTax, 0);
});

// ---------------------------------------------------------------------------
// Week numbering
// ---------------------------------------------------------------------------
test('getCurrentWeek always returns a week that has a slot (1-52)', () => {
    const week = (y, m, d) => app.getCurrentWeek(new Date(y, m - 1, d, 12));
    assert.strictEqual(week(2026, 1, 1), 1);
    assert.strictEqual(week(2026, 1, 5), 2);
    assert.strictEqual(week(2026, 11, 10), 46);
    assert.strictEqual(week(2026, 12, 25), 52);
    // ISO week 53 of 2026 - the app has no week 53
    assert.strictEqual(week(2026, 12, 28), 52);
    assert.strictEqual(week(2026, 12, 31), 52);
    // After the tax year: stay on the last week, never wrap to week 1
    assert.strictEqual(week(2027, 1, 1), 52);
    assert.strictEqual(week(2027, 1, 6), 52);
    assert.strictEqual(week(2027, 6, 1), 52);
    for (let day = 0; day < 500; day++) {
        const w = app.getCurrentWeek(new Date(2026, 0, 1 + day, 12));
        assert.ok(Number.isInteger(w) && w >= 1 && w <= 52, `week ${w} on day offset ${day}`);
    }
});

test('week Fridays: week 1 is Jan 2, 2026 and week 52 is Dec 25, 2026', () => {
    const first = app.getFridayOfWeek(1, 2026);
    const last = app.getFridayOfWeek(52, 2026);
    assert.deepStrictEqual([first.getFullYear(), first.getMonth(), first.getDate(), first.getDay()], [2026, 0, 2, 5]);
    assert.deepStrictEqual([last.getFullYear(), last.getMonth(), last.getDate(), last.getDay()], [2026, 11, 25, 5]);
});

// ---------------------------------------------------------------------------
// Quarterly payments
// ---------------------------------------------------------------------------
function schedule(paidFlags, amount) {
    return app.QUARTERLY_DUE_DATES.map((q, i) => ({ ...q, amount, paid: paidFlags[i], datePaid: null }));
}

test('quarterly amounts: nothing paid yet -> total / 4 each, rounded up', () => {
    const result = app.recalculateQuarterlyAmounts(schedule([false, false, false, false], 0), 24001);
    assert.deepStrictEqual(Array.from(result.map(q => q.amount)), [6001, 6001, 6001, 6001]);
});

test('quarterly amounts: paid quarters are never rewritten; the rest still reach the target', () => {
    // Q1 and Q2 paid at 6,000 each, then the prior-year tax is corrected to 26,000.
    // Remaining 26,000 - 12,000 = 14,000 over two quarters = 7,000 each.
    const result = app.recalculateQuarterlyAmounts(schedule([true, true, false, false], 6000), 26000);
    assert.deepStrictEqual(Array.from(result.map(q => q.amount)), [6000, 6000, 7000, 7000]);
    assert.ok(result.reduce((sum, q) => sum + q.amount, 0) >= 26000);
});

test('quarterly amounts: saving an unchanged total changes nothing; lower total never goes negative', () => {
    const unchanged = app.recalculateQuarterlyAmounts(schedule([true, false, false, false], 6000), 24000);
    assert.deepStrictEqual(Array.from(unchanged.map(q => q.amount)), [6000, 6000, 6000, 6000]);
    const lowered = app.recalculateQuarterlyAmounts(schedule([true, true, true, false], 6000), 10000);
    assert.deepStrictEqual(Array.from(lowered.map(q => q.amount)), [6000, 6000, 6000, 0]);
    const allPaid = schedule([true, true, true, true], 6000);
    assert.strictEqual(app.recalculateQuarterlyAmounts(allPaid, 30000), allPaid);
});

test('quarterly catch-up: shortfall spread over whole weeks to the period end', () => {
    // Q4: need 6,000, have 4,000. 2026-11-10 to 2026-12-31 is 51 days = 7 whole weeks.
    const q4 = { quarter: 'Q4 2026', periodEnd: '2026-12-31', due: '2027-01-15', amount: 6000, paid: false };
    const result = app.computeQuarterlyCatchup(q4, 4000, new Date(2026, 10, 10, 9));
    assert.strictEqual(result.info.weeksToTarget, 7);
    assertDollars(result.rate, 2000 / 7, 'catch-up rate');
    assert.strictEqual(app.computeQuarterlyCatchup(q4, 6000, new Date(2026, 10, 10)).rate, 0);
});

// ---------------------------------------------------------------------------
// Weekly savings recommendation
// ---------------------------------------------------------------------------
test('weekly savings: covers the higher of safe harbor and projected tax', () => {
    const settings = { tax2025Total: 30000, standardDeduction: STANDARD_DEDUCTION };
    // 26 weeks at $2,000 -> projected $104,000 gross, tax well under the $30,000 safe harbor.
    const result = app.calculateSmartTaxSavings(2000, 52000, 26, 10000, 0, settings, 0, [], new Date(2026, 6, 1));
    assertDollars(result.totalNeeded, 30000, 'total needed');
    assertDollars(result.amount, (30000 - 10000) / 26, 'weekly amount');
    assert.ok(result.projectedTax < 30000);
});

test('weekly savings: nothing more to save when already fully funded', () => {
    const settings = { tax2025Total: 20000, standardDeduction: STANDARD_DEDUCTION };
    const result = app.calculateSmartTaxSavings(2000, 52000, 26, 40000, 0, settings, 0, [], new Date(2026, 6, 1));
    assert.strictEqual(result.amount, 0);
});

// ---------------------------------------------------------------------------
if (failures.length > 0) {
    for (const { name, error } of failures) {
        console.error(`FAIL  ${name}\n      ${error.message}\n`);
    }
    console.error(`${failures.length} failed, ${passed} passed`);
    process.exit(1);
}
console.log(`All ${passed} tests passed`);
