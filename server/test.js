const http = require('http');
const app = require('./server');

const PORT = 5001; // test port
const server = app.listen(PORT, async () => {
    console.log(`Test server running on port ${PORT}...`);
    try {
        await runAllTests();
        console.log('\n========================================');
        console.log(' ALL SUITE TESTS PASSED SUCCESSFULLY! ');
        console.log('========================================\n');
    } catch (err) {
        console.error('\nTEST FAILED:', err);
        process.exitCode = 1;
    } finally {
        server.close();
    }
});

function request(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const req = http.request({
            hostname: 'localhost',
            port: PORT,
            path: `/api${path}`,
            method,
            headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = data ? JSON.parse(data) : {};
                    resolve({ status: res.statusCode, body: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runAllTests() {
    console.log('\n--- 1. Testing Password Complexity & Customer Registration ---');
    const testEmail = `testcustomer_${Date.now()}@example.com`;
    // Test weak password
    let res = await request('POST', '/auth/register', {
        email: testEmail,
        name: 'Test Customer',
        password: 'weak'
    });
    console.log('Weak password rejection status:', res.status, res.body.error);
    if (res.status !== 400) throw new Error('Failed to reject short password');

    // Test valid password (>8 chars, uppercase, lowercase, special char)
    res = await request('POST', '/auth/register', {
        email: testEmail,
        name: 'Test Customer',
        password: 'SecurePass@123'
    });
    console.log('Valid registration status:', res.status, res.body.message);
    if (res.status !== 201) throw new Error('Registration failed with valid password');
    const customerToken = res.body.token;

    console.log('\n--- 2. Testing Login & Roles ---');
    // Admin login
    res = await request('POST', '/auth/login', {
        email: 'admin@brightloop.com',
        password: 'Admin@12345'
    });
    console.log('Admin login status:', res.status, 'Role:', res.body.user.role);
    if (res.status !== 200 || res.body.user.role !== 'admin') throw new Error('Admin login failed');
    const adminToken = res.body.token;

    // Staff login
    res = await request('POST', '/auth/login', {
        email: 'staff@brightloop.com',
        password: 'Staff@12345'
    });
    console.log('Staff login status:', res.status, 'Role:', res.body.user.role);
    if (res.status !== 200 || res.body.user.role !== 'staff') throw new Error('Staff login failed');
    const staffToken = res.body.token;

    console.log('\n--- 3. Testing Staff Addition (Admin Only) ---');
    // Staff attempting to add staff (should be 403 Forbidden)
    res = await request('POST', '/users/staff', {
        email: 'unauth@brightloop.com',
        password: 'StaffPass@123',
        name: 'Fake Staff'
    }, staffToken);
    console.log('Non-admin adding staff rejected:', res.status, res.body.error);
    if (res.status !== 403) throw new Error('Non-admin was allowed to add staff!');

    // Admin adding staff
    res = await request('POST', '/users/staff', {
        email: `newhire_${Date.now()}@brightloop.com`,
        password: 'StaffPass@123',
        name: 'New Hire Support'
    }, adminToken);
    console.log('Admin adding staff status:', res.status, res.body.message);
    if (res.status !== 201) throw new Error('Admin could not add staff');

    console.log('\n--- 4. Testing Password Reset Link Dispatch ---');
    res = await request('POST', '/auth/forgot-password', {
        email: testEmail
    });
    console.log('Forgot password status:', res.status, 'Simulated Link:', res.body.simulatedResetLink);
    if (res.status !== 200 || !res.body.resetToken) throw new Error('Forgot password failed');
    const resetToken = res.body.resetToken;

    // Reset password with token
    res = await request('POST', '/auth/reset-password', {
        token: resetToken,
        new_password: 'NewSecurePass#999'
    });
    console.log('Reset password status:', res.status, res.body.message);
    if (res.status !== 200) throw new Error('Reset password with token failed');

    console.log('\n--- 5. Testing Products & Variants (e.g. Odoo brand adds 560) ---');
    res = await request('GET', '/products');
    console.log('Products fetched count:', res.body.length);
    const erp = res.body.find(p => p.name.includes('Business Suite'));
    const odooVariant = erp.variants.find(v => v.variant_name.includes('Odoo'));
    console.log('Odoo variant found:', odooVariant.variant_name, 'Modifier:', odooVariant.price_modifier);
    if (!odooVariant || odooVariant.price_modifier !== 560) throw new Error('Odoo variant +560 not found!');

    console.log('\n--- 6. Testing Quotation Template Conversion into Subscription ---');
    const templatesRes = await request('GET', '/templates', null, staffToken);
    const tmpl = templatesRes.body[0];
    console.log('Using quotation template:', tmpl.name);

    res = await request('POST', `/templates/${tmpl.id}/create-quote`, {
        customer_id: 3 // Acme Corp
    }, staffToken);
    console.log('Created quotation from template:', res.status, res.body.subscription.subscription_number);
    if (res.status !== 201) throw new Error('Quotation template conversion failed');
    const newQuoteId = res.body.subscription.id;

    console.log('\n--- 7. Testing Subscription Lifecycle: Quotation -> Confirmed -> Active ---');
    res = await request('POST', `/subscriptions/${newQuoteId}/status`, {
        target_status: 'Confirmed'
    }, staffToken);
    console.log('Transition to Confirmed:', res.status, res.body.subscription.status);

    res = await request('POST', `/subscriptions/${newQuoteId}/status`, {
        target_status: 'Active'
    }, staffToken);
    console.log('Transition to Active:', res.status, res.body.subscription.status);

    console.log('\n--- 8. Testing Automated Billing Run ---');
    res = await request('POST', '/billing/run', {}, adminToken);
    console.log('Billing run result:', res.status, res.body.message, 'Invoices generated:', res.body.generated_count);
    if (res.status !== 200) throw new Error('Billing run failed');

    console.log('\n--- 9. Testing Invoices & Recording Payment ---');
    const invRes = await request('GET', '/invoices?filter=outstanding', null, staffToken);
    console.log('Outstanding invoices count:', invRes.body.length);
    const invoiceToPay = invRes.body[0];
    console.log('Paying invoice:', invoiceToPay.invoice_number, 'Amount due:', invoiceToPay.balance_due);

    res = await request('POST', '/payments', {
        invoice_id: invoiceToPay.id,
        method: 'Credit Card',
        amount: invoiceToPay.balance_due,
        notes: 'Full settlement via Visa card'
    }, staffToken);
    console.log('Payment recorded:', res.status, res.body.message, 'New invoice status:', res.body.invoice.status);
    if (res.status !== 201 || res.body.invoice.status !== 'Paid') throw new Error('Payment completion failed');

    console.log('\n--- 10. Testing Customer Portal Isolation ---');
    const custSubs = await request('GET', '/subscriptions', null, customerToken);
    console.log('Customer sees their own subscriptions count:', custSubs.body.length);
    // Acme customer id = 3
    const acmeToken = (await request('POST', '/auth/login', { email: 'acme@corp.com', password: 'Customer@123' })).body.token;
    const acmeSubs = await request('GET', '/subscriptions', null, acmeToken);
    console.log('Acme customer subscriptions:', acmeSubs.body.map(s => s.subscription_number));
    if (acmeSubs.body.some(s => s.customer_id !== 3)) throw new Error('Customer saw another customer subscriptions!');

    console.log('\n--- 11. Testing Finance Reporting Dashboard (Under 2 seconds) ---');
    const startFinance = Date.now();
    res = await request('GET', '/finance/overview', null, adminToken);
    const duration = Date.now() - startFinance;
    console.log('Finance overview fetched in:', duration, 'ms');
    console.log('Active Subscriptions:', res.body.kpi.active_subscriptions);
    console.log('Total Revenue:', '$' + res.body.kpi.total_revenue_collected);
    console.log('MRR:', '$' + res.body.kpi.mrr);
    console.log('ARR:', '$' + res.body.kpi.arr);
    console.log('Overdue Invoices:', res.body.kpi.overdue_invoices_count, 'Total overdue: $' + res.body.kpi.total_overdue_amount);
    if (duration > 2000) throw new Error('Finance overview exceeded 2 seconds!');
}
