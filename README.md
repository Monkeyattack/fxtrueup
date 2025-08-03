# FX True Up

> Smart MT4/MT5 Portfolio Tracker for Retail Traders, Signal Followers & Prop Firm Candidates  
> **Domain**: [fxtrueup.com](https://fxtrueup.com)  
> **Repo**: `fxtrueup` (under GitHub organization: Monkeyattack)  

---

## 🎯 Project Purpose

FX True Up is a multi-account MT4/MT5 analytics platform that enables traders to:
- Track real performance across brokers
- Categorize and compare trading accounts
- Export reports for tax and accounting
- Prepare accurate stats for prop firm evaluations

---

## 🧩 Target Audience

| Audience            | Needs                                                     |
|---------------------|------------------------------------------------------------|
| Retail Traders      | Easy-to-use, mobile-friendly UI with simple P&L graphs    |
| Signal Followers    | Multi-account tracking with per-signal ROI                |
| Prop Firm Traders   | Deep analytics to pass funding evaluations                |
| Account Managers    | Branded dashboards for client reporting (White-label)     |

---

## 🛠️ Tech Stack

| Layer              | Tool / Service                         |
|--------------------|----------------------------------------|
| Backend            | **Node.js (Express)**                  |
| Frontend           | (Coming soon) React/Next.js (Mobile-first) |
| Auth               | **Firebase Auth** (Google + email/pass)|
| Database           | **Firestore** (Cloud NoSQL)            |
| MT4/MT5 Access     | **MetaApi** (REST/WebSocket)           |
| Reporting / Export | CSV + PDFKit + QBO API (planned)       |
| Billing            | Stripe (tiered plans + trial logic)    |
| Hosting            | Firebase Hosting + GCP Functions       |

---

## ✅ MVP Features

- [x] Google + Email/Password Auth
- [x] Connect MT4/5 Investor accounts (MetaApi)
- [x] 7-day free trial with basic reporting
- [x] Monthly and Quarterly Profit/Loss views
- [x] Tag and categorize accounts (e.g., "Gold", "Copy Trade")
- [x] Compare 2+ accounts side-by-side
- [x] Mobile-friendly dashboard layout
- [x] CSV export of performance metrics

---

## 🚧 Post-MVP Roadmap

- [ ] PDF & QuickBooks export
- [ ] US tax reporting (Schedule D-style CSV)
- [ ] AI explanations of metrics ("Why is drawdown high?")
- [ ] À la carte insights module (per-report deep dives)
- [ ] White-label mode for account managers
- [ ] Telegram bot + weekly email summaries

---

## 💰 Monetization Strategy

### Subscription Tiers

| Plan            | Price/mo | Accounts | Features                                 |
|-----------------|----------|----------|------------------------------------------|
| Trial           | $0       | 1        | 7-day access, basic charts               |
| Starter         | $9       | 1        | Full monthly/quarterly exports           |
| Trader          | $19      | 3        | Multi-account + CSV export               |
| Pro             | $49      | 10       | Comparisons, tagging, QBO                |
| Portfolio       | $99      | 20+      | All features, AI insights, API access    |

### Additional Revenue
- **Affiliate Links**: Prop firms, tax tools, brokers
- **Ad Modules**: Within dashboard or reports
- **À La Carte**: Premium deep dives or AI explanations

---

## 🔐 Permissions & Security

- Investor passwords are stored securely (hashed/encrypted if required)
- Firebase Auth handles OAuth and account security
- No trading permissions — MetaApi is read-only
- Users can delete account and data at any time

---

## 🧪 Development Status

- [x] Repo Creation: `fxtrueup` (Monkeyattack GitHub)
- [x] Node.js + Firebase + MetaApi backend scaffold
- [ ] Stripe integration for subscriptions
- [ ] Frontend dashboard build (Next.js, Tailwind)
- [ ] Firestore rules + test harness

---

## 📬 Notifications

- Updates will be posted if repo setup exceeds 24 hours
- You’ll be notified upon first commit + API-ready status

---

## 👤 Contact

Developed by: Christopher Meredith  
For internal use at [fxtrueup.com](https://fxtrueup.com) and future white-label partners.

