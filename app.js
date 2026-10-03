/* ============ STORAGE ============ */
const DB = {
  get(key, fallback) {
    const v = localStorage.getItem('pharmacy_' + key);
    return v ? JSON.parse(v) : fallback;
  },
  set(key, value) {
    localStorage.setItem('pharmacy_' + key, JSON.stringify(value));
  }
};

let medicines = DB.get('medicines', []);
let suppliers = DB.get('suppliers', []);
let sales = DB.get('sales', []);
let purchases = DB.get('purchases', []);
let settings = DB.get('settings', {
  name: 'Bardibas Pharmacy',
  address: '',
  dda: '',
  pharmacistReg: '',
  pan: '',
  contact: '',
  lowStockThreshold: 10,
  expiryDays: 90
});

let cart = [];
let editingMedicineId = null;

function save() {
  DB.set('medicines', medicines);
  DB.set('suppliers', suppliers);
  DB.set('sales', sales);
  DB.set('purchases', purchases);
  DB.set('settings', settings);
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function rs(n) {
  n = Math.round((n + Number.EPSILON) * 100) / 100;
  return 'Rs. ' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

/* ============ NAV ============ */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('page-' + btn.dataset.page).classList.add('active');
    if (btn.dataset.page === 'dashboard') renderDashboard();
    if (btn.dataset.page === 'medicines') renderMedicineTable();
    if (btn.dataset.page === 'suppliers') renderSupplierTable();
    if (btn.dataset.page === 'purchase') renderPurchaseTable();
    if (btn.dataset.page === 'reports') renderReports();
    if (btn.dataset.page === 'settings') loadSettingsForm();
  });
});

/* ============ DASHBOARD ============ */
function daysUntil(dateStr) {
  const d1 = new Date(dateStr);
  const d0 = new Date();
  d0.setHours(0,0,0,0);
  return Math.ceil((d1 - d0) / 86400000);
}

function getLowStock() {
  return medicines.filter(m => m.qty <= settings.lowStockThreshold);
}
function getNearExpiry() {
  return medicines.filter(m => {
    const d = daysUntil(m.expiry);
    return d <= settings.expiryDays;
  }).sort((a,b) => daysUntil(a.expiry) - daysUntil(b.expiry));
}

function renderDashboard() {
  document.getElementById('stat-total-medicines').textContent = medicines.length;
  const low = getLowStock();
  const nearExp = getNearExpiry();
  document.getElementById('stat-low-stock').textContent = low.length;
  document.getElementById('stat-near-expiry').textContent = nearExp.length;

  const today = new Date().toDateString();
  const todaySales = sales.filter(s => new Date(s.date).toDateString() === today)
    .reduce((sum, s) => sum + s.total, 0);
  document.getElementById('stat-today-sales').textContent = rs(todaySales);

  const lowList = document.getElementById('dash-low-stock-list');
  lowList.innerHTML = low.length ? low.slice(0,8).map(m =>
    `<div class="alert-item"><span>${esc(m.name)} (${esc(m.batch)})</span><span>${m.qty} left</span></div>`
  ).join('') : '<div class="alert-empty">Kunai low stock chaina</div>';

  const expList = document.getElementById('dash-near-expiry-list');
  expList.innerHTML = nearExp.length ? nearExp.slice(0,8).map(m => {
    const d = daysUntil(m.expiry);
    const label = d < 0 ? 'EXPIRED' : d + ' din baaki';
    return `<div class="alert-item"><span>${esc(m.name)} (${esc(m.batch)})</span><span>${label}</span></div>`;
  }).join('') : '<div class="alert-empty">Kunai near-expiry medicine chaina</div>';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

/* ============ MEDICINES ============ */
function renderMedicineTable(filter = '') {
  const tbody = document.getElementById('medicine-tbody');
  const list = medicines.filter(m => m.name.toLowerCase().includes(filter.toLowerCase()));
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:24px;">Kunai medicine thapieko xaina</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(m => {
    const d = daysUntil(m.expiry);
    let rowClass = '';
    if (d < 0) rowClass = 'row-danger';
    else if (d <= settings.expiryDays) rowClass = 'row-warn';
    const supplierName = suppliers.find(s => s.id === m.supplierId)?.name || '-';
    return `<tr class="${rowClass}">
      <td>${esc(m.name)}</td>
      <td>${esc(m.generic || '-')}</td>
      <td>${esc(m.batch)}</td>
      <td>${esc(m.expiry)}</td>
      <td>${m.qty}</td>
      <td>${m.purchasePrice}</td>
      <td>${m.sellPrice}</td>
      <td>${esc(supplierName)}</td>
      <td>
        <button class="link-btn" onclick="openEditMedicine('${m.id}')">Edit</button>
        <button class="link-btn danger" onclick="deleteMedicine('${m.id}')">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

document.getElementById('medicine-search').addEventListener('input', e => renderMedicineTable(e.target.value));

function populateSupplierDropdown() {
  const sel = document.getElementById('med-supplier');
  sel.innerHTML = '<option value="">-- None --</option>' +
    suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
}

function openAddMedicine() {
  editingMedicineId = null;
  document.getElementById('medicine-modal-title').textContent = 'Add Medicine';
  ['med-name','med-generic','med-batch','med-expiry','med-qty','med-purchase-price','med-sell-price'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('med-category').value = 'Tablet';
  populateSupplierDropdown();
  document.getElementById('med-supplier').value = '';
  document.getElementById('modal-medicine').classList.add('open');
}

window.openEditMedicine = function(id) {
  const m = medicines.find(x => x.id === id);
  if (!m) return;
  editingMedicineId = id;
  document.getElementById('medicine-modal-title').textContent = 'Edit Medicine';
  document.getElementById('med-name').value = m.name;
  document.getElementById('med-generic').value = m.generic || '';
  document.getElementById('med-category').value = m.category || 'Tablet';
  document.getElementById('med-batch').value = m.batch;
  document.getElementById('med-expiry').value = m.expiry;
  document.getElementById('med-qty').value = m.qty;
  document.getElementById('med-purchase-price').value = m.purchasePrice;
  document.getElementById('med-sell-price').value = m.sellPrice;
  populateSupplierDropdown();
  document.getElementById('med-supplier').value = m.supplierId || '';
  document.getElementById('modal-medicine').classList.add('open');
};

window.deleteMedicine = function(id) {
  if (!confirm('Yo medicine delete garne?')) return;
  medicines = medicines.filter(m => m.id !== id);
  save();
  renderMedicineTable();
  showToast('Medicine delete bhayo');
};

document.getElementById('btn-add-medicine').addEventListener('click', openAddMedicine);
document.getElementById('btn-add-medicine-2').addEventListener('click', openAddMedicine);
document.getElementById('btn-cancel-medicine').addEventListener('click', () => {
  document.getElementById('modal-medicine').classList.remove('open');
});

document.getElementById('btn-save-medicine').addEventListener('click', () => {
  const name = document.getElementById('med-name').value.trim();
  const batch = document.getElementById('med-batch').value.trim();
  const expiry = document.getElementById('med-expiry').value;
  const qty = parseFloat(document.getElementById('med-qty').value);
  const purchasePrice = parseFloat(document.getElementById('med-purchase-price').value);
  const sellPrice = parseFloat(document.getElementById('med-sell-price').value);

  if (!name || !batch || !expiry || isNaN(qty) || isNaN(purchasePrice) || isNaN(sellPrice)) {
    showToast('Kripaya sabai required (*) field bharnu hos');
    return;
  }

  const data = {
    name, generic: document.getElementById('med-generic').value.trim(),
    category: document.getElementById('med-category').value,
    batch, expiry, qty, purchasePrice, sellPrice,
    supplierId: document.getElementById('med-supplier').value || null
  };

  if (editingMedicineId) {
    const idx = medicines.findIndex(m => m.id === editingMedicineId);
    medicines[idx] = { ...medicines[idx], ...data };
    showToast('Medicine update bhayo');
  } else {
    medicines.push({ id: uid(), ...data });
    purchases.push({
      id: uid(), date: new Date().toISOString(),
      medicineName: name, batch, qty, purchasePrice,
      supplierId: data.supplierId
    });
    showToast('Medicine thapiyo');
  }
  save();
  document.getElementById('modal-medicine').classList.remove('open');
  renderMedicineTable();
  renderPurchaseTable();
});

/* ============ SUPPLIERS ============ */
function renderSupplierTable() {
  const tbody = document.getElementById('supplier-tbody');
  if (!suppliers.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">Kunai supplier thapieko xaina</td></tr>`;
    return;
  }
  tbody.innerHTML = suppliers.map(s => `<tr>
    <td>${esc(s.name)}</td><td>${esc(s.phone || '-')}</td><td>${esc(s.address || '-')}</td>
    <td>${esc(s.pan || '-')}</td><td>${rs(s.due || 0)}</td>
    <td><button class="link-btn danger" onclick="deleteSupplier('${s.id}')">Delete</button></td>
  </tr>`).join('');
}

window.deleteSupplier = function(id) {
  if (!confirm('Supplier delete garne?')) return;
  suppliers = suppliers.filter(s => s.id !== id);
  save();
  renderSupplierTable();
};

document.getElementById('btn-add-supplier').addEventListener('click', () => {
  ['sup-name','sup-phone','sup-address','sup-pan'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('sup-due').value = 0;
  document.getElementById('modal-supplier').classList.add('open');
});
document.getElementById('btn-cancel-supplier').addEventListener('click', () => {
  document.getElementById('modal-supplier').classList.remove('open');
});
document.getElementById('btn-save-supplier').addEventListener('click', () => {
  const name = document.getElementById('sup-name').value.trim();
  if (!name) { showToast('Supplier naam chahiyo'); return; }
  suppliers.push({
    id: uid(), name,
    phone: document.getElementById('sup-phone').value.trim(),
    address: document.getElementById('sup-address').value.trim(),
    pan: document.getElementById('sup-pan').value.trim(),
    due: parseFloat(document.getElementById('sup-due').value) || 0
  });
  save();
  document.getElementById('modal-supplier').classList.remove('open');
  renderSupplierTable();
  showToast('Supplier thapiyo');
});

/* ============ PURCHASE ============ */
function renderPurchaseTable() {
  const tbody = document.getElementById('purchase-tbody');
  if (!purchases.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">Kunai purchase entry xaina</td></tr>`;
    return;
  }
  const rows = [...purchases].reverse().map(p => {
    const supplierName = suppliers.find(s => s.id === p.supplierId)?.name || '-';
    return `<tr>
      <td>${new Date(p.date).toLocaleDateString()}</td><td>${esc(p.medicineName)}</td>
      <td>${esc(p.batch)}</td><td>${p.qty}</td><td>${rs(p.purchasePrice)}</td><td>${esc(supplierName)}</td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('');
}

/* ============ BILLING ============ */
const billingSearch = document.getElementById('billing-search');
billingSearch.addEventListener('input', () => {
  const q = billingSearch.value.trim().toLowerCase();
  const resultsEl = document.getElementById('billing-search-results');
  if (!q) { resultsEl.innerHTML = ''; return; }
  const matches = medicines.filter(m => m.name.toLowerCase().includes(q) && m.qty > 0).slice(0, 10);
  resultsEl.innerHTML = matches.length ? matches.map(m =>
    `<div class="search-result-item" onclick="addToCart('${m.id}')">
      ${esc(m.name)} <span class="sr-meta">(Batch ${esc(m.batch)}, Stock: ${m.qty}, Rs.${m.sellPrice})</span>
    </div>`
  ).join('') : `<div class="search-result-item sr-meta">Kunai medicine fela parena (ya stock sakiyo)</div>`;
});

window.addToCart = function(medId) {
  const m = medicines.find(x => x.id === medId);
  if (!m) return;
  const existing = cart.find(c => c.medId === medId);
  if (existing) {
    if (existing.qty < m.qty) existing.qty++;
    else showToast('Stock bhanda dherai add garna milena');
  } else {
    cart.push({ medId, name: m.name, batch: m.batch, qty: 1, rate: m.sellPrice, maxQty: m.qty });
  }
  document.getElementById('billing-search').value = '';
  document.getElementById('billing-search-results').innerHTML = '';
  renderCart();
};

function renderCart() {
  const tbody = document.getElementById('cart-tbody');
  if (!cart.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;">Cart khali xa</td></tr>`;
  } else {
    tbody.innerHTML = cart.map((c, i) => `<tr>
      <td>${esc(c.name)}</td><td>${esc(c.batch)}</td>
      <td><input type="number" min="1" max="${c.maxQty}" value="${c.qty}" style="width:60px" onchange="updateCartQty(${i}, this.value)"></td>
      <td>${c.rate}</td><td>${rs(c.qty * c.rate)}</td>
      <td><button class="link-btn danger" onclick="removeFromCart(${i})">X</button></td>
    </tr>`).join('');
  }
  updateBillSummary();
}

window.updateCartQty = function(i, val) {
  let q = parseInt(val);
  if (isNaN(q) || q < 1) q = 1;
  if (q > cart[i].maxQty) { q = cart[i].maxQty; showToast('Stock ma yeti matra xa'); }
  cart[i].qty = q;
  renderCart();
};
window.removeFromCart = function(i) { cart.splice(i, 1); renderCart(); };

function updateBillSummary() {
  const subtotal = cart.reduce((s, c) => s + c.qty * c.rate, 0);
  const discount = parseFloat(document.getElementById('bill-discount').value) || 0;
  const taxable = Math.max(subtotal - discount, 0);
  const vat = taxable * 0.13;
  const total = taxable + vat;
  document.getElementById('bill-subtotal').textContent = rs(subtotal);
  document.getElementById('bill-vat').textContent = rs(vat);
  document.getElementById('bill-total').textContent = rs(total);
}
document.getElementById('bill-discount').addEventListener('input', updateBillSummary);

document.getElementById('btn-clear-cart').addEventListener('click', () => {
  cart = [];
  renderCart();
});

document.getElementById('btn-complete-sale').addEventListener('click', () => {
  if (!cart.length) { showToast('Cart khali xa'); return; }
  for (const c of cart) {
    const m = medicines.find(x => x.id === c.medId);
    if (!m || m.qty < c.qty) { showToast(`${c.name} ko stock sufficient xaina`); return; }
  }
  const subtotal = cart.reduce((s, c) => s + c.qty * c.rate, 0);
  const discount = parseFloat(document.getElementById('bill-discount').value) || 0;
  const taxable = Math.max(subtotal - discount, 0);
  const vat = taxable * 0.13;
  const total = taxable + vat;

  let profit = 0;
  cart.forEach(c => {
    const m = medicines.find(x => x.id === c.medId);
    m.qty -= c.qty;
    profit += (c.rate - m.purchasePrice) * c.qty;
  });

  const invoice = {
    id: uid(),
    invoiceNo: 'INV-' + (sales.length + 1001),
    date: new Date().toISOString(),
    customerName: document.getElementById('billing-customer-name').value.trim(),
    customerPhone: document.getElementById('billing-customer-phone').value.trim(),
    items: cart.map(c => ({ ...c })),
    subtotal, discount, vat, total, profit,
    paymentMode: document.getElementById('bill-payment-mode').value
  };
  sales.push(invoice);
  save();
  renderMedicineTable();
  showInvoice(invoice);

  cart = [];
  document.getElementById('billing-customer-name').value = '';
  document.getElementById('billing-customer-phone').value = '';
  document.getElementById('bill-discount').value = 0;
  renderCart();
});

function showInvoice(inv) {
  const area = document.getElementById('invoice-print-area');
  area.innerHTML = `
    <h3>${esc(settings.name)}</h3>
    <div class="inv-meta">${esc(settings.address || '')}<br>${settings.pan ? 'PAN: ' + esc(settings.pan) : ''}</div>
    <div class="inv-meta"><b>${esc(inv.invoiceNo)}</b> | ${new Date(inv.date).toLocaleString()}</div>
    ${inv.customerName ? `<div class="inv-meta">Customer: ${esc(inv.customerName)} ${inv.customerPhone ? '('+esc(inv.customerPhone)+')' : ''}</div>` : ''}
    <table>
      <thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amt</th></tr></thead>
      <tbody>${inv.items.map(i => `<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td>${i.rate}</td><td>${(i.qty*i.rate).toFixed(2)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="bill-row"><span>Subtotal</span><span>${rs(inv.subtotal)}</span></div>
    <div class="bill-row"><span>Discount</span><span>${rs(inv.discount)}</span></div>
    <div class="bill-row"><span>VAT (13%)</span><span>${rs(inv.vat)}</span></div>
    <div class="inv-total-row"><span>Total</span><span>${rs(inv.total)}</span></div>
    <div class="inv-meta" style="margin-top:10px;">Payment: ${inv.paymentMode}</div>
  `;
  document.getElementById('modal-invoice').classList.add('open');
}
document.getElementById('btn-close-invoice').addEventListener('click', () => {
  document.getElementById('modal-invoice').classList.remove('open');
});
document.getElementById('btn-print-invoice').addEventListener('click', () => window.print());

/* ============ REPORTS ============ */
document.querySelectorAll('.report-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.report-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('report-' + btn.dataset.tab).classList.add('active');
  });
});

function renderReports() {
  renderSalesReport();
  renderStockReport();
  renderExpiryReport();
}

function renderSalesReport() {
  const from = document.getElementById('sales-from').value;
  const to = document.getElementById('sales-to').value;
  let list = sales;
  if (from) list = list.filter(s => new Date(s.date) >= new Date(from));
  if (to) list = list.filter(s => new Date(s.date) <= new Date(to + 'T23:59:59'));

  const totalSales = list.reduce((s, x) => s + x.total, 0);
  const totalProfit = list.reduce((s, x) => s + x.profit, 0);
  document.getElementById('report-total-sales').textContent = rs(totalSales);
  document.getElementById('report-total-invoices').textContent = list.length;
  document.getElementById('report-total-profit').textContent = rs(totalProfit);

  const tbody = document.getElementById('sales-report-tbody');
  tbody.innerHTML = list.length ? [...list].reverse().map(s => `<tr>
    <td>${esc(s.invoiceNo)}</td><td>${new Date(s.date).toLocaleDateString()}</td>
    <td>${esc(s.customerName || '-')}</td><td>${s.items.length}</td>
    <td>${rs(s.total)}</td><td>${esc(s.paymentMode)}</td>
  </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;">Kunai sale xaina</td></tr>`;
}
document.getElementById('btn-filter-sales').addEventListener('click', renderSalesReport);

function renderStockReport() {
  const tbody = document.getElementById('stock-report-tbody');
  tbody.innerHTML = medicines.length ? medicines.map(m => `<tr>
    <td>${esc(m.name)}</td><td>${esc(m.batch)}</td><td>${m.qty}</td><td>${rs(m.qty * m.purchasePrice)}</td>
  </tr>`).join('') : `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">Stock xaina</td></tr>`;
}

function renderExpiryReport() {
  const tbody = document.getElementById('expiry-report-tbody');
  const list = [...medicines].sort((a,b) => daysUntil(a.expiry) - daysUntil(b.expiry));
  tbody.innerHTML = list.length ? list.map(m => {
    const d = daysUntil(m.expiry);
    return `<tr class="${d < 0 ? 'row-danger' : d <= settings.expiryDays ? 'row-warn' : ''}">
      <td>${esc(m.name)}</td><td>${esc(m.batch)}</td><td>${esc(m.expiry)}</td>
      <td>${d < 0 ? 'EXPIRED' : d}</td><td>${m.qty}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">Data xaina</td></tr>`;
}

/* ============ SETTINGS ============ */
function loadSettingsForm() {
  document.getElementById('set-name').value = settings.name || '';
  document.getElementById('set-address').value = settings.address || '';
  document.getElementById('set-dda').value = settings.dda || '';
  document.getElementById('set-pharmacist-reg').value = settings.pharmacistReg || '';
  document.getElementById('set-pan').value = settings.pan || '';
  document.getElementById('set-contact').value = settings.contact || '';
  document.getElementById('set-low-stock-threshold').value = settings.lowStockThreshold;
  document.getElementById('set-expiry-days').value = settings.expiryDays;
}

document.getElementById('btn-save-settings').addEventListener('click', () => {
  settings = {
    name: document.getElementById('set-name').value.trim() || 'Pharmacy',
    address: document.getElementById('set-address').value.trim(),
    dda: document.getElementById('set-dda').value.trim(),
    pharmacistReg: document.getElementById('set-pharmacist-reg').value.trim(),
    pan: document.getElementById('set-pan').value.trim(),
    contact: document.getElementById('set-contact').value.trim(),
    lowStockThreshold: parseFloat(document.getElementById('set-low-stock-threshold').value) || 10,
    expiryDays: parseFloat(document.getElementById('set-expiry-days').value) || 90
  };
  save();
  showToast('Settings save bhayo');
  renderDashboard();
});

/* ============ INIT ============ */
function seedDemoData() {
  if (medicines.length) return;
  const sup1 = { id: uid(), name: 'Nepal Pharma Distributors', phone: '9801234567', address: 'Bardibas', pan: '123456789', due: 5000 };
  suppliers.push(sup1);
  const today = new Date();
  const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); };
  medicines.push(
    { id: uid(), name: 'Paracetamol 500mg', generic: 'Paracetamol', category: 'Tablet', batch: 'PCM-22A', expiry: addDays(400), qty: 150, purchasePrice: 1.5, sellPrice: 2.5, supplierId: sup1.id },
    { id: uid(), name: 'Amoxicillin 500mg', generic: 'Amoxicillin', category: 'Capsule', batch: 'AMX-11', expiry: addDays(45), qty: 8, purchasePrice: 5, sellPrice: 8, supplierId: sup1.id },
    { id: uid(), name: 'Cough Syrup', generic: 'Dextromethorphan', category: 'Syrup', batch: 'CS-09', expiry: addDays(20), qty: 25, purchasePrice: 45, sellPrice: 65, supplierId: sup1.id }
  );
  save();
}

seedDemoData();
populateSupplierDropdown();
renderDashboard();
renderMedicineTable();
renderCart();
