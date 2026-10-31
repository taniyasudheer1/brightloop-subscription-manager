-- Brightloop Database Schema

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) CHECK (role IN ('admin', 'staff', 'customer')) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    sales_price DECIMAL(10, 2) NOT NULL,
    cost_price DECIMAL(10, 2) NOT NULL,
    notes TEXT
);

CREATE TABLE product_variants (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,
    variant_name VARCHAR(255) NOT NULL,
    price_modifier DECIMAL(10, 2) DEFAULT 0.00
);

CREATE TABLE plans (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,
    billing_frequency VARCHAR(50) CHECK (billing_frequency IN ('daily', 'weekly', 'monthly', 'yearly')) NOT NULL,
    min_quantity INT DEFAULT 1,
    start_date DATE NOT NULL,
    end_date DATE,
    auto_close BOOLEAN DEFAULT FALSE
);

CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    subscription_number VARCHAR(100) UNIQUE NOT NULL,
    customer_id INT REFERENCES users(id),
    plan_id INT REFERENCES plans(id),
    status VARCHAR(50) CHECK (status IN ('Draft', 'Quotation', 'Confirmed', 'Active', 'Closed')) DEFAULT 'Draft',
    start_date DATE NOT NULL,
    expiry_date DATE,
    payment_terms VARCHAR(255)
);

CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    subscription_id INT REFERENCES subscriptions(id),
    customer_id INT REFERENCES users(id),
    status VARCHAR(50) CHECK (status IN ('Draft', 'Confirmed', 'Paid')) DEFAULT 'Draft',
    total_amount DECIMAL(10, 2) NOT NULL,
    tax_amount DECIMAL(10, 2) NOT NULL,
    issue_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    invoice_id INT REFERENCES invoices(id),
    method VARCHAR(100) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

CREATE TABLE discounts (
    id SERIAL PRIMARY KEY,
    rule_type VARCHAR(50) CHECK (rule_type IN ('fixed', 'percentage')) NOT NULL,
    value DECIMAL(10, 2) NOT NULL,
    min_purchase DECIMAL(10, 2),
    min_quantity INT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    usage_limit INT,
    usage_count INT DEFAULT 0
);