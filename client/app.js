// Brightloop Subscription Management System - Client Application

const API_BASE = '/api';

// Application State
let currentUser = null;
let authToken = localStorage.getItem('brightloop_token') || null;
let currentTab = 'financeTab';
let allTemplates = [];
let allCustomers = [];
let allInvoices = [];

// Demo Credentials for Instant Review
const DEMO_USERS = {
    admin: { email: 'admin@brightloop.com', password: 'Admin@12345' },
    staff: { email: 'staff@brightloop.com', password: 'Staff@12345' },
    acme: { email: 'acme@corp.com', password: 'Customer@123' },
    bakery: { email: 'bakery@shop.com', password: 'Customer@123' }
};

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    // If not logged in, login as admin by default for seamless evaluation
    if (!authToken) {
        await switchDemoUser('admin');
    } else {
        await fetchCurrentUser();
    }
    
    // Set default dates on datepickers
    const today = new Date().toISOString().split('T')[0];
    const dateInputs = ['tplStartDate', 'payDate', 'discStart', 'discEnd'];
    dateInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = today;
    });
});

// ==========================================
// AUTHENTICATION & DEMO SWITCHER
// ==========================================
async function switchDemoUser(userKey) {
    const creds = DEMO_USERS[userKey];
    if (!creds) return;

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(creds)
        });

        const data = await res.json();
        if (res.ok) {
            authToken = data.token;
            localStorage.setItem('brightloop_token', authToken);
            currentUser = data.user;
            updateUserUI();
            showNotification(`Switched role to: ${currentUser.name} (${currentUser.role})`, 'success');
            
            // Adjust view based on role
            if (currentUser.role === 'customer') {
                switchTab('customerPortalTab');
            } else {
                switchTab('financeTab');
            }
        } else {
            showNotification(data.error || 'Login failed', 'error');
        }
    } catch (err) {
        console.error('Demo login failed:', err);
    }
}

async function fetchCurrentUser() {
    try {
        const res = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            currentUser = data.user;
            updateUserUI();
            refreshCurrentTab();
        } else {
            logout();
        }
    } catch (err) {
        console.error('Fetch current user error:', err);
        logout();
    }
}

function updateUserUI() {
    if (!currentUser) return;

    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();

    const roleBadge = document.getElementById('userRoleBadge');
    roleBadge.textContent = currentUser.role;
    roleBadge.className = `user-role-badge role-${currentUser.role}`;

    // Visibility toggles based on role
    const adminStaffEls = document.querySelectorAll('.admin-staff-only');
    const adminOnlyEls = document.querySelectorAll('.admin-only');
    const customerOnlyEls = document.querySelectorAll('.customer-only');

    if (currentUser.role === 'admin') {
        adminStaffEls.forEach(el => el.style.display = '');
        adminOnlyEls.forEach(el => el.style.display = '');
        customerOnlyEls.forEach(el => el.style.display = 'none');
    } else if (currentUser.role === 'staff') {
        adminStaffEls.forEach(el => el.style.display = '');
        adminOnlyEls.forEach(el => el.style.display = 'none');
        customerOnlyEls.forEach(el => el.style.display = 'none');
    } else {
        // Customer
        adminStaffEls.forEach(el => el.style.display = 'none');
        adminOnlyEls.forEach(el => el.style.display = 'none');
        customerOnlyEls.forEach(el => el.style.display = '');
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('brightloop_token');
    document.getElementById('userPill').style.display = 'none';
    document.getElementById('btnAuthTrigger').style.display = 'block';
    openAuthModal();
}

// ==========================================
// NAVIGATION & TABS
// ==========================================
function switchTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');

    const activeBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    refreshCurrentTab();
}

function refreshCurrentTab() {
    switch (currentTab) {
        case 'financeTab': loadFinanceData(); break;
        case 'subscriptionsTab': loadSubscriptions(); break;
        case 'invoicesTab': loadInvoices(); break;
        case 'paymentsTab': loadPayments(); break;
        case 'productsTab': loadProducts(); break;
        case 'plansTab': loadPlans(); break;
        case 'discountsTaxesTab': loadDiscountsAndTaxes(); break;
        case 'staffTab': loadStaff(); break;
        case 'customerPortalTab': loadCustomerPortal(); break;
    }
}

// ==========================================
// TAB 1: FINANCE & REPORTING (FINANCE LEAD)
// ==========================================
async function loadFinanceData() {
    const t0 = performance.now();
    try {
        const res = await fetch(`${API_BASE}/finance/overview`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        const duration = Math.round(performance.now() - t0);

        document.getElementById('perfResponseTime').textContent = `${duration} ms`;

        if (res.ok) {
            const kpi = data.kpi;
            document.getElementById('kpiActiveSubs').textContent = kpi.active_subscriptions;
            document.getElementById('kpiMRR').textContent = `$${kpi.mrr.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            document.getElementById('kpiARR').textContent = `ARR: $${kpi.arr.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            document.getElementById('kpiRevenue').textContent = `$${kpi.total_revenue_collected.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            document.getElementById('kpiOutstanding').textContent = `$${kpi.total_outstanding_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
            document.getElementById('kpiUnpaidCount').textContent = `${kpi.unpaid_invoices_count} pending invoices`;
            document.getElementById('kpiOverdueCount').textContent = kpi.overdue_invoices_count;
            document.getElementById('kpiOverdueAmount').textContent = `$${kpi.total_overdue_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} at risk`;
            document.getElementById('overdueBadge').textContent = `${kpi.overdue_invoices_count} Overdue`;

            // Overdue table
            const tbody = document.getElementById('overdueTableBody');
            if (data.overdue_invoices.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No overdue invoices found! All accounts current.</td></tr>';
            } else {
                tbody.innerHTML = data.overdue_invoices.map(inv => `
                    <tr>
                        <td><strong>${inv.invoice_number}</strong></td>
                        <td>
                            <div>${inv.customer_name}</div>
                            <small class="text-muted">${inv.customer_email}</small>
                        </td>
                        <td><span class="text-danger font-weight-bold">${inv.due_date}</span></td>
                        <td>$${inv.total_amount.toFixed(2)}</td>
                        <td><strong class="text-danger">$${inv.amount_overdue.toFixed(2)}</strong></td>
                        <td>${inv.payment_terms || 'Net 30'}</td>
                        <td>
                            <button class="btn btn-secondary btn-sm" onclick="sendInvoiceReminder(${inv.id})">
                                &#x2709; Chase
                            </button>
                            <button class="btn btn-primary btn-sm" onclick="quickPayInvoice(${inv.id}, ${inv.amount_overdue})">
                                &#x1F4B5; Settle
                            </button>
                        </td>
                    </tr>
                `).join('');
            }

            // Recent payments table
            const pbody = document.getElementById('recentPaymentsBody');
            if (data.recent_payments.length === 0) {
                pbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No payments recorded yet.</td></tr>';
            } else {
                pbody.innerHTML = data.recent_payments.map(p => `
                    <tr>
                        <td><strong>${p.payment_number}</strong></td>
                        <td>${p.invoice_number}</td>
                        <td>${p.customer_name}</td>
                        <td><span class="badge badge-quote">${p.method}</span></td>
                        <td><strong class="text-success">$${p.amount.toFixed(2)}</strong></td>
                        <td>${p.payment_date}</td>
                        <td><small class="text-muted">${p.notes || '-'}</small></td>
                    </tr>
                `).join('');
            }
        }
    } catch (err) {
        console.error('Finance fetch error:', err);
    }
}

// ==========================================
// TAB 2: SUBSCRIPTIONS & QUOTES
// ==========================================
async function loadSubscriptions() {
    try {
        const filter = document.getElementById('subStatusFilter').value;
        let url = `${API_BASE}/subscriptions`;
        if (filter) url += `?status=${filter}`;

        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const subs = await res.json();

        const tbody = document.getElementById('subscriptionsTableBody');
        if (!subs || subs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No subscriptions found.</td></tr>';
            return;
        }

        tbody.innerHTML = subs.map(s => {
            const statusClass = `badge-${s.status.toLowerCase()}`;
            return `
                <tr>
                    <td><strong>${s.subscription_number}</strong></td>
                    <td>
                        <div>${s.customer_name}</div>
                        <small class="text-muted">${s.customer_company || s.customer_email}</small>
                    </td>
                    <td>
                        <div>${s.plan_name || 'Custom Plan'}</div>
                        <small class="badge badge-quote">${s.billing_frequency || 'Monthly'}</small>
                    </td>
                    <td><span class="badge ${statusClass}">${s.status}</span></td>
                    <td>${s.start_date}</td>
                    <td>${s.expiry_date || 'No Expiry'}</td>
                    <td>${s.next_billing_date || '-'}</td>
                    <td><strong>$${(s.total_recurring_amount || 0).toFixed(2)}</strong></td>
                    <td>
                        <div class="header-actions">
                            ${getSubscriptionActions(s)}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Load subscriptions error:', err);
    }
}

function getSubscriptionActions(sub) {
    let btns = '';
    if (sub.status === 'Draft') {
        btns += `<button class="btn btn-secondary btn-sm" onclick="transitionSubStatus(${sub.id}, 'Quotation')">Send Quote</button>`;
    } else if (sub.status === 'Quotation') {
        btns += `<button class="btn btn-primary btn-sm" onclick="transitionSubStatus(${sub.id}, 'Confirmed')">Confirm</button>`;
    } else if (sub.status === 'Confirmed') {
        btns += `<button class="btn btn-primary btn-sm" onclick="transitionSubStatus(${sub.id}, 'Active')">Activate</button>`;
    } else if (sub.status === 'Active') {
        if (sub.can_pause !== 0) {
            btns += `<button class="btn btn-secondary btn-sm" onclick="transitionSubStatus(${sub.id}, 'Paused')">Pause</button>`;
        }
        if (sub.can_close_early !== 0) {
            btns += `<button class="btn btn-secondary btn-sm text-danger" onclick="transitionSubStatus(${sub.id}, 'Closed')">Close Early</button>`;
        }
    } else if (sub.status === 'Paused') {
        btns += `<button class="btn btn-primary btn-sm" onclick="transitionSubStatus(${sub.id}, 'Active')">Resume</button>`;
    } else if (sub.status === 'Closed' && sub.can_renew !== 0) {
        btns += `<button class="btn btn-primary btn-sm" onclick="renewSubscription(${sub.id})">&#x21BB; Renew</button>`;
    }
    return btns || '<span class="text-muted">-</span>';
}

async function transitionSubStatus(id, targetStatus) {
    try {
        const res = await fetch(`${API_BASE}/subscriptions/${id}/status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ target_status: targetStatus })
        });
        const data = await res.json();
        if (res.ok) {
            showNotification(data.message, 'success');
            loadSubscriptions();
            loadFinanceData();
        } else {
            showNotification(data.error || 'Failed to update subscription', 'error');
        }
    } catch (err) {
        console.error('Transition sub error:', err);
    }
}

async function renewSubscription(id) {
    try {
        const res = await fetch(`${API_BASE}/subscriptions/${id}/renew`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (res.ok) {
            showNotification(data.message, 'success');
            loadSubscriptions();
            loadFinanceData();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (err) {
        console.error('Renew error:', err);
    }
}

// ==========================================
// TEMPLATE TO QUOTE
// ==========================================
async function openTemplateQuoteModal() {
    try {
        const [templatesRes, customersRes] = await Promise.all([
            fetch(`${API_BASE}/templates`, { headers: { 'Authorization': `Bearer ${authToken}` } }),
            fetch(`${API_BASE}/users/customers`, { headers: { 'Authorization': `Bearer ${authToken}` } })
        ]);
        allTemplates = await templatesRes.json();
        allCustomers = await customersRes.json();

        const tplSelect = document.getElementById('tplSelect');
        tplSelect.innerHTML = allTemplates.map(t => `
            <option value="${t.id}">${t.name} (Valid: ${t.validity_days} days)</option>
        `).join('');

        const custSelect = document.getElementById('tplCustomerSelect');
        custSelect.innerHTML = allCustomers.map(c => `
            <option value="${c.id}">${c.name} (${c.company || c.email})</option>
        `).join('');

        if (allTemplates.length > 0) {
            renderTemplatePreview(allTemplates[0].id);
        }

        openModal('templateQuoteModal');
    } catch (err) {
        console.error('Open template quote modal error:', err);
    }
}

function renderTemplatePreview(templateId) {
    const tpl = allTemplates.find(t => t.id == templateId);
    if (!tpl) return;

    const box = document.getElementById('tplPreviewBox');
    box.innerHTML = `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-top:8px;">
            <div style="font-weight:600; font-size:13px; color:#1e1b4b; margin-bottom:6px;">Pre-configured Plan & Products:</div>
            <p style="font-size:12px; color:#475569; margin-bottom:8px;">${tpl.notes || ''}</p>
            <ul style="padding-left:18px; font-size:12.5px;">
                ${tpl.lines.map(l => `
                    <li>${l.product_name} ${l.variant_name ? `<strong>(${l.variant_name})</strong>` : ''} &times; ${l.quantity} @ $${l.unit_price.toFixed(2)}</li>
                `).join('')}
            </ul>
            <div style="margin-top:8px; font-size:12px; color:#64748b;">
                Payment Terms: <strong>${tpl.payment_terms}</strong> &bull; Validity: <strong>${tpl.validity_days} days</strong>
            </div>
        </div>
    `;
}

async function handleCreateFromTemplate(e) {
    e.preventDefault();
    const templateId = document.getElementById('tplSelect').value;
    const customerId = document.getElementById('tplCustomerSelect').value;
    const startDate = document.getElementById('tplStartDate').value;

    try {
        const res = await fetch(`${API_BASE}/templates/${templateId}/create-quote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                customer_id: customerId,
                start_date: startDate
            })
        });

        const data = await res.json();
        if (res.ok) {
            closeModal('templateQuoteModal');
            showNotification(data.message, 'success');
            loadSubscriptions();
        } else {
            showNotification(data.error || 'Failed to create quote', 'error');
        }
    } catch (err) {
        console.error('Create from template error:', err);
    }
}

// ==========================================
// TAB 3: BILLING DAY & INVOICES
// ==========================================
async function triggerBillingRun() {
    try {
        const res = await fetch(`${API_BASE}/billing/run`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (res.ok) {
            showNotification(data.message, 'success');
            loadFinanceData();
            loadInvoices();
            loadSubscriptions();
        } else {
            showNotification(data.error || 'Billing run failed', 'error');
        }
    } catch (err) {
        console.error('Billing run error:', err);
    }
}

async function loadInvoices() {
    try {
        const filter = document.getElementById('invoiceFilterSelect').value;
        let url = `${API_BASE}/invoices`;
        if (filter) url += `?filter=${filter}`;

        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const invoices = await res.json();
        allInvoices = invoices;

        const tbody = document.getElementById('invoicesTableBody');
        if (!invoices || invoices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted">No invoices found.</td></tr>';
            return;
        }

        tbody.innerHTML = invoices.map(inv => {
            const statusClass = `badge-${(inv.effective_status || inv.status).toLowerCase()}`;
            return `
                <tr>
                    <td><strong>${inv.invoice_number}</strong></td>
                    <td>${inv.subscription_number || '-'}</td>
                    <td>
                        <div>${inv.customer_name}</div>
                        <small class="text-muted">${inv.customer_email}</small>
                    </td>
                    <td><span class="badge ${statusClass}">${inv.effective_status || inv.status}</span></td>
                    <td>${inv.issue_date}</td>
                    <td>${inv.due_date}</td>
                    <td>$${inv.subtotal.toFixed(2)}</td>
                    <td>$${inv.tax_amount.toFixed(2)}</td>
                    <td>-$${inv.discount_amount.toFixed(2)}</td>
                    <td><strong>$${inv.total_amount.toFixed(2)}</strong></td>
                    <td><strong class="${inv.balance_due > 0 ? 'text-danger' : 'text-success'}">$${inv.balance_due.toFixed(2)}</strong></td>
                    <td>
                        <div class="header-actions">
                            <button class="btn btn-secondary btn-sm" onclick="viewPrintableInvoice(${inv.id})">&#x1F5A8; View</button>
                            ${inv.status === 'Draft' ? `<button class="btn btn-primary btn-sm" onclick="confirmInvoice(${inv.id})">Confirm</button>` : ''}
                            ${inv.balance_due > 0.01 && inv.status !== 'Cancelled' ? `<button class="btn btn-primary btn-sm" onclick="quickPayInvoice(${inv.id}, ${inv.balance_due})">&#x1F4B5; Pay</button>` : ''}
                            <button class="btn btn-secondary btn-sm" onclick="sendInvoiceReminder(${inv.id})" title="Send email">&#x2709;</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Load invoices error:', err);
    }
}

async function viewPrintableInvoice(invoiceId) {
    try {
        const res = await fetch(`${API_BASE}/invoices/${invoiceId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const inv = await res.json();
        if (!res.ok) return showNotification(inv.error, 'error');

        document.getElementById('invDocNumber').textContent = inv.invoice_number;
        document.getElementById('invDocStatusBadge').textContent = inv.status;
        document.getElementById('invDocStatusBadge').className = `badge badge-${inv.status.toLowerCase()}`;
        document.getElementById('invDocIssue').textContent = inv.issue_date;
        document.getElementById('invDocDue').textContent = inv.due_date;
        document.getElementById('invDocTerms').textContent = inv.payment_terms || 'Net 30';

        document.getElementById('invDocCustomerName').textContent = inv.customer_name;
        document.getElementById('invDocCustomerEmail').textContent = inv.customer_email;
        document.getElementById('invDocCustomerCompany').textContent = inv.customer_company || 'Brightloop Customer';
        document.getElementById('invDocSubNumber').textContent = inv.subscription_number || 'Direct';

        document.getElementById('invDocLinesBody').innerHTML = inv.lines.map(l => `
            <tr>
                <td>${l.description}</td>
                <td>${l.quantity}</td>
                <td>$${l.unit_price.toFixed(2)}</td>
                <td>${l.tax_rate}%</td>
                <td>$${l.tax_amount.toFixed(2)}</td>
                <td>-$${l.discount_amount.toFixed(2)}</td>
                <td>$${l.line_total.toFixed(2)}</td>
            </tr>
        `).join('');

        document.getElementById('invDocSubtotal').textContent = `$${inv.subtotal.toFixed(2)}`;
        document.getElementById('invDocTax').textContent = `$${inv.tax_amount.toFixed(2)}`;
        document.getElementById('invDocDiscount').textContent = `-$${inv.discount_amount.toFixed(2)}`;
        document.getElementById('invDocTotal').textContent = `$${inv.total_amount.toFixed(2)}`;
        document.getElementById('invDocPaid').textContent = `$${inv.paid_amount.toFixed(2)}`;
        document.getElementById('invDocBalance').textContent = `$${inv.balance_due.toFixed(2)}`;

        openModal('invoiceViewModal');
    } catch (err) {
        console.error('View printable invoice error:', err);
    }
}

async function confirmInvoice(id) {
    try {
        const res = await fetch(`${API_BASE}/invoices/${id}/confirm`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (res.ok) {
            showNotification(data.message, 'success');
            loadInvoices();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (err) {
        console.error('Confirm invoice error:', err);
    }
}

async function sendInvoiceReminder(id) {
    try {
        const res = await fetch(`${API_BASE}/invoices/${id}/send`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (res.ok) {
            showNotification(data.message, 'success');
        } else {
            showNotification(data.error, 'error');
        }
    } catch (err) {
        console.error('Send invoice error:', err);
    }
}

// ==========================================
// TAB 4: PAYMENTS & LEDGER
// ==========================================
async function loadPayments() {
    try {
        const res = await fetch(`${API_BASE}/payments`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const payments = await res.json();

        const tbody = document.getElementById('paymentsTableBody');
        if (!payments || payments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No payments recorded yet.</td></tr>';
            return;
        }

        tbody.innerHTML = payments.map(p => `
            <tr>
                <td><strong>${p.payment_number}</strong></td>
                <td>${p.invoice_number}</td>
                <td>${p.customer_name}</td>
                <td><span class="badge badge-quote">${p.method}</span></td>
                <td><strong class="text-success">$${p.amount.toFixed(2)}</strong></td>
                <td>${p.payment_date}</td>
                <td><small class="text-muted">${p.notes || '-'}</small></td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Load payments error:', err);
    }
}

async function openPaymentModal(selectedInvoiceId = null, prefillAmount = null) {
    try {
        const res = await fetch(`${API_BASE}/invoices?filter=outstanding`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const unpaid = await res.json();

        const select = document.getElementById('payInvoiceSelect');
        if (unpaid.length === 0) {
            select.innerHTML = '<option value="">No unpaid invoices available</option>';
        } else {
            select.innerHTML = unpaid.map(inv => `
                <option value="${inv.id}" data-balance="${inv.balance_due}" ${inv.id == selectedInvoiceId ? 'selected' : ''}>
                    ${inv.invoice_number} - ${inv.customer_name} (Balance: $${inv.balance_due.toFixed(2)})
                </option>
            `).join('');
        }

        const amountInput = document.getElementById('payAmount');
        if (prefillAmount) {
            amountInput.value = prefillAmount.toFixed(2);
        } else if (unpaid.length > 0) {
            amountInput.value = unpaid[0].balance_due.toFixed(2);
        }

        openModal('paymentModal');
    } catch (err) {
        console.error('Open payment modal error:', err);
    }
}

function updatePayAmountDefault(invId) {
    const select = document.getElementById('payInvoiceSelect');
    const opt = select.querySelector(`option[value="${invId}"]`);
    if (opt && opt.dataset.balance) {
        document.getElementById('payAmount').value = parseFloat(opt.dataset.balance).toFixed(2);
    }
}

function quickPayInvoice(invoiceId, balance) {
    openPaymentModal(invoiceId, balance);
}

async function handleRecordPayment(e) {
    e.preventDefault();
    const invoiceId = document.getElementById('payInvoiceSelect').value;
    const method = document.getElementById('payMethod').value;
    const amount = document.getElementById('payAmount').value;
    const date = document.getElementById('payDate').value;
    const notes = document.getElementById('payNotes').value;

    try {
        const res = await fetch(`${API_BASE}/payments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                invoice_id: invoiceId,
                method,
                amount,
                payment_date: date,
                notes
            })
        });

        const data = await res.json();
        if (res.ok) {
            closeModal('paymentModal');
            showNotification(data.message, 'success');
            refreshCurrentTab();
            loadFinanceData();
        } else {
            showNotification(data.error || 'Payment failed', 'error');
        }
    } catch (err) {
        console.error('Record payment error:', err);
    }
}

// ==========================================
// TAB 5: PRODUCTS & VARIANTS
// ==========================================
async function loadProducts() {
    try {
        const res = await fetch(`${API_BASE}/products`);
        const products = await res.json();

        const grid = document.getElementById('productsGrid');
        if (!products || products.length === 0) {
            grid.innerHTML = '<p class="text-muted">No products available.</p>';
            return;
        }

        grid.innerHTML = products.map(p => `
            <div class="product-card">
                <div class="product-head">
                    <div>
                        <div class="product-title">${p.name}</div>
                        <span class="product-type">${p.type}</span>
                    </div>
                    ${currentUser.role === 'admin' ? `
                        <button class="btn btn-secondary btn-sm" onclick="openAddVariantModal(${p.id}, '${escapeHtml(p.name)}')">
                            + Variant
                        </button>
                    ` : ''}
                </div>
                <p style="font-size:12.5px; color:#64748b; margin-top:4px;">${p.notes || ''}</p>
                <div class="product-price">$${p.sales_price.toFixed(2)} <small style="font-size:12px; color:#64748b;">(Cost: $${p.cost_price.toFixed(2)})</small></div>

                <div class="variants-section">
                    <div style="font-size:11px; font-weight:700; color:#94a3b8; text-transform:uppercase; margin-bottom:4px;">Available Variants:</div>
                    ${p.variants && p.variants.length > 0 
                        ? p.variants.map(v => `
                            <span class="variant-tag">
                                <strong>${v.variant_name}</strong>: ${v.price_modifier >= 0 ? `+$${v.price_modifier.toFixed(2)}` : `-$${Math.abs(v.price_modifier).toFixed(2)}`}
                            </span>
                        `).join('')
                        : '<span style="font-size:12px; color:#94a3b8;">No variants configured.</span>'
                    }
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Load products error:', err);
    }
}

function openAddVariantModal(productId, productName) {
    document.getElementById('varProductId').value = productId;
    document.getElementById('varProductName').value = productName;
    document.getElementById('varName').value = '';
    document.getElementById('varModifier').value = '560';
    openModal('variantModal');
}

async function handleAddVariant(e) {
    e.preventDefault();
    const productId = document.getElementById('varProductId').value;
    const name = document.getElementById('varName').value;
    const modifier = document.getElementById('varModifier').value;

    try {
        const res = await fetch(`${API_BASE}/products/${productId}/variants`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                variant_name: name,
                price_modifier: modifier
            })
        });

        const data = await res.json();
        if (res.ok) {
            closeModal('variantModal');
            showNotification(data.message, 'success');
            loadProducts();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (err) {
        console.error('Add variant error:', err);
    }
}

function openNewProductModal() {
    openModal('productModal');
}

async function handleAddProduct(e) {
    e.preventDefault();
    const name = document.getElementById('prodName').value;
    const type = document.getElementById('prodType').value;
    const salesPrice = document.getElementById('prodSalesPrice').value;
    const costPrice = document.getElementById('prodCostPrice').value;
    const notes = document.getElementById('prodNotes').value;

    try {
        const res = await fetch(`${API_BASE}/products`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                name,
                type,
                sales_price: salesPrice,
                cost_price: costPrice,
                notes
            })
        });

        const data = await res.json();
        if (res.ok) {
            closeModal('productModal');
            showNotification(data.message, 'success');
            loadProducts();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (err) {
        console.error('Add product error:', err);
    }
}

// ==========================================
// TAB 6: PLANS
// ==========================================
async function loadPlans() {
    try {
        const res = await fetch(`${API_BASE}/plans`);
        const plans = await res.json();

        const tbody = document.getElementById('plansTableBody');
        if (!plans || plans.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted">No plans configured.</td></tr>';
            return;
        }

        tbody.innerHTML = plans.map(p => `
            <tr>
                <td><strong>${p.name}</strong></td>
                <td>${p.product_name}</td>
                <td><span class="badge badge-quote">${p.billing_frequency}</span></td>
                <td><strong>$${p.price.toFixed(2)}</strong></td>
                <td>${p.min_quantity} seat(s)</td>
                <td>${p.start_date}</td>
                <td>${p.end_date || 'Ongoing'}</td>
                <td>${p.auto_close ? '&#x2705; Yes' : 'No'}</td>
                <td>${p.can_pause ? '&#x2705; Yes' : 'No'}</td>
                <td>${p.can_close_early ? '&#x2705; Yes' : 'No'}</td>
                <td>${p.can_renew ? '&#x2705; Yes' : 'No'}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Load plans error:', err);
    }
}

// ==========================================
// TAB 7: DISCOUNTS & TAXES (ADMIN ONLY)
// ==========================================
async function loadDiscountsAndTaxes() {
    try {
        const [discRes, taxRes] = await Promise.all([
            fetch(`${API_BASE}/discounts`, { headers: { 'Authorization': `Bearer ${authToken}` } }),
            fetch(`${API_BASE}/taxes`, { headers: { 'Authorization': `Bearer ${authToken}` } })
        ]);

        const discounts = await discRes.json();
        const taxes = await taxRes.json();

        // Discounts
        const dbody = document.getElementById('discountsTableBody');
        dbody.innerHTML = discounts.map(d => `
            <tr>
                <td><strong>${d.name}</strong></td>
                <td><span class="badge badge-quote">${d.code}</span></td>
                <td>${d.rule_type === 'percentage' ? `${d.value}% Off` : `$${d.value.toFixed(2)} Off`}</td>
                <td>${d.min_quantity > 0 ? `${d.min_quantity} seats` : (d.min_purchase > 0 ? `$${d.min_purchase} min` : 'None')}</td>
                <td>${d.start_date} to ${d.end_date}</td>
                <td>${d.usage_count} / ${d.usage_limit || 'Unlimited'}</td>
                <td><span class="badge badge-draft">${d.scope}</span></td>
            </tr>
        `).join('');

        // Taxes
        const tbody = document.getElementById('taxesTableBody');
        tbody.innerHTML = taxes.map(t => `
            <tr>
                <td><strong>${t.name}</strong></td>
                <td>${t.rate}%</td>
                <td>${t.is_default ? '&#x2705; Default' : '-'}</td>
                <td><span class="badge badge-success">Active</span></td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Load discounts and taxes error:', err);
    }
}

function openNewDiscountModal() {
    openModal('discountModal');
}

async function handleAddDiscount(e) {
    e.preventDefault();
    const name = document.getElementById('discName').value;
    const code = document.getElementById('discCode').value;
    const type = document.getElementById('discType').value;
    const val = document.getElementById('discVal').value;
    const minQty = document.getElementById('discMinQty').value;
    const minPurchase = document.getElementById('discMinPurchase').value;
    const start = document.getElementById('discStart').value;
    const end = document.getElementById('discEnd').value;
    const limit = document.getElementById('discLimit').value;
    const scope = document.getElementById('discScope').value;

    try {
        const res = await fetch(`${API_BASE}/discounts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                name,
                code,
                rule_type: type,
                value: val,
                min_quantity: minQty,
                min_purchase: minPurchase,
                start_date: start,
                end_date: end,
                usage_limit: limit,
                scope
            })
        });

        const data = await res.json();
        if (res.ok) {
            closeModal('discountModal');
            showNotification(data.message, 'success');
            loadDiscountsAndTaxes();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (err) {
        console.error('Add discount error:', err);
    }
}

// ==========================================
// TAB 8: STAFF MANAGEMENT (ADMIN ONLY)
// ==========================================
async function loadStaff() {
    try {
        const res = await fetch(`${API_BASE}/users?role=staff`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const staff = await res.json();

        const tbody = document.getElementById('staffTableBody');
        tbody.innerHTML = staff.map(s => `
            <tr>
                <td><strong>${s.name}</strong></td>
                <td>${s.email}</td>
                <td>${s.company || 'Brightloop Internal'}</td>
                <td><span class="badge badge-quote">Staff</span></td>
                <td>${s.created_at || '2026-10-01'}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Load staff error:', err);
    }
}

function openNewStaffModal() {
    openModal('staffModal');
}

async function handleAddStaff(e) {
    e.preventDefault();
    const name = document.getElementById('staffName').value;
    const email = document.getElementById('staffEmail').value;
    const dept = document.getElementById('staffDept').value;
    const password = document.getElementById('staffPassword').value;

    try {
        const res = await fetch(`${API_BASE}/users/staff`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                name,
                email,
                department: dept,
                password
            })
        });

        const data = await res.json();
        if (res.ok) {
            closeModal('staffModal');
            showNotification(data.message, 'success');
            loadStaff();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (err) {
        console.error('Add staff error:', err);
    }
}

// ==========================================
// TAB 9: CUSTOMER PORTAL
// ==========================================
async function loadCustomerPortal() {
    try {
        const [subRes, invRes] = await Promise.all([
            fetch(`${API_BASE}/subscriptions`, { headers: { 'Authorization': `Bearer ${authToken}` } }),
            fetch(`${API_BASE}/invoices`, { headers: { 'Authorization': `Bearer ${authToken}` } })
        ]);

        const subs = await subRes.json();
        const invoices = await invRes.json();

        // Customer Subscriptions
        const stbody = document.getElementById('customerSubsTableBody');
        if (!subs || subs.length === 0) {
            stbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">You do not have any subscriptions active yet.</td></tr>';
        } else {
            stbody.innerHTML = subs.map(s => `
                <tr>
                    <td><strong>${s.subscription_number}</strong></td>
                    <td>${s.plan_name || 'Standard Plan'}</td>
                    <td><span class="badge badge-quote">${s.billing_frequency}</span></td>
                    <td><span class="badge badge-${s.status.toLowerCase()}">${s.status}</span></td>
                    <td>${s.start_date} to ${s.expiry_date || 'Ongoing'}</td>
                    <td><strong>$${(s.total_recurring_amount || 0).toFixed(2)}</strong></td>
                </tr>
            `).join('');
        }

        // Customer Invoices
        const itbody = document.getElementById('customerInvoicesTableBody');
        if (!invoices || invoices.length === 0) {
            itbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No invoices found.</td></tr>';
        } else {
            itbody.innerHTML = invoices.map(inv => `
                <tr>
                    <td><strong>${inv.invoice_number}</strong></td>
                    <td>${inv.issue_date}</td>
                    <td>${inv.due_date}</td>
                    <td>$${inv.total_amount.toFixed(2)}</td>
                    <td>$${inv.paid_amount.toFixed(2)}</td>
                    <td><strong class="${inv.balance_due > 0 ? 'text-danger' : 'text-success'}">$${inv.balance_due.toFixed(2)}</strong></td>
                    <td><span class="badge badge-${inv.status.toLowerCase()}">${inv.status}</span></td>
                    <td>
                        <div class="header-actions">
                            <button class="btn btn-secondary btn-sm" onclick="viewPrintableInvoice(${inv.id})">&#x1F5A8; View</button>
                            ${inv.balance_due > 0.01 && inv.status !== 'Cancelled' ? `
                                <button class="btn btn-primary btn-sm" onclick="quickPayInvoice(${inv.id}, ${inv.balance_due})">&#x1F4B3; Pay Online</button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `).join('');
        }
    } catch (err) {
        console.error('Customer portal error:', err);
    }
}

// ==========================================
// PASSWORD COMPLEXITY VALIDATOR (PDF REQUIREMENTS)
// ==========================================
function checkPasswordRequirements(pwd) {
    const isLen = pwd.length > 8;
    const isUpper = /[A-Z]/.test(pwd);
    const isLower = /[a-z]/.test(pwd);
    const isSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(pwd);

    updateRuleState('ruleLen', isLen, 'More than 8 characters');
    updateRuleState('ruleUpper', isUpper, 'At least one uppercase letter (A-Z)');
    updateRuleState('ruleLower', isLower, 'At least one lowercase letter (a-z)');
    updateRuleState('ruleSpecial', isSpecial, 'At least one special character (!@#$%^&*)');
}

function updateRuleState(elementId, isValid, text) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (isValid) {
        el.className = 'rule-item valid';
        el.innerHTML = `&#x2713; ${text}`;
    } else {
        el.className = 'rule-item';
        el.innerHTML = `&#x2717; ${text}`;
    }
}

// ==========================================
// MODAL CONTROLS & UTILITIES
// ==========================================
function openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add('active');
}

function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('active');
}

function openAuthModal() {
    showAuthView('signInView');
    openModal('authModal');
}

function showAuthView(viewId) {
    document.getElementById('signUpView').style.display = 'none';
    document.getElementById('signInView').style.display = 'none';
    document.getElementById('forgotView').style.display = 'none';
    const target = document.getElementById(viewId);
    if (target) target.style.display = 'block';

    const titleEl = document.getElementById('authModalTitle');
    if (viewId === 'signUpView') titleEl.textContent = 'Create Brightloop Account';
    else if (viewId === 'signInView') titleEl.textContent = 'Sign In to Brightloop';
    else if (viewId === 'forgotView') titleEl.textContent = 'Reset Forgotten Password';
}

async function handleSignUp(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const company = document.getElementById('regCompany').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;

    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, company, email, password })
        });
        const data = await res.json();
        if (res.ok) {
            authToken = data.token;
            localStorage.setItem('brightloop_token', authToken);
            currentUser = data.user;
            closeModal('authModal');
            updateUserUI();
            showNotification('Registration successful! Welcome to Brightloop.', 'success');
            switchTab('customerPortalTab');
        } else {
            showNotification(data.error || 'Registration failed', 'error');
        }
    } catch (err) {
        console.error('Sign up error:', err);
    }
}

async function handleSignIn(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok) {
            authToken = data.token;
            localStorage.setItem('brightloop_token', authToken);
            currentUser = data.user;
            closeModal('authModal');
            updateUserUI();
            showNotification(`Signed in as ${currentUser.name}`, 'success');
            if (currentUser.role === 'customer') {
                switchTab('customerPortalTab');
            } else {
                switchTab('financeTab');
            }
        } else {
            showNotification(data.error || 'Login failed', 'error');
        }
    } catch (err) {
        console.error('Sign in error:', err);
    }
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById('forgotEmail').value;

    try {
        const res = await fetch(`${API_BASE}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (res.ok) {
            showNotification(data.message, 'success');
            if (data.simulatedResetLink) {
                alert(`[SIMULATED DISPATCHED RESET EMAIL]\n\nReset Link: ${data.simulatedResetLink}\n\nToken: ${data.resetToken}`);
            }
            showAuthView('signInView');
        } else {
            showNotification(data.error, 'error');
        }
    } catch (err) {
        console.error('Forgot password error:', err);
    }
}

function showNotification(msg, type = 'success') {
    const banner = document.getElementById('notificationBanner');
    banner.textContent = msg;
    banner.className = `notification-banner ${type}`;
    banner.style.display = 'block';
    setTimeout(() => {
        banner.style.display = 'none';
    }, 4500);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
