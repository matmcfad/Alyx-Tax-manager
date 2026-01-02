# 2026 Tax Year Migration Plan

## Status Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Infrastructure Setup | ✅ DONE | Separate repos, DNS, auth worker |
| Phase 1: Year-End Close | ⏳ TODO | Needs implementation in 2025 repo |
| Phase 2: 2025 Archive | ✅ DONE | Separate repo instead of branch |
| Phase 3: 2026 Updates | ⏳ TODO | Tax constants, dates, strings |
| Phase 4: Prior Year Summary | ⏳ TODO | New screen in 2026 app |
| Phase 5: Deployment | ✅ PARTIAL | DNS done, auth done, apps need updates |

---

## Overview

This document details the complete migration plan from the 2025 Alyx Tax Manager to a 2026 version. The plan preserves the 2025 app at a separate URL while creating a fresh 2026 version.

**Decision:** Fresh 2026 version with Year-End Close handoff (not multi-year switching)

**Why:** A financial app cannot make mistakes. Multi-year switching introduces silent failure modes where wrong-year tax constants could be applied. Separate apps = separate concerns = fewer bugs.

---

## Architecture ✅ IMPLEMENTED

> **Note:** Implementation uses separate repositories instead of branches for cleaner isolation.

```
2025 App (frozen after Year-End Close)     2026 App (new)
───────────────────────────────────────    ─────────────────────
URL: 2025.therapytaxapp.work               URL: app.therapytaxapp.work
Repo: Alyx-Tax-manager-2025                Repo: Alyx-Tax-manager (this repo)

Features:                                  Features:
├─ Year-End Close feature (TODO)           ├─ Updated 2026 tax constants (TODO)
├─ Generates final report JSON             ├─ 2026 week dates (52 Fridays) (TODO)
└─ Saves to Google Drive                   ├─ Prior Year Summary (reads 2025 report) (TODO)
                                           └─ Setup pulls safe harbor from report (TODO)

Data Flow:
2025 App → Year-End Close → 2025-final-report.json → 2026 App reads it
```

---

## Phase 1: Add Year-End Close Feature to 2025 App ⏳ TODO

> **Location:** This work happens in the `Alyx-Tax-manager-2025` repository

### 1.1 Add Constants (index.html ~line 98)

```javascript
const YEAR_END_REPORT_FILENAME = 'alyx-tax-manager-2025-final-report.json';
```

### 1.2 Add generateYearEndReport Function (index.html ~line 738)

Add this function after the existing CSV export functions:

```javascript
function generateYearEndReport(appData) {
    const completedWeeks = appData.weeks.filter(w => w.income !== null);
    const annualExpenses = calculateAnnualBusinessExpenses(appData.expenses.budget);

    // Calculate final tax figures
    const grossIncome = completedWeeks.reduce((sum, w) => sum + (w.income || 0), 0);
    const finalTax = calculateTotalTax(grossIncome, annualExpenses, appData.settings.standardDeduction);

    return {
        reportVersion: "1.0",
        generatedAt: new Date().toISOString(),
        taxYear: 2025,

        // Summary totals
        summary: {
            grossIncome: grossIncome,
            totalBusinessExpenses: completedWeeks.reduce((sum, w) => sum + (w.business || 0), 0),
            totalTaxSaved: completedWeeks.reduce((sum, w) => sum + (w.tax || 0), 0),
            totalPaycheck: completedWeeks.reduce((sum, w) => sum + (w.paycheck || 0), 0),
            weeksRecorded: completedWeeks.length
        },

        // Final tax calculation (for 2026 safe harbor)
        finalTaxCalculation: {
            grossIncome: finalTax.grossIncome,
            businessExpenses: finalTax.businessExpenses,
            netProfit: finalTax.netProfit,
            selfEmploymentTaxDeduction: finalTax.selfEmploymentTaxDeduction,
            adjustedGrossIncome: finalTax.adjustedGrossIncome,
            taxableIncome: finalTax.taxableIncome,
            seTax: finalTax.seTax,
            incomeTax: finalTax.incomeTax,
            qbiDeduction: finalTax.qbiDeduction,
            totalTax: finalTax.totalTax,
            effectiveRate: finalTax.effectiveRate
        },

        // Quarterly payment history
        quarterlyPayments: appData.quarterlyPayments.map(q => ({
            quarter: q.quarter,
            period: q.period,
            due: q.due,
            amount: q.amount,
            paid: q.paid,
            datePaid: q.datePaid
        })),

        // Full weekly data for reference
        weeks: completedWeeks.map(w => ({
            week: w.week,
            date: w.date,
            income: w.income,
            business: w.business,
            tax: w.tax,
            paycheck: w.paycheck,
            notes: w.notes || '',
            status: w.status
        })),

        // Settings for reference
        settings: {
            tax2024Total: appData.settings.tax2024Total,
            quarterlyPayment: appData.settings.quarterlyPayment,
            standardDeduction: appData.settings.standardDeduction,
            startingTaxSavingsBalance: appData.settings.startingTaxSavingsBalance,
            businessName: appData.settings.businessName
        },

        // Expense configuration
        expenseBudget: appData.expenses.budget,
        expenseDueDates: appData.expenses.dueDates,

        // Business transactions (if any)
        businessTransactions: appData.businessTransactions || [],
        taxTransactions: appData.taxTransactions || []
    };
}
```

### 1.3 Add saveYearEndReport Function (inside useSyncManager or standalone)

This saves to a SEPARATE file from the regular backup:

```javascript
async function saveYearEndReport(report) {
    try {
        const token = await ensureValidToken();
        if (!token) {
            throw new Error('Not authenticated with Google Drive');
        }

        // Check if report file already exists
        const searchResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${YEAR_END_REPORT_FILENAME}'&fields=files(id,name)`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const searchData = await searchResponse.json();
        const existingFile = searchData.files?.[0];

        const metadata = {
            name: YEAR_END_REPORT_FILENAME,
            mimeType: 'application/json'
        };

        if (!existingFile) {
            metadata.parents = ['appDataFolder'];
        }

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));

        const uploadUrl = existingFile
            ? `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

        const method = existingFile ? 'PATCH' : 'POST';

        const uploadResponse = await fetch(uploadUrl, {
            method: method,
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });

        if (!uploadResponse.ok) {
            throw new Error(`Upload failed: ${uploadResponse.status}`);
        }

        const result = await uploadResponse.json();
        return { success: true, fileId: result.id };

    } catch (error) {
        console.error('Failed to save year-end report:', error);
        return { success: false, error: error.message };
    }
}
```

### 1.4 Add Year-End Close UI to Settings Screen (~line 3883)

Add a new section in the Settings component, after the existing data management section:

```javascript
{/* Year-End Close Section */}
{googleAccessToken && appData.settings.setupComplete && (
    <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4">Year-End Close</h2>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <p className="text-amber-800 text-sm">
                <strong>Important:</strong> This will generate a final report of your 2025 tax year
                and save it to Google Drive. The 2026 app will use this report to display your
                2025 summary and calculate your safe harbor amount.
            </p>
        </div>

        <div className="mb-4">
            <h3 className="font-semibold mb-2">What will be saved:</h3>
            <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
                <li>Total gross income: ${appData.weeks.filter(w => w.income !== null).reduce((sum, w) => sum + (w.income || 0), 0).toLocaleString()}</li>
                <li>Weeks recorded: {appData.weeks.filter(w => w.income !== null).length} of 52</li>
                <li>Quarterly payments: {appData.quarterlyPayments.filter(q => q.paid).length} of 4 paid</li>
                <li>All weekly income and expense data</li>
                <li>Final tax calculation for safe harbor</li>
            </ul>
        </div>

        {yearEndCloseStatus === 'success' ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800">
                    ✓ 2025 Year-End Report saved successfully! You can now switch to the 2026 app.
                </p>
            </div>
        ) : (
            <button
                onClick={handleYearEndClose}
                disabled={yearEndCloseStatus === 'saving'}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
                {yearEndCloseStatus === 'saving' ? 'Saving Report...' : 'Generate 2025 Year-End Report'}
            </button>
        )}

        {yearEndCloseStatus === 'error' && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">Failed to save report. Please try again.</p>
            </div>
        )}
    </div>
)}
```

### 1.5 Add State and Handler for Year-End Close

In the Settings component (or App component if easier):

```javascript
const [yearEndCloseStatus, setYearEndCloseStatus] = useState(null); // null, 'saving', 'success', 'error'

const handleYearEndClose = async () => {
    if (!window.confirm('Generate your 2025 Year-End Report? This will save all your 2025 data to Google Drive for use by the 2026 app.')) {
        return;
    }

    setYearEndCloseStatus('saving');

    try {
        const report = generateYearEndReport(appData);
        const result = await saveYearEndReport(report);

        if (result.success) {
            setYearEndCloseStatus('success');
        } else {
            setYearEndCloseStatus('error');
            console.error('Year-end close failed:', result.error);
        }
    } catch (error) {
        setYearEndCloseStatus('error');
        console.error('Year-end close error:', error);
    }
};
```

---

## Phase 2: Create 2025 Archive ✅ DONE

> **Implementation Note:** Instead of a branch, we created a separate repository (`Alyx-Tax-manager-2025`) for cleaner isolation.

### 2.1 Repository Setup ✅ DONE

- Created separate repo: `Alyx-Tax-manager-2025`
- Configured GitHub Pages for `2025.therapytaxapp.work`
- HTTPS certificate pending (GitHub Pages provisioning)

### 2.2 Update manifest.json ⏳ TODO

```json
{
    "name": "Alyx Tax Manager 2025 (Archive)",
    "short_name": "Alyx 2025",
    "description": "2025 Tax Year - Archived Version",
    ...
}
```

### 2.3 Update service-worker.js ✅ DONE

```javascript
const CACHE_NAME = 'alyx-income-manager-2025-final';
```

---

## Phase 3: Update main Branch for 2026 ⏳ TODO

> **Location:** This work happens in this repository (`Alyx-Tax-manager`)

Switch back to main and make all 2026 changes:

### 3.1 Tax Constants (lines 46-90)

Replace the 2025 constants with 2026 values:

```javascript
// =====================================================
// 2026 TAX CONSTANTS
// Source: IRS Revenue Procedure 2025-32
// =====================================================

// 2026 Tax Brackets for Single Filers
const TAX_BRACKETS_2026 = [
    { min: 0, max: 12400, rate: 0.10, base: 0 },
    { min: 12400, max: 50400, rate: 0.12, base: 1240 },
    { min: 50400, max: 105700, rate: 0.22, base: 5800 },
    { min: 105700, max: 201775, rate: 0.24, base: 17966 },
    { min: 201775, max: 256225, rate: 0.32, base: 41024 },
    { min: 256225, max: 640600, rate: 0.35, base: 58448 },
    { min: 640600, max: Infinity, rate: 0.37, base: 192979.75 }
];

// 2026 Quarterly Estimated Tax Due Dates
const QUARTERLY_DUE_DATES = [
    { quarter: "Q1 2026", period: "Jan 1 - Mar 31", periodEnd: "2026-03-31", due: "2026-04-15", amount: 0 },
    { quarter: "Q2 2026", period: "Apr 1 - May 31", periodEnd: "2026-05-31", due: "2026-06-15", amount: 0 },
    { quarter: "Q3 2026", period: "Jun 1 - Aug 31", periodEnd: "2026-08-31", due: "2026-09-15", amount: 0 },
    { quarter: "Q4 2026", period: "Sep 1 - Dec 31", periodEnd: "2026-12-31", due: "2027-01-15", amount: 0 }
];

// Default settings for new users
const DEFAULT_SETTINGS = {
    tax2025Total: 0,              // Will be pulled from 2025 final report
    quarterlyPayment: 0,          // tax2025Total / 4
    standardDeduction: 16100,     // 2026 Single filer standard deduction
    startingTaxSavingsBalance: 0,
    startDate: "2026-01-01",
    currentYear: 2026,
    businessName: "Alyx Steadman Therapy PLLC"
};

// 2026 Self-Employment Tax Constants
const SE_TAX_2026 = {
    socialSecurityRate: 0.124,           // 12.4% - unchanged
    socialSecurityWageBase: 184500,      // 2026 wage base (up from 176,100)
    medicareRate: 0.029,                 // 2.9% - unchanged
    additionalMedicareRate: 0.009,       // 0.9% - unchanged
    additionalMedicareThreshold: 200000, // Single filer threshold
    seTaxBaseMultiplier: 0.9235          // Never changes
};

// 2026 Qualified Business Income (QBI) Deduction Constants
// Note: OBBBA expanded phase-out range from $50k to $75k
const QBI_2026 = {
    deductionRate: 0.20,                 // 20% deduction rate - unchanged
    sstbThresholdSingle: 201750,         // Phase-out begins (up from 191,950)
    sstbPhaseOutSingle: 276750,          // Phase-out ends (now $75k range)
    minimumDeduction: 400,               // NEW in 2026: minimum $400 if QBI >= $1000
    isSSTB: true                         // Therapist = Specified Service Trade or Business
};
```

### 3.2 Update Function References

Rename all references from 2025 to 2026 constants:

- `TAX_BRACKETS_2025` → `TAX_BRACKETS_2026`
- `SE_TAX_2025` → `SE_TAX_2026`
- `QBI_2025` → `QBI_2026`

Search for these patterns and update:
```
TAX_BRACKETS_2025  (should appear ~3-5 times)
SE_TAX_2025        (should appear ~5-8 times)
QBI_2025           (should appear ~3-5 times)
```

### 3.3 Update tax2024Total → tax2025Total

Search and replace throughout the codebase:
- `tax2024Total` → `tax2025Total`
- Update any comments that mention "2024"

### 3.4 Update Drive Filenames (line 98)

```javascript
const DRIVE_BACKUP_FILENAME = 'alyx-tax-manager-2026-backup.json';
const PRIOR_YEAR_REPORT_FILENAME = 'alyx-tax-manager-2025-final-report.json';
```

### 3.5 Update Week Date Generation

**Line 1381 (migration):**
```javascript
date: getFridayOfWeek(i + 1, 2026).toISOString().split('T')[0]
```

**Line 1402 (initialization):**
```javascript
date: getFridayOfWeek(i + 1, 2026).toISOString().split('T')[0]
```

### 3.6 Add Data Migration v2 → v3

Around line 1374, add new migration:

```javascript
// Migration: v2 -> v3 (2026 week dates)
if ((data.dataVersion || 1) < 3) {
    data = {
        ...data,
        dataVersion: 3,
        weeks: data.weeks.map((week, i) => ({
            ...week,
            date: getFridayOfWeek(i + 1, 2026).toISOString().split('T')[0]
        })),
        // Migrate settings field name
        settings: {
            ...data.settings,
            tax2025Total: data.settings.tax2024Total || 0
        }
    };
    // Remove old field
    delete data.settings.tax2024Total;
}
```

### 3.7 Update UI Strings

Search and replace these strings:

| Search | Replace |
|--------|---------|
| `Projected 2025 tax` | `Projected 2026 tax` |
| `2025 tax` | `2026 tax` |
| `2025 gross income` | `2026 gross income` |
| `2025 MONTHLY EXPENSES` | `2026 MONTHLY EXPENSES` |
| `Total 2025:` | `Total 2026:` |
| `Standard Deduction (2025)` | `Standard Deduction (2026)` |
| `quarterly estimated payments for 2025` | `quarterly estimated payments for 2026` |

**Locations to check:**
- Line 322, 327 (tax calculation comments)
- Line 1854 (setup wizard)
- Line 2725, 2877 (tax displays)
- Line 3565 (income projection)
- Line 3835, 3849 (expenses section)
- Line 4192 (settings)

### 3.8 Update Service Worker

```javascript
const CACHE_NAME = 'alyx-income-manager-2026-v1';
```

### 3.9 Update Manifest

```json
{
    "name": "Alyx Steadman Therapy - Income Manager 2026",
    "short_name": "Alyx 2026",
    ...
}
```

---

## Phase 4: Add Prior Year Summary Screen ⏳ TODO

> **Location:** This work happens in this repository (`Alyx-Tax-manager`)

### 4.1 Add Navigation Item (~line 1554)

```javascript
const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'history', label: 'History', icon: '📅' },
    { id: 'taxes', label: 'Taxes', icon: '💰' },
    { id: 'expenses', label: 'Expenses', icon: '🏢' },
    { id: 'prior-year', label: '2025 Summary', icon: '📋' },  // NEW
    { id: 'settings', label: 'Settings', icon: '⚙️' }
];
```

### 4.2 Add Screen Routing (~line 1527)

```javascript
{currentScreen === 'prior-year' && (
    <PriorYearSummary
        googleAccessToken={googleAccessToken}
        ensureValidToken={ensureValidToken}
    />
)}
```

### 4.3 Create PriorYearSummary Component

Add this component (can be added near other screen components):

```javascript
function PriorYearSummary({ googleAccessToken, ensureValidToken }) {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function loadPriorYearReport() {
            if (!googleAccessToken) {
                setLoading(false);
                setError('not-connected');
                return;
            }

            try {
                const token = await ensureValidToken();

                // Search for the 2025 final report
                const searchResponse = await fetch(
                    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${PRIOR_YEAR_REPORT_FILENAME}'&fields=files(id,name)`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );
                const searchData = await searchResponse.json();

                if (!searchData.files || searchData.files.length === 0) {
                    setError('not-found');
                    setLoading(false);
                    return;
                }

                // Download the report
                const fileId = searchData.files[0].id;
                const fileResponse = await fetch(
                    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );
                const reportData = await fileResponse.json();

                setReport(reportData);
                setLoading(false);
            } catch (err) {
                console.error('Failed to load prior year report:', err);
                setError('failed');
                setLoading(false);
            }
        }

        loadPriorYearReport();
    }, [googleAccessToken, ensureValidToken]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-500">Loading 2025 summary...</div>
            </div>
        );
    }

    if (error === 'not-connected') {
        return (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 m-4">
                <h2 className="text-xl font-bold text-yellow-800 mb-2">Google Drive Not Connected</h2>
                <p className="text-yellow-700">
                    Connect to Google Drive in Settings to view your 2025 tax year summary.
                </p>
            </div>
        );
    }

    if (error === 'not-found') {
        return (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 m-4">
                <h2 className="text-xl font-bold text-blue-800 mb-2">No 2025 Report Found</h2>
                <p className="text-blue-700 mb-4">
                    Your 2025 Year-End Report hasn't been generated yet.
                </p>
                <p className="text-blue-600 text-sm">
                    To create it, visit the 2025 app at{' '}
                    <a href="https://2025.therapytaxapp.work" className="underline" target="_blank" rel="noopener noreferrer">
                        2025.therapytaxapp.work
                    </a>
                    {' '}and use the Year-End Close feature in Settings.
                </p>
            </div>
        );
    }

    if (error === 'failed') {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 m-4">
                <h2 className="text-xl font-bold text-red-800 mb-2">Failed to Load Report</h2>
                <p className="text-red-700">
                    There was an error loading your 2025 summary. Please try again later.
                </p>
            </div>
        );
    }

    // Successfully loaded report
    return (
        <div className="space-y-6 p-4">
            {/* Header */}
            <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">2025 Tax Year Summary</h1>
                        <p className="text-gray-600">Read-only view of your closed 2025 tax year</p>
                    </div>
                    <div className="text-right text-sm text-gray-500">
                        <div>Generated: {new Date(report.generatedAt).toLocaleDateString()}</div>
                        <div>Weeks recorded: {report.summary.weeksRecorded} of 52</div>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-600">Gross Income</div>
                    <div className="text-2xl font-bold text-green-600">
                        ${report.summary.grossIncome.toLocaleString()}
                    </div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-600">Business Expenses</div>
                    <div className="text-2xl font-bold text-orange-600">
                        ${report.summary.totalBusinessExpenses.toLocaleString()}
                    </div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-600">Tax Saved</div>
                    <div className="text-2xl font-bold text-blue-600">
                        ${report.summary.totalTaxSaved.toLocaleString()}
                    </div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-600">Total Tax Liability</div>
                    <div className="text-2xl font-bold text-red-600">
                        ${report.finalTaxCalculation.totalTax.toLocaleString()}
                    </div>
                </div>
            </div>

            {/* Tax Breakdown */}
            <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold mb-4">Final Tax Calculation</h2>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1 border-b">
                        <span>Gross Income</span>
                        <span>${report.finalTaxCalculation.grossIncome.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b">
                        <span>Business Expenses</span>
                        <span>-${report.finalTaxCalculation.businessExpenses.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b font-semibold">
                        <span>Net Profit</span>
                        <span>${report.finalTaxCalculation.netProfit.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b">
                        <span>Self-Employment Tax</span>
                        <span>${report.finalTaxCalculation.seTax.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b">
                        <span>Income Tax</span>
                        <span>${report.finalTaxCalculation.incomeTax.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b">
                        <span>QBI Deduction (savings)</span>
                        <span className="text-green-600">-${report.finalTaxCalculation.qbiDeduction.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-2 font-bold text-lg border-t-2">
                        <span>Total Tax Liability</span>
                        <span>${report.finalTaxCalculation.totalTax.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-1 text-gray-600">
                        <span>Effective Tax Rate</span>
                        <span>{(report.finalTaxCalculation.effectiveRate * 100).toFixed(1)}%</span>
                    </div>
                </div>
            </div>

            {/* Quarterly Payments */}
            <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold mb-4">Quarterly Payments</h2>
                <div className="space-y-2">
                    {report.quarterlyPayments.map(q => (
                        <div key={q.quarter} className="flex justify-between items-center py-2 border-b">
                            <div>
                                <span className="font-medium">{q.quarter}</span>
                                <span className="text-sm text-gray-500 ml-2">({q.period})</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <span>${q.amount.toLocaleString()}</span>
                                {q.paid ? (
                                    <span className="text-green-600 text-sm">✓ Paid {q.datePaid}</span>
                                ) : (
                                    <span className="text-gray-400 text-sm">Not paid</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Settings Reference */}
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
                <p><strong>2025 Settings:</strong></p>
                <p>Prior Year Tax (2024): ${report.settings.tax2024Total?.toLocaleString() || 'N/A'}</p>
                <p>Standard Deduction: ${report.settings.standardDeduction?.toLocaleString()}</p>
            </div>
        </div>
    );
}
```

### 4.4 Update Setup Wizard to Pull from 2025 Report

Modify the setup wizard (~line 1619) to auto-detect the 2025 report:

```javascript
// Add state for prior year detection
const [priorYearReportFound, setPriorYearReportFound] = useState(false);
const [priorYearTax, setPriorYearTax] = useState(null);
const [checkingPriorYear, setCheckingPriorYear] = useState(false);

// Add useEffect to check for prior year report after auth
useEffect(() => {
    async function checkPriorYearReport() {
        if (googleAccessToken && !priorYearReportFound) {
            setCheckingPriorYear(true);
            try {
                const token = await ensureValidToken();

                const response = await fetch(
                    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${PRIOR_YEAR_REPORT_FILENAME}'&fields=files(id)`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );
                const data = await response.json();

                if (data.files && data.files.length > 0) {
                    const fileResponse = await fetch(
                        `https://www.googleapis.com/drive/v3/files/${data.files[0].id}?alt=media`,
                        { headers: { 'Authorization': `Bearer ${token}` } }
                    );
                    const report = await fileResponse.json();

                    setPriorYearReportFound(true);
                    setPriorYearTax(report.finalTaxCalculation.totalTax);

                    // Auto-populate the field
                    setTax2025Total(report.finalTaxCalculation.totalTax);
                }
            } catch (err) {
                console.error('Error checking for prior year report:', err);
            }
            setCheckingPriorYear(false);
        }
    }

    checkPriorYearReport();
}, [googleAccessToken]);
```

Update the tax input step UI to show when auto-detected:

```javascript
{/* In the prior year tax input step */}
{priorYearReportFound ? (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
        <p className="text-green-800">
            ✓ Found your 2025 Year-End Report! Your 2025 tax liability was{' '}
            <strong>${priorYearTax.toLocaleString()}</strong>.
            This has been auto-filled below.
        </p>
    </div>
) : checkingPriorYear ? (
    <div className="text-gray-500 mb-4">Checking for 2025 report...</div>
) : googleAccessToken ? (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
        <p className="text-yellow-800 text-sm">
            No 2025 Year-End Report found. Enter your 2025 tax total manually from your tax return.
        </p>
    </div>
) : null}
```

---

## Phase 5: Deployment ✅ PARTIAL

### 5.1 Cloudflare DNS ✅ DONE

CNAME record for 2025 archive configured:

| Type | Name | Target | Proxy Status |
|------|------|--------|--------------|
| CNAME | `2025` | `mcfadden-matthew.github.io` | DNS only (gray cloud) |

### 5.2 Auth Worker CORS Update ✅ DONE

**File:** `workers/auth-worker/wrangler.toml`

```toml
[vars]
ALLOWED_ORIGINS = "https://app.therapytaxapp.work,https://2025.therapytaxapp.work,http://2025.therapytaxapp.work"
```

> **Note:** `http://2025.therapytaxapp.work` temporarily added while HTTPS certificate is pending.

**File:** `workers/auth-worker/src/index.ts` ✅ DONE

Multi-origin CORS handling implemented with:
- `getAllowedOrigins()` - parses comma-separated origins
- `getRequestOrigin()` - validates request origin against allowed list
- `handleLogin()` - reads `?origin=` param for redirect targeting
- `handleCallback()` - uses OAuth `state` param to redirect to correct origin

### 5.3 Google Cloud Console ✅ DONE

Authorized JavaScript origins added:
- `https://app.therapytaxapp.work`
- `https://2025.therapytaxapp.work`

### 5.4 GitHub Actions Workflow ✅ DONE

Fixed deploy workflow (`.github/workflows/deploy-worker.yml`) to use direct `npx wrangler deploy` instead of `cloudflare/wrangler-action@v3` due to env var passing issues.

### 5.5 Deploy Commands

```bash
# Deploy auth worker - automatic via GitHub Actions on push to workers/auth-worker/**
# Or manual: cd workers/auth-worker && npx wrangler deploy

# 2025 repo deploys to 2025.therapytaxapp.work via GitHub Pages
# 2026 repo (this one) deploys to app.therapytaxapp.work via GitHub Pages
```

### 5.6 Pending Items

- [ ] HTTPS certificate for `2025.therapytaxapp.work` (GitHub Pages provisioning in progress)
- [ ] Remove `http://2025.therapytaxapp.work` from ALLOWED_ORIGINS after HTTPS works

---

## Verification Checklist

### After Phase 1 (Year-End Close)
- [ ] Year-End Close button appears in Settings when connected to Drive
- [ ] Clicking generates report and shows success message
- [ ] Report file appears in Google Drive app folder
- [ ] Report contains all expected data

### After Phase 2 (2025 Archive)
- [x] 2025.therapytaxapp.work resolves
- [x] 2025 app loads and works
- [x] Google Drive auth works on 2025 subdomain
- [ ] Year-End Close feature works (depends on Phase 1)
- [ ] HTTPS certificate issued

### After Phase 3 (2026 Updates)
- [ ] Tax brackets are correct for 2026
- [ ] Week dates are 2026 Fridays
- [ ] UI strings say "2026" not "2025"
- [ ] New backup file created (2026-backup.json)
- [ ] Old 2025 backup still exists (not overwritten)

### After Phase 4 (Prior Year Summary)
- [ ] "2025 Summary" nav item appears
- [ ] Prior Year Summary loads 2025 report from Drive
- [ ] Setup wizard auto-detects 2025 tax total
- [ ] Manual entry still works if report not found

### After Phase 5 (Deployment)
- [x] app.therapytaxapp.work loads 2026 app
- [x] 2025.therapytaxapp.work loads 2025 app
- [x] Both apps can authenticate with Google
- [ ] 2026 app can read 2025 final report (depends on Phase 1 & 4)

---

## Rollback Plan

If something goes wrong:

1. **2026 app broken:** Revert main branch to pre-2026 commit, redeploy
2. **2025 archive broken:** The 2025 branch is a snapshot, restore from git history
3. **Auth broken:** Revert wrangler.toml CORS changes, redeploy worker
4. **Data corruption:** User's Google Drive backup is unaffected by app changes

---

## Next Steps

1. **Phase 1:** Add Year-End Close feature to 2025 repo
2. **Wait:** User generates 2025 report using Year-End Close
3. **Phase 3:** Update this repo (2026 app) with 2026 tax constants
4. **Phase 4:** Add Prior Year Summary screen to 2026 app
5. **Cleanup:** Remove http origin from ALLOWED_ORIGINS after HTTPS works
