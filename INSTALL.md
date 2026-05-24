# Deshan Textile POS v4 — Setup Guide
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ✅ What's New in v4
- **Supabase cloud database** — data syncs across devices automatically
- **Offline mode** — works without internet, queues changes for sync
- **Barcode generation** — auto-generate EAN-13 barcodes for any product
- **Barcode label printing** — print sheets of product labels
- **Real-time sync indicator** — shows Online/Offline/Syncing status
- **Bug fixes** — stock validation, cart qty limits, safer modal handling

---

## 🚀 Quick Start (Offline Only — No Supabase)

```bash
# 1. Install dependencies
npm install

# 2. Start
npm run dev

# 3. Open http://localhost:3000
#    Login: Manager PIN 1234 | Cashier PIN 0000
```
This works 100% offline using browser localStorage. No setup needed.

---

## ☁ Full Setup (Online + Offline Sync with Supabase)

### Step 1 — Create Supabase Project
1. Go to https://supabase.com and sign up (free)
2. Click **New Project**, choose a name and region
3. Wait ~2 minutes for it to initialize

### Step 2 — Run the Database Schema
1. In your Supabase project, go to **SQL Editor**
2. Click **New Query**
3. Copy the contents of `database/schema.sql`
4. Paste and click **Run**

### Step 3 — Get Your API Keys
1. Go to **Project Settings → API**
2. Copy:
   - **Project URL** (looks like `https://abc123.supabase.co`)
   - **anon public** key (long JWT string)

### Step 4 — Configure Environment
```bash
# Copy the example env file
cp .env.example .env

# Edit .env and paste your keys:
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Step 5 — Start the App
```bash
npm run dev
```

The status bar at the top will show **● Online** when connected to Supabase.

---

## 🤖 AI Assistant (Optional)
1. Go to https://aistudio.google.com
2. Click **Get API Key** → Create key
3. Add to `.env`:
   ```
   VITE_GEMINI_API_KEY=AIzaSy...your-key
   ```

---

## ▦ Barcode System

### USB Barcode Scanner
- Plug in any USB HID barcode scanner — no drivers needed
- Scanner works immediately in the Billing tab
- Scanning a barcode auto-adds the product to cart

### Generating Barcodes
1. Go to **Barcodes** tab (Manager only)
2. Click **Auto-generate** in the product modal, or barcodes are auto-generated when you save a product
3. Select products and click **Print Selected** to print label sheets

### Printing Labels
- Opens a print-ready page with EAN-13 barcode labels
- Each label shows: shop name, product name, barcode, price, SKU
- Print on standard label paper (50mm × 30mm recommended)

---

## 🔄 Online/Offline Behavior

| Status | Indicator | What happens |
|--------|-----------|--------------|
| Connected | ● Online | All data reads/writes go to Supabase |
| Disconnected | ○ Offline | Data saved locally, queued for sync |
| Reconnecting | ● Syncing (N) | Queued changes being pushed to Supabase |

Offline queue holds up to 200 operations. When back online, they sync automatically.

---

## 🏗 Build for Production

```bash
npm run build
# Output in /dist — deploy to Netlify, Vercel, or any static host
```

---

## 🔑 Default Credentials
| Role     | PIN  |
|----------|------|
| Manager  | 1234 |
| Cashier  | 0000 |

**Change PINs immediately** in Staff → Change PIN after first login.

---

## 📞 Support
Deshan Textile · Nadugala Wella, Matara · 078-4461570
