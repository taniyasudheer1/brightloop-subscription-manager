const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Database file path
const dbDir = path.resolve(__dirname, '../database');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}
const dbPath = path.join(dbDir, 'brightloop.sqlite');

const db = new DatabaseSync(dbPath);

// Enable foreign keys
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

/**
 * Universal query helper mimicking PostgreSQL's query(sql, params) interface.
 * Converts PostgreSQL positional parameters ($1, $2, ...) to SQLite (?, ?, ...).
 */
function query(text, params = []) {
    try {
        // Convert $1, $2 to ?
        let sqliteText = text.replace(/\$(\d+)/g, '?');
        const trimmed = sqliteText.trim();
        const isSelect = /^SELECT\b/i.test(trimmed);
        const hasReturning = /\bRETURNING\b/i.test(trimmed);

        const stmt = db.prepare(sqliteText);

        if (isSelect || hasReturning) {
            const rows = stmt.all(...params);
            return {
                rows,
                rowCount: rows.length,
            };
        } else {
            const info = stmt.run(...params);
            return {
                rows: [],
                rowCount: info.changes,
                lastInsertRowid: info.lastInsertRowid,
            };
        }
    } catch (err) {
        console.error('SQL Error in query:', text, 'with params:', params, 'Error:', err.message);
        throw err;
    }
}

/**
 * Run a transaction
 */
function transaction(fn) {
    db.exec('BEGIN TRANSACTION;');
    try {
        const result = fn();
        db.exec('COMMIT;');
        return result;
    } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
    }
}

/**
 * Initialize database schema and initial seed data
 */
function initDb() {
    db.exec(`
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

        CREATE TABLE IF NOT EXISTS tax_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            rate REAL NOT NULL,
            is_default INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1
        );

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

        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id),
            action TEXT NOT NULL,
            details TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_subs_status ON subscriptions(status);
        CREATE INDEX IF NOT EXISTS idx_subs_customer ON subscriptions(customer_id);
        CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
        CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
        CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
    `);

    seedInitialData();
}

/**
 * Seed initial realistic data for Brightloop
 */
function seedInitialData() {
    const userCount = db.prepare('SELECT count(*) as count FROM users').get().count;
    if (userCount > 0) {
        return; // Already seeded
    }

    console.log('Seeding initial data for Brightloop Subscription Manager...');

    const saltRounds = 10;
    const adminHash = bcrypt.hashSync('Admin@12345', saltRounds);
    const staffHash = bcrypt.hashSync('Staff@12345', saltRounds);
    const cust1Hash = bcrypt.hashSync('Customer@123', saltRounds);
    const cust2Hash = bcrypt.hashSync('Customer@123', saltRounds);

    // Users
    const insertUser = db.prepare(`
        INSERT INTO users (email, password_hash, role, name, company)
        VALUES (?, ?, ?, ?, ?)
    `);
    const adminId = insertUser.run('admin@brightloop.com', adminHash, 'admin', 'Alex Vance', 'Brightloop HQ').lastInsertRowid;
    const staffId = insertUser.run('staff@brightloop.com', staffHash, 'staff', 'Sarah Jenkins', 'Brightloop Sales & Support').lastInsertRowid;
    const cust1Id = insertUser.run('acme@corp.com', cust1Hash, 'customer', 'John Miller', 'Acme Corporation').lastInsertRowid;
    const cust2Id = insertUser.run('bakery@shop.com', cust2Hash, 'customer', 'Emma Watson', 'Fresh Bakes Bakery').lastInsertRowid;

    // Tax Rules
    const insertTax = db.prepare(`
        INSERT INTO tax_rules (name, rate, is_default, is_active)
        VALUES (?, ?, ?, ?)
    `);
    const vat10Id = insertTax.run('Standard VAT (10%)', 10.0, 1, 1).lastInsertRowid;
    const gst18Id = insertTax.run('Goods & Services Tax (18%)', 18.0, 0, 1).lastInsertRowid;
    const zeroTaxId = insertTax.run('Zero Rated Tax (0%)', 0.0, 0, 1).lastInsertRowid;

    // Products & Variants (incorporating PDF specifications: variant adding 560 for Odoo brand)
    const insertProduct = db.prepare(`
        INSERT INTO products (name, type, sales_price, cost_price, notes)
        VALUES (?, ?, ?, ?, ?)
    `);
    const p1Id = insertProduct.run('Brightloop Business Suite', 'Software', 1200.00, 350.00, 'All-in-one ERP and business operations platform').lastInsertRowid;
    const p2Id = insertProduct.run('Brightloop Point-of-Sale (POS)', 'Software', 350.00, 80.00, 'Cloud-connected point of sale for retail & food stores').lastInsertRowid;
    const p3Id = insertProduct.run('Priority 24/7 SLA Support', 'Add-on', 150.00, 30.00, 'Dedicated account manager and 1-hour response SLA').lastInsertRowid;
    const p4Id = insertProduct.run('Multi-Warehouse Inventory Sync', 'Add-on', 220.00, 50.00, 'Real-time multi-location inventory sync module').lastInsertRowid;

    const insertVariant = db.prepare(`
        INSERT INTO product_variants (product_id, variant_name, price_modifier)
        VALUES (?, ?, ?)
    `);
    const v1_std = insertVariant.run(p1Id, 'Standard Edition', 0.00).lastInsertRowid;
    // PDF explicitly states: "for example by brand, where choosing the Odoo brand adds 560 to the price"
    const v1_odoo = insertVariant.run(p1Id, 'Odoo Brand Edition', 560.00).lastInsertRowid;
    const v1_ent = insertVariant.run(p1Id, 'Enterprise Multi-Company', 950.00).lastInsertRowid;

    const v2_single = insertVariant.run(p2Id, 'Single Counter Terminal', 0.00).lastInsertRowid;
    const v2_multi = insertVariant.run(p2Id, 'Multi-Counter Terminal Pack', 180.00).lastInsertRowid;

    // Plans (incorporating daily, weekly, monthly, yearly frequencies, min quantities, auto-close, pause, renew options)
    const insertPlan = db.prepare(`
        INSERT INTO plans (product_id, name, billing_frequency, price, min_quantity, start_date, end_date, auto_close, can_close_early, can_pause, can_renew)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const planMonthlyERP = insertPlan.run(p1Id, 'Business Suite - Monthly Billing', 'monthly', 1200.00, 1, '2026-01-01', null, 0, 1, 1, 1).lastInsertRowid;
    const planYearlyERP = insertPlan.run(p1Id, 'Business Suite - Annual Contract', 'yearly', 12500.00, 1, '2026-01-01', null, 0, 1, 1, 1).lastInsertRowid;
    const planWeeklyPOS = insertPlan.run(p2Id, 'POS - Weekly Flex', 'weekly', 95.00, 1, '2026-01-01', null, 0, 1, 1, 1).lastInsertRowid;
    const planMonthlyPOS = insertPlan.run(p2Id, 'POS - Monthly Growth', 'monthly', 350.00, 1, '2026-01-01', null, 0, 1, 1, 1).lastInsertRowid;
    const planDailyDemo = insertPlan.run(p1Id, 'Special Event Trial (Auto-Close)', 'daily', 50.00, 1, '2026-01-01', '2026-12-31', 1, 1, 0, 0).lastInsertRowid;

    // Discounts (PDF: fixed amount or percentage, min purchase or quantity, start/end dates, usage limits, scope)
    const insertDiscount = db.prepare(`
        INSERT INTO discounts (name, code, rule_type, value, min_purchase, min_quantity, start_date, end_date, usage_limit, usage_count, scope, product_id, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const discVolume = insertDiscount.run('High Volume Seat Saver (15% Off)', 'VOL15', 'percentage', 15.00, 0, 5, '2026-01-01', '2026-12-31', 100, 1, 'subscription', null, 1).lastInsertRowid;
    const discFixed = insertDiscount.run('Early Adopter $100 Credit', 'SAVE100', 'fixed', 100.00, 800.00, 1, '2026-01-01', '2026-12-31', 50, 2, 'subscription', null, 1).lastInsertRowid;

    // Quotation Templates (PDF: "start from a quotation template that already has the right plan and product lines, and stays valid for a set number of days")
    const insertTemplate = db.prepare(`
        INSERT INTO quotation_templates (name, plan_id, validity_days, payment_terms, notes)
        VALUES (?, ?, ?, ?, ?)
    `);
    const tmplEnterprise = insertTemplate.run('Enterprise Cloud ERP (Odoo Edition) + 24/7 Support', planMonthlyERP, 30, 'Net 30', 'Standard quotation for enterprise accounts needing Odoo Brand Edition and SLA support.').lastInsertRowid;
    const tmplRetail = insertTemplate.run('Retail Starter Package (POS Monthly)', planMonthlyPOS, 15, 'Immediate', 'Standard package for shops and retail outlets.').lastInsertRowid;

    const insertTemplateLine = db.prepare(`
        INSERT INTO quotation_template_lines (template_id, product_id, variant_id, quantity, unit_price)
        VALUES (?, ?, ?, ?, ?)
    `);
    // Lines for Enterprise template:
    insertTemplateLine.run(tmplEnterprise, p1Id, v1_odoo, 1, 1760.00); // 1200 base + 560 Odoo brand
    insertTemplateLine.run(tmplEnterprise, p3Id, null, 1, 150.00);     // Priority support
    // Lines for Retail template:
    insertTemplateLine.run(tmplRetail, p2Id, v2_single, 1, 350.00);

    // Subscriptions
    const insertSub = db.prepare(`
        INSERT INTO subscriptions (subscription_number, customer_id, plan_id, status, start_date, expiry_date, next_billing_date, last_billed_at, payment_terms, discount_id, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    // Sub 1: Active, billed recently
    const sub1Id = insertSub.run('SUB-2026-0001', cust1Id, planMonthlyERP, 'Active', '2026-10-01', '2027-10-01', '2026-11-01', '2026-10-01', 'Net 30', discVolume, 'Acme Corp enterprise production setup').lastInsertRowid;
    // Sub 2: Active, due for billing! (start date past, next_billing_date due)
    const sub2Id = insertSub.run('SUB-2026-0002', cust2Id, planMonthlyPOS, 'Active', '2026-09-15', '2027-09-15', '2026-10-15', '2026-09-15', 'Immediate', null, 'Fresh Bakes counter terminal').lastInsertRowid;
    // Sub 3: Quotation stage for Acme
    const sub3Id = insertSub.run('SUB-2026-0003', cust1Id, planYearlyERP, 'Quotation', '2026-11-01', '2027-11-01', '2026-11-01', null, 'Net 30', null, 'Quotation pending customer signoff').lastInsertRowid;

    // Subscription Lines
    const insertSubLine = db.prepare(`
        INSERT INTO subscription_lines (subscription_id, product_id, variant_id, quantity, unit_price, tax_id, tax_amount, discount_amount, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    // Sub 1 lines:
    insertSubLine.run(sub1Id, p1Id, v1_odoo, 5, 1760.00, vat10Id, 748.00, 1320.00, 8228.00); // 5 seats with 15% discount
    insertSubLine.run(sub1Id, p3Id, null, 1, 150.00, vat10Id, 15.00, 0.00, 165.00);
    // Sub 2 lines:
    insertSubLine.run(sub2Id, p2Id, v2_single, 1, 350.00, vat10Id, 35.00, 0.00, 385.00);
    // Sub 3 lines:
    insertSubLine.run(sub3Id, p1Id, v1_ent, 1, 13450.00, vat10Id, 1345.00, 0.00, 14795.00);

    // Invoices
    const insertInvoice = db.prepare(`
        INSERT INTO invoices (invoice_number, subscription_id, customer_id, status, subtotal, tax_amount, discount_amount, total_amount, paid_amount, issue_date, due_date, payment_terms, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    // Invoice 1: Paid invoice
    const inv1Id = insertInvoice.run('INV-2026-0001', sub1Id, cust1Id, 'Paid', 7630.00, 763.00, 1320.00, 8393.00, 8393.00, '2026-10-01', '2026-10-31', 'Net 30', 'First month billing').lastInsertRowid;
    // Invoice 2: Confirmed / Unpaid
    const inv2Id = insertInvoice.run('INV-2026-0002', sub2Id, cust2Id, 'Confirmed', 350.00, 35.00, 0.00, 385.00, 0.00, '2026-10-15', '2026-10-15', 'Immediate', 'October POS renewal').lastInsertRowid;
    // Invoice 3: Overdue invoice for Acme
    const inv3Id = insertInvoice.run('INV-2026-0003', sub1Id, cust1Id, 'Confirmed', 1200.00, 120.00, 0.00, 1320.00, 0.00, '2026-09-01', '2026-09-30', 'Net 30', 'Prior period add-on invoice (Overdue)').lastInsertRowid;

    // Invoice Lines
    const insertInvLine = db.prepare(`
        INSERT INTO invoice_lines (invoice_id, product_id, variant_id, description, quantity, unit_price, tax_rate, tax_amount, discount_amount, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertInvLine.run(inv1Id, p1Id, v1_odoo, 'Brightloop Business Suite (Odoo Brand Edition) - 5 Seats', 5, 1760.00, 10.0, 748.00, 1320.00, 8228.00);
    insertInvLine.run(inv1Id, p3Id, null, 'Priority 24/7 SLA Support', 1, 150.00, 10.0, 15.00, 0.00, 165.00);

    insertInvLine.run(inv2Id, p2Id, v2_single, 'Brightloop Point-of-Sale (POS) - Single Terminal', 1, 350.00, 10.0, 35.00, 0.00, 385.00);

    insertInvLine.run(inv3Id, p4Id, null, 'Multi-Warehouse Inventory Sync Module', 1, 1200.00, 10.0, 120.00, 0.00, 1320.00);

    // Payments (PDF: "recorded with its method, amount, date and a note, against the right invoice")
    const insertPayment = db.prepare(`
        INSERT INTO payments (payment_number, invoice_id, method, amount, payment_date, notes)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertPayment.run('PAY-2026-0001', inv1Id, 'Bank Transfer', 8393.00, '2026-10-05', 'Wire transfer ref #TX-984213 - Acme Corp');

    console.log('Seed data created successfully!');
}

// Auto-run schema initialization
initDb();

module.exports = {
    query,
    transaction,
    db
};
