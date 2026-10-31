-- ============================================================================
-- Brightloop Subscription Management System - Database Schema
-- Unified schema for Plans, Subscriptions, Recurring Billing, Taxes & Discounts
-- ============================================================================

-- 1. Users & Authentication
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT CHECK (role IN ('admin', 'staff', 'customer')) NOT NULL DEFAULT 'customer',
    name TEXT NOT NULL,
    company TEXT,
    reset_token TEXT,
    reset_token_expiry TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 2. Products & Variants
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    sales_price REAL NOT NULL,
    cost_price REAL NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_name TEXT NOT NULL,
    price_modifier REAL NOT NULL DEFAULT 0.00
);

-- 3. Pricing Plans
CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    billing_frequency TEXT CHECK (billing_frequency IN ('daily', 'weekly', 'monthly', 'yearly')) NOT NULL,
    price REAL NOT NULL,
    min_quantity INTEGER DEFAULT 1,
    start_date TEXT NOT NULL,
    end_date TEXT,
    auto_close INTEGER DEFAULT 0,
    can_close_early INTEGER DEFAULT 1,
    can_pause INTEGER DEFAULT 1,
    can_renew INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 4. Tax Rules
CREATE TABLE IF NOT EXISTS tax_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    rate REAL NOT NULL,
    is_default INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1
);

-- 5. Discounts
CREATE TABLE IF NOT EXISTS discounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    rule_type TEXT CHECK (rule_type IN ('fixed', 'percentage')) NOT NULL,
    value REAL NOT NULL,
    min_purchase REAL DEFAULT 0,
    min_quantity INTEGER DEFAULT 0,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    usage_limit INTEGER,
    usage_count INTEGER DEFAULT 0,
    scope TEXT CHECK (scope IN ('all', 'product', 'subscription')) DEFAULT 'subscription',
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    is_active INTEGER DEFAULT 1
);

-- 6. Quotation Templates
CREATE TABLE IF NOT EXISTS quotation_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL,
    validity_days INTEGER DEFAULT 30,
    payment_terms TEXT DEFAULT 'Net 30',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quotation_template_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    variant_id INTEGER REFERENCES product_variants(id),
    quantity INTEGER DEFAULT 1,
    unit_price REAL NOT NULL
);

-- 7. Subscriptions & Subscription Lines
CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_number TEXT UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES users(id),
    plan_id INTEGER REFERENCES plans(id),
    status TEXT CHECK (status IN ('Draft', 'Quotation', 'Confirmed', 'Active', 'Paused', 'Closed')) DEFAULT 'Draft',
    start_date TEXT NOT NULL,
    expiry_date TEXT,
    next_billing_date TEXT,
    last_billed_at TEXT,
    payment_terms TEXT DEFAULT 'Net 30',
    discount_id INTEGER REFERENCES discounts(id),
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscription_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    variant_id INTEGER REFERENCES product_variants(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL,
    tax_id INTEGER REFERENCES tax_rules(id),
    tax_amount REAL DEFAULT 0.00,
    discount_amount REAL DEFAULT 0.00,
    line_total REAL NOT NULL
);

-- 8. Invoices & Invoice Lines
CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT UNIQUE NOT NULL,
    subscription_id INTEGER REFERENCES subscriptions(id),
    customer_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT CHECK (status IN ('Draft', 'Confirmed', 'Paid', 'Cancelled')) DEFAULT 'Draft',
    subtotal REAL NOT NULL,
    tax_amount REAL NOT NULL DEFAULT 0.00,
    discount_amount REAL NOT NULL DEFAULT 0.00,
    total_amount REAL NOT NULL,
    paid_amount REAL NOT NULL DEFAULT 0.00,
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    payment_terms TEXT,
    notes TEXT,
    sent_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    variant_id INTEGER REFERENCES product_variants(id),
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL,
    tax_rate REAL DEFAULT 0.00,
    tax_amount REAL DEFAULT 0.00,
    discount_amount REAL DEFAULT 0.00,
    line_total REAL NOT NULL
);

-- 9. Payments
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_number TEXT UNIQUE NOT NULL,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    method TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 10. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_subs_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subs_customer ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
