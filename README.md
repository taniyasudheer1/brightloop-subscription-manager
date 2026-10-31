# Brightloop Subscription Management System

A unified software platform built for **Brightloop Software** to manage the full lifecycle of a subscription business: product & plan configuration, quotation templates, subscription lifecycle transitions, automated recurring billing with tax & discount calculation, payment recording, and real-time finance analytics.

---

## 🚀 Quick Start

### 1. Start the Server
You can run the application directly from the root directory or from `brightloop-subscription-manager`:

```bash
# From c:\Users\HP\brightloop or c:\Users\HP\brightloop\brightloop-subscription-manager\server
npm start
```

### 2. Access the Application
Open your web browser and navigate to:
```
http://localhost:5000
```

### 3. Run the Automated Test Suite
To run the automated test suite verifying all scenes and requirements from the specification PDF:
```bash
npm test
```

---

## 👥 Demo Accounts (Instant Role Switching)
The web interface includes a **Demo Role Switcher** dropdown in the top navigation bar to test each role immediately:

| Role | Name | Email | Password | Access Level |
|---|---|---|---|---|
| **Admin** | Alex Vance | `admin@brightloop.com` | `Admin@12345` | Controls entire system, products, plans, taxes, discounts, staff invitations, billing runs, and finance reporting |
| **Staff** | Sarah Jenkins | `staff@brightloop.com` | `Staff@12345` | Internal team managing day-to-day operations: quotes, subscriptions, billing runs, invoices, and payments |
| **Customer** | Acme Corp | `acme@corp.com` | `Customer@123` | Customer Portal: views own active contracts, invoices, and settles unpaid bills online |
| **Customer** | Fresh Bakes | `bakery@shop.com` | `Customer@123` | Customer Portal: views own POS subscriptions, invoices, and payment receipts |

---

## 📋 Features Implemented (Matching PDF Requirements)

### Scene 1: "A new customer signs up"
- **Customer Self-Registration**:
  - Unique email address validation.
  - Strict password complexity enforced:
    - More than 8 characters in length.
    - At least one uppercase letter (`A-Z`).
    - At least one lowercase letter (`a-z`).
    - At least one special character (`!@#$%^&*` etc.).
    - Live checklist UI in registration form.
- **Password Reset**:
  - "Forgot Password" dispatches a simulated secure reset link/token.
  - Reset form accepts token and new password meeting the complexity requirements.
- **Role-Based Access Control**:
  - Admin controls the entire system.
  - Staff has limited operational access (cannot manage staff or discount rules).
  - Customers see only their own subscriptions and invoices through the dedicated Customer Portal.
  - Only the admin can add a new member of staff (`POST /api/users/staff`).

### Scene 2: "Launching a new plan"
- **Product & Variant Management**:
  - Product fields: `name`, `type`, `sales_price`, `cost_price`, `notes`.
  - Variants support price modifiers (e.g., choosing the **Odoo Brand Edition adds +$560** to the base price).
- **Pricing Plans**:
  - Frequencies: `daily`, `weekly`, `monthly`, `yearly`.
  - Configurable minimum seat quantity, start date, and end date.
  - Lifecycle rules configured plan-by-plan:
    - `auto_close`: closes on its own when it ends.
    - `can_close_early`: whether it can be cancelled/closed before expiry.
    - `can_pause`: whether it can be paused and resumed.
    - `can_renew`: whether it can be renewed upon expiration.

### Scene 3: "Turning a quote into a subscription"
- **Quotation Templates**:
  - Sales reps start from pre-configured templates with default plan, product lines, and set validity days (e.g., 30 days).
  - 1-click quotation generation pre-populates all items, prices, and taxes.
- **Subscription Lifecycle**:
  - Unique subscription number (e.g. `SUB-2026-0001`).
  - Lines showing product, variant, quantity, unit price, taxes, and amount.
  - State machine: `Draft` ➔ `Quotation` ➔ `Confirmed` ➔ `Active` ➔ `Closed` (plus `Paused`).
  - Clear team visibility of subscription status.

### Scene 4: "Billing day"
- **Automated Billing Run (`POST /api/billing/run`)**:
  - 1-click batch engine checks all `Active` subscriptions due for renewal.
  - Automatically generates `Confirmed` invoices with customer details, lines, taxes, and discounts filled in.
  - **Idempotent Billing**: Guarantees nothing is billed twice or skipped by tracking billing cycles.
  - Automatic closure of ended plans where `auto_close = 1`.
- **Taxes**:
  - Configurable tax rules (e.g., Standard VAT 10%, GST 18%).
  - Automatically calculated and itemized per line.
- **Invoice Actions**:
  - Confirm, cancel, simulate sending email to customer, and generate printable invoice documents.

### Scene 5: "A customer asks for a better price"
- **Admin-Managed Discount Rules**:
  - Fixed amount ($) or percentage (%) discount.
  - Minimum purchase amount or seat quantity conditions.
  - Start & end date validity windows.
  - Total usage limits (tracks `usage_count` vs `usage_limit`).
  - Scope: whole subscription or specific product.
- **Automatic Application & Expiry**:
  - Automatically applied during billing runs.
  - Automatically stops when expired or when usage limit is reached.

### Scene 6: "The money comes in"
- **Payment Recording**:
  - Recorded with payment method (Credit Card, Bank Transfer, PayPal, Cash, UPI), amount, date, and transaction reference note.
  - Partial payments update the remaining invoice balance.
  - When fully paid, invoice automatically moves to `Paid`.
- **Aging & Outstanding Tracking**:
  - Distinguishes between Paid, Outstanding (unpaid), and Overdue invoices.

### Scene 7: "The finance lead, at the end of the month"
- **Unified Finance Dashboard**:
  - Active subscriptions count.
  - Total revenue collected (settled cash).
  - Outstanding revenue owed.
  - Overdue invoices count and total amount at risk.
  - Monthly Recurring Revenue (MRR) and Annual Recurring Revenue (ARR).
  - Overdue invoices chasing table with quick reminder action.
  - **Sub-Second Performance SLA**: Queries execute in single-digit milliseconds (~1-3 ms), far below the 2-second requirement.

---

## 🛠 Tech Stack
- **Backend**: Node.js & Express 5
- **Database**: Zero-dependency SQLite engine using Node's native `node:sqlite` (with schema in `database/schema.sql`). Automatically initializes and seeds realistic data on first run.
- **Authentication**: JWT & `bcryptjs` with role-based authorization middleware.
- **Frontend**: Responsive Single-Page Application (HTML5, CSS3, Vanilla ES6 JavaScript).
