# Alyx Steadman Therapy PLLC - Income Manager

A Progressive Web App for managing weekly income, business expenses, and tax savings for self-employed therapists.

## Features

- **Weekly Income Tracking**: Enter weekly income and automatically calculate splits for business expenses, tax savings, and personal paycheck
- **Smart Tax Management**: Track quarterly estimated payments with countdown to period end (when money needs to be saved)
- **Expense Budgeting**: Upload monthly expense budgets with due dates via CSV
- **PWA Installation**: Install as a native app on Windows, Mac, or mobile devices
- **Offline Support**: Works completely offline after installation with automatic data caching
- **Local Data Storage**: All data stored locally in your browser - completely private
- **Data Export**: Export data to CSV for your CPA or backup as JSON
- **Transparent Calculations**: All tax calculations are auditable with detailed breakdowns

## Quick Start

**New users**: See [QUICK-START.md](QUICK-START.md) for the fastest setup path.

## File Structure

```
Alyx Tax manager/
├── index.html              # Main application file (PWA)
├── manifest.json           # PWA manifest (app metadata)
├── service-worker.js       # Service worker (offline support)
├── icon-192.png           # App icon 192x192 (you need to create this)
├── icon-512.png           # App icon 512x512 (you need to create this)
├── START.bat              # Windows launcher (runs local HTTP server)
├── START.sh               # Mac/Linux launcher (runs local HTTP server)
├── expense-budget-template.csv  # Template for expense budget
├── QUICK-START.md         # Quick setup instructions
├── ICON-INSTRUCTIONS.md   # How to create app icons
└── README.md              # This file
```

## Installation

### Step 1: Create App Icons (Required)

Before first run, you need to create two app icon files. See [ICON-INSTRUCTIONS.md](ICON-INSTRUCTIONS.md) for detailed instructions.

**Quick method**: Use https://favicon.io/favicon-generator/ to generate icons, then:
1. Create an icon with text "AIM" or "$$$"
2. Download and extract
3. Rename `android-chrome-192x192.png` → `icon-192.png`
4. Rename `android-chrome-512x512.png` → `icon-512.png`
5. Copy both to the app folder

### Step 2: Launch the App

**Windows:**
- Double-click `START.bat`
- Browser opens automatically at http://localhost:8000
- Keep the window open while using the app

**Mac/Linux:**
- Double-click `START.sh` (or run `./START.sh` in terminal)
- Browser opens automatically at http://localhost:8000
- Keep the terminal open while using the app

**Note:** You must use the launcher scripts (not open index.html directly) for PWA features to work. PWA features require a web server, not the `file://` protocol.

### Step 3: Install as Native App (Optional but Recommended)

1. After launching via START.bat/START.sh
2. Go to **Settings** → **Install App** section
3. Click **"📱 Install App"** button
4. Follow your browser's installation prompts
5. App installs like a native application!

**Benefits of installing:**
- Launch from Start Menu/App Drawer (no need for START.bat/START.sh)
- Runs in its own window (no browser UI)
- Better data persistence
- Faster loading (offline caching)

## Getting Started

### First-Time Setup

When you first open the app, you'll be guided through a setup wizard:

1. **Tax Information**: Enter your 2024 total tax (from Form 1040, Line 24) and quarterly payment amount
2. **Expense Budget**: Upload your monthly expense budget CSV (optional - you can do this later)
3. **Starting Balance**: Enter your current tax savings balance

### Creating Your Expense Budget

Use the included `expense-budget-template.csv` file or download it from within the app:

1. Open the template in Excel, Google Sheets, or any spreadsheet program
2. Edit the expense names, due days, and monthly amounts
3. Save as CSV (UTF-8)
4. Upload in the Expenses screen

**CSV Format:**
```csv
Expense,DueDay,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec
SimplePractice,15,87,87,87,87,87,87,87,87,87,87,87,87
Rent,1,410,410,410,410,410,410,410,410,410,410,410,410
Phone,20,123,123,123,123,123,123,123,123,123,123,123,123
```

**Important:**
- **DueDay** is the day of the month the bill is due (1-31)
- Each expense must have a DueDay value
- This replaces the old separate due date configuration

## How to Use

### Weekly Income Entry (Dashboard)

1. Go to the Dashboard
2. Enter your weekly income in the input field
3. Click "Calculate My Split"
4. Review the breakdown:
   - **Business Expenses**: Amount to reserve for upcoming bills (rolling 4-week calculation)
   - **Tax Savings**: 30% saved for quarterly and year-end taxes
   - **Paycheck**: Amount safe to pay yourself
5. Click "Record This Week" to save

### Viewing History

1. Go to History screen
2. See all recorded weeks with income splits
3. Export to CSV for record-keeping

### Managing Taxes

1. Go to Taxes screen
2. View quarterly payment schedule with countdown to **period end** (when you need the money saved)
3. Mark payments as paid when you make them
4. Review year-end tax projection based on current pace
5. See detailed tax calculation breakdowns

**Important:** The countdown shows days until the **end of the earning period** (e.g., Mar 31 for Q1), not the payment due date (Apr 15). You need to have the full quarterly amount saved by the period end.

### Managing Expenses

1. Go to Expenses screen
2. Upload or update your monthly budget CSV (with DueDay column)
3. View upcoming bills and business expense breakdown
4. The app calculates a rolling 4-week average of business expenses needed

**Note:** Business checking balance tracking was removed. This app focuses on income allocation and tax tracking, not full bookkeeping.

### Settings

1. Go to Settings screen
2. **Tax Settings**: Adjust tax parameters (2024 tax total, standard deduction, tax savings rate)
3. **Business Settings**: Update business name, start date, current year
4. **Install App**: Install as native app (if not already installed)
5. **Data Management**:
   - Export data for your CPA (CSV)
   - Backup your data (JSON)
   - Import previous backups

## Data Backup & Export

### Regular Backups

**IMPORTANT:** Backup your data monthly! Your data is stored in browser localStorage, which can be cleared.

1. Go to Settings
2. Click "💾 Backup Data (JSON)"
3. Save the file to a safe location (cloud storage, external drive)

### Export for CPA

1. Go to Settings
2. Click "📊 Export All Data (CSV)"
3. Send this file to your CPA at tax time

### Importing a Backup

1. Go to Settings
2. Click "📂 Import Backup"
3. Select your previously saved JSON backup file

## Tax Calculations Explained

### Self-Employment Tax

```
Net Income × 0.9235 = SE Tax Base
SE Tax Base × 0.153 = SE Tax (15.3%)
SE Tax ÷ 2 = SE Tax Deduction
```

### Income Tax

```
Net Income - SE Tax Deduction = Adjusted Income
Adjusted Income - Standard Deduction = Taxable Income
Taxable Income × Tax Brackets = Income Tax
```

### Total Tax

```
SE Tax + Income Tax = Total Tax Liability
```

### Weekly Tax Savings (Simple Rule)

```
Weekly Income × 30% = Weekly Tax Savings
```

This 30% covers both:
- Self-employment tax (~15.3%)
- Income tax (~12-22% depending on bracket)

The smart tax calculation accounts for quarterly payments already made and adjusts your savings rate accordingly.

## Quarterly Tax Payment Schedule

- **Q1 2025** (Jan 1 - Mar 31): Period ends Mar 31 | Payment due Apr 15, 2025
- **Q2 2025** (Apr 1 - May 31): Period ends May 31 | Payment due Jun 15, 2025
- **Q3 2025** (Jun 1 - Aug 31): Period ends Aug 31 | Payment due Sep 15, 2025
- **Q4 2025** (Sep 1 - Dec 31): Period ends Dec 31 | Payment due Jan 15, 2026

**Important:** You need the full quarterly payment amount saved by the **period end date**, not the payment due date. The dashboard countdown reflects this.

## Troubleshooting

### Python Not Installed

**Error:** "Python is not installed"

**Solution:**
1. Download Python from https://www.python.org/downloads/
2. During installation, check "Add Python to PATH"
3. Restart your computer
4. Try START.bat/START.sh again

### Install Button Doesn't Appear

**Problem:** Can't find the "Install App" button in Settings

**Solutions:**
- Make sure you're using Chrome, Edge, or Safari (Firefox doesn't support PWA installation the same way)
- Make sure you launched via `START.bat`/`START.sh` (not by opening index.html directly)
- The URL should be `http://localhost:8000`, not `file://`

### Data Not Saving

**Problem:** Changes aren't being saved between sessions

**Solutions:**
- Make sure you're not in "Private/Incognito" browsing mode
- Check that your browser allows localStorage
- Try a different browser if issues persist
- If installed as PWA, try uninstalling and reinstalling

### Lost Data

**Problem:** All my data disappeared!

**Solution:**
- If you cleared browser data, your localStorage was deleted
- Restore from your most recent JSON backup (Settings → Import Backup)
- **This is why regular backups are critical!**

### Missing Weeks

**Problem:** The app says I have missing weeks

**Solution:**
- The app will alert you on the Dashboard if you have missing weeks
- Click "Enter Missing Weeks" to catch up on past weeks
- You can also edit any week from the History screen

### Calculations Look Wrong

**Problem:** Numbers don't match my expectations

**Solutions:**
- Click "📊 Show Calculation" buttons to see detailed breakdowns
- Verify your 2024 tax total is entered correctly in Settings
- Check that your expense budget CSV uploaded correctly (with DueDay column)
- Remember: Tax savings adjust based on quarterly payments already made

## Technical Details

### Architecture

This is a **Progressive Web App (PWA)** built with:
- **Frontend**: React 18 (via CDN), Tailwind CSS (via CDN)
- **Data Storage**: Browser localStorage (all data stays local)
- **CSV Parsing**: PapaParse library
- **Offline Support**: Service Worker with cache-first strategy
- **Installation**: Web App Manifest for native app installation

### File Dependencies

- `index.html`: Main application (single-page React app)
- `manifest.json`: PWA metadata (app name, icons, display mode)
- `service-worker.js`: Handles offline caching and updates
- `icon-192.png` / `icon-512.png`: App icons (user must create)

### Browser Compatibility

- **Chrome/Edge**: Full PWA support (recommended)
- **Safari**: Full PWA support on iOS/macOS
- **Firefox**: Works, but limited PWA installation support
- **Requires**: JavaScript enabled, localStorage enabled

### Data Storage

All data is stored in your browser's localStorage under the key `alyxIncomeManager`.

**No data is ever sent to any server** - everything stays on your computer.

### Offline Support

The service worker caches:
- Application files (index.html, manifest.json, icons)
- External libraries (React, Tailwind CSS, PapaParse)
- All resources needed for offline use

After first load, the app works **completely offline**.

### Updates

When you download a new version:
1. Replace old files with new files
2. Your data is safe (stored separately in browser)
3. Relaunch the app
4. Service worker will update automatically

## Privacy & Security

- **100% Local**: All data stored locally in your browser
- **No Server**: No data transmitted anywhere (runs via local Python server)
- **No Tracking**: No analytics or tracking code
- **No Cloud**: No accounts, no sign-ups, no cloud storage
- **Portable**: Just backup your JSON files to take your data anywhere

## Support & Feedback

This is a custom-built application. Keep your JSON backups safe!

### Common Questions

**Q: Can I use this on multiple computers?**
A: Yes, but you'll need to manually transfer your data using JSON backups (Settings → Backup Data).

**Q: What if I miss entering a week?**
A: No problem! The Dashboard will alert you and you can enter missed weeks anytime.

**Q: Can I change the tax savings rate from 30%?**
A: Yes, go to Settings → Tax Settings → Edit Settings and adjust the percentage.

**Q: What if my actual income is very different from projections?**
A: The projection updates automatically as you enter more weeks. It's based on your actual year-to-date average.

**Q: Do I need internet to use this?**
A: Only for the first load (to download CSS/JS from CDNs). After that, it works completely offline.

**Q: Why do I need to run START.bat/START.sh?**
A: PWA features (service workers, installation) require a web server. Opening index.html directly uses the `file://` protocol, which doesn't support these features.

**Q: Can I use this without installing as an app?**
A: Yes! Just use START.bat/START.sh and use it in your browser. Installation is optional but recommended.

**Q: Why was business checking balance removed?**
A: The app focuses on income allocation and tax tracking, not full bookkeeping. If you need full bookkeeping, consider dedicated accounting software.

**Q: Where are bill due dates configured now?**
A: Due dates are in the CSV file (DueDay column). This is the single source of truth for both expenses and due dates.

## Developer Notes

### Code Structure

The application is built as:
- `index.html`: Single-page React app with all components inline
- `manifest.json`: PWA configuration
- `service-worker.js`: Offline caching and update handling
- Tailwind CSS via CDN for styling
- Data model in localStorage
- Pure JavaScript for all calculations

### Key Functions

- `calculateTotalTax()`: Calculates SE tax and income tax with full breakdown
- `calculateUpcomingBills()`: Finds bills due in next 28 days, uses rolling 4-week average
- `parseExpenseCSV()`: Parses uploaded expense budget (with DueDay column)
- `saveToLocalStorage()` / `loadFromLocalStorage()`: Data persistence
- Service worker: Cache-first strategy for offline support

### Modifying the App

To modify:
1. Open `index.html` in a code editor
2. Find the `<script type="text/babel">` section
3. Edit React components or functions
4. Save and refresh browser (or restart START.bat/START.sh)

### Tax Bracket Updates

Tax brackets are defined in the `TAX_BRACKETS_2024` constant (line ~32 in index.html). Update this array if tax brackets change for future years.

### Updating the Service Worker

If you modify cached resources in `service-worker.js`:
1. Update the `CACHE_NAME` version (e.g., 'alyx-income-manager-v2')
2. Old caches are automatically cleaned up on activation

## Version History

- **v1.0** (November 2025): Initial release with PWA support, offline functionality, smart tax tracking, expense management with DueDay in CSV, quarterly tax period end countdown, and data export/import

## License

Custom-built for Alyx Steadman Therapy PLLC. All rights reserved.

---

**Version**: 1.0
**Last Updated**: November 2025
**Author**: Built with Claude Code
