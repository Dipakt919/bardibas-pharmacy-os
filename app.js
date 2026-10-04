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
  const map = new Map();
  medicines.forEach(m => {
    const k = m.name.trim().toLowerCase();
    const e = map.get(k) || { name: m.name, qty: 0, reorder: null };
    e.qty += m.qty;
    if (m.reorderLevel !== undefined && m.reorderLevel !== '' && m.reorderLevel !== null) e.reorder = Math.max(e.reorder ?? 0, +m.reorderLevel);
    map.set(k, e);
  });
  return [...map.values()].filter(e => e.qty <= (e.reorder ?? settings.lowStockThreshold));
}
function getNearExpiry() {
  return medicines.filter(m => m.qty > 0 && daysUntil(m.expiry) <= settings.expiryDays)
    .sort((a, b) => daysUntil(a.expiry) - daysUntil(b.expiry));
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
    `<div class="alert-item"><span>${esc(m.name)}</span><span>${m.qty} left</span></div>`
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
const $ = id => document.getElementById(id);
const val = id => $(id).value.trim();
const numVal = id => parseFloat($(id).value);
const openModal = id => $(id).classList.add('open');
const closeModal = id => $(id).classList.remove('open');
const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const mrpOf = m => (m.mrp ?? m.sellPrice);
const isVatable = m => !!m && m.vat === '13';
const todayISO = () => new Date().toISOString().slice(0, 10);

function genSku(name, cat) {
  const base = (name.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase() || 'MED') + '-' + (cat || 'OTH').slice(0, 3).toUpperCase();
  let i = medicines.length + 1, sku;
  do { sku = base + '-' + (1000 + i++); } while (medicines.some(m => (m.sku || '') === sku));
  return sku;
}

function catalogOf(m) {
  return { name: m.name, sku: m.sku || '', barcode: m.barcode || '', generic: m.generic || '',
    manufacturer: m.manufacturer || '', category: m.category || 'Tablet', unit: m.unit || 'Strip',
    drugClass: m.drugClass || 'C', vat: m.vat || 'exempt', reorderLevel: m.reorderLevel ?? '', rack: m.rack || '' };
}

function renderMedicineTable(filter = '') {
  const tbody = $('medicine-tbody');
  const f = filter.toLowerCase();
  const list = medicines.filter(m =>
    m.name.toLowerCase().includes(f) || (m.sku || '').toLowerCase().includes(f) ||
    (m.barcode || '').toLowerCase().includes(f) || (m.generic || '').toLowerCase().includes(f) ||
    (m.manufacturer || '').toLowerCase().includes(f)
  ).sort((a, b) => a.name.localeCompare(b.name) || a.expiry.localeCompare(b.expiry));
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;color:var(--text-muted);padding:24px;">Kunai medicine thapieko xaina</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(m => {
    const d = daysUntil(m.expiry);
    const rowClass = d < 0 ? 'row-danger' : d <= settings.expiryDays ? 'row-warn' : '';
    const supplierName = suppliers.find(s => s.id === m.supplierId)?.name || '-';
    return `<tr class="${rowClass}">
      <td>${esc(m.name)}${m.unit ? ` <small>(${esc(m.unit)})</small>` : ''}</td>
      <td>${esc(m.sku || '-')}</td><td>${esc(m.barcode || '-')}</td><td>${esc(m.generic || '-')}</td>
      <td>${esc(m.batch)}</td><td>${esc(m.expiry)}</td><td>${m.qty}</td>
      <td>${m.purchasePrice}</td><td>${mrpOf(m)}</td><td>${m.sellPrice}</td><td>${esc(supplierName)}</td>
      <td>
        <button class="link-btn" onclick="openEditMedicine('${m.id}')">Edit</button>
        <button class="link-btn danger" onclick="deleteMedicine('${m.id}')">Delete</button>
      </td></tr>`;
  }).join('');
}
$('medicine-search').addEventListener('input', e => renderMedicineTable(e.target.value));

function populateSupplierDropdown() {
  ['med-supplier', 'pur-supplier'].forEach(id => {
    const sel = $(id); if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">-- None --</option>' + suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    sel.value = cur;
  });
}

function getDistinctProducts() {
  const map = new Map();
  medicines.forEach(m => map.set(m.name.trim().toLowerCase(), m));
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function updateMargin() {
  const p = numVal('med-purchase-price'), s = numVal('med-sell-price'), mrp = numVal('med-mrp');
  const el = $('med-margin');
  if (isNaN(p) || isNaN(s) || s <= 0) { el.textContent = ''; return; }
  const margin = s - p, pct = p > 0 ? (margin / p * 100).toFixed(1) + '% markup' : '';
  let msg = `Profit per unit: Rs. ${margin.toFixed(2)} ${pct ? '(' + pct + ')' : ''}`;
  let color = margin < 0 ? 'var(--red)' : 'var(--accent)';
  if (!isNaN(mrp) && s > mrp) { msg = 'Selling price MRP bhanda badhi hunu hudaina'; color = 'var(--red)'; }
  el.textContent = msg; el.style.color = color;
}
['med-purchase-price', 'med-sell-price', 'med-mrp'].forEach(id => $(id).addEventListener('input', updateMargin));
$('med-mrp').addEventListener('change', () => { if (!$('med-sell-price').value) { $('med-sell-price').value = $('med-mrp').value; updateMargin(); } });

function fillMedicineForm(m) {
  $('med-name').value = m.name || '';
  $('med-generic').value = m.generic || '';
  $('med-manufacturer').value = m.manufacturer || '';
  $('med-category').value = m.category || 'Tablet';
  $('med-unit').value = m.unit || 'Strip';
  $('med-sku').value = m.sku || '';
  $('med-barcode').value = m.barcode || '';
  $('med-class').value = m.drugClass || 'C';
  $('med-vat').value = m.vat || 'exempt';
  $('med-reorder').value = m.reorderLevel ?? '';
  $('med-rack').value = m.rack || '';
  $('med-mrp').value = m.mrp ?? m.sellPrice ?? '';
  $('med-batch').value = m.batch || '';
  $('med-expiry').value = m.expiry || '';
  $('med-qty').value = m.qty ?? '';
  $('med-purchase-price').value = m.purchasePrice ?? '';
  $('med-sell-price').value = m.sellPrice ?? '';
  populateSupplierDropdown();
  $('med-supplier').value = m.supplierId || '';
  updateMargin();
}

function openAddMedicine() {
  editingMedicineId = null;
  $('medicine-modal-title').textContent = 'Add New Product';
  fillMedicineForm({ category: 'Tablet', unit: 'Strip', drugClass: 'C', vat: 'exempt' });
  $('med-expiry').min = todayISO();
  openModal('modal-medicine');
}

window.openEditMedicine = function (id) {
  const m = medicines.find(x => x.id === id);
  if (!m) return;
  editingMedicineId = id;
  $('medicine-modal-title').textContent = 'Edit Medicine / Batch';
  $('med-expiry').min = '';
  fillMedicineForm(m);
  openModal('modal-medicine');
};

window.deleteMedicine = function (id) {
  const m = medicines.find(x => x.id === id);
  if (!m || !confirm(`"${m.name}" (Batch ${m.batch}) delete garne?`)) return;
  medicines = medicines.filter(x => x.id !== id);
  save();
  renderMedicineTable($('medicine-search').value);
  showToast('Medicine delete bhayo');
};

$('btn-add-medicine').addEventListener('click', openAddMedicine);
$('btn-cancel-medicine').addEventListener('click', () => closeModal('modal-medicine'));

$('btn-save-medicine').addEventListener('click', () => {
  const name = val('med-name'), batch = val('med-batch'), expiry = $('med-expiry').value;
  const qty = numVal('med-qty'), purchasePrice = numVal('med-purchase-price');
  const sellPrice = numVal('med-sell-price'), mrp = numVal('med-mrp');
  if (!name || !batch || !expiry || [qty, purchasePrice, sellPrice, mrp].some(isNaN)) {
    showToast('Kripaya sabai required (*) field bharnu hos'); return;
  }
  if (qty < 0 || purchasePrice < 0 || sellPrice <= 0 || mrp <= 0) { showToast('Qty / price galat xa'); return; }
  if (sellPrice > mrp) { showToast('Selling price MRP bhanda badhi hunu hudaina'); return; }
  if (!editingMedicineId && daysUntil(expiry) < 0) { showToast('Expire bhaisakeko medicine thapna milena'); return; }

  const barcode = val('med-barcode');
  let sku = val('med-sku');
  const category = $('med-category').value;
  const others = medicines.filter(m => m.id !== editingMedicineId && !sameName(m.name, name));
  if (barcode && others.some(m => m.barcode === barcode)) { showToast('Yo barcode arko product ma pahile nai xa'); return; }
  if (sku && others.some(m => (m.sku || '').toLowerCase() === sku.toLowerCase())) { showToast('Yo SKU arko product ma pahile nai xa'); return; }
  if (medicines.some(m => m.id !== editingMedicineId && sameName(m.name, name) && sameName(m.batch, batch))) {
    showToast('Yo product ko yo batch pahile nai xa'); return;
  }
  if (!editingMedicineId && medicines.some(m => sameName(m.name, name))) {
    showToast('Yo product pahile nai xa — "Purchase" bata naya batch thapnu hos'); return;
  }
  if (purchasePrice > sellPrice && !confirm('Purchase price selling price bhanda badhi xa (nokshan). Tara pani save garne?')) return;
  if (!sku) sku = genSku(name, category);

  const re = $('med-reorder').value;
  const catalog = {
    name, sku, barcode, generic: val('med-generic'), manufacturer: val('med-manufacturer'), category,
    unit: $('med-unit').value, drugClass: $('med-class').value, vat: $('med-vat').value,
    reorderLevel: re === '' ? '' : parseFloat(re), rack: val('med-rack')
  };
  const batchData = { batch, expiry, qty, purchasePrice, mrp, sellPrice, supplierId: $('med-supplier').value || null };

  if (editingMedicineId) {
    const idx = medicines.findIndex(m => m.id === editingMedicineId);
    const oldName = medicines[idx].name;
    medicines[idx] = { ...medicines[idx], ...catalog, ...batchData };
    // product-level info is shared by all batches of the same product
    medicines.forEach(m => { if (m.id !== editingMedicineId && sameName(m.name, oldName)) Object.assign(m, catalog); });
    showToast('Medicine update bhayo');
  } else {
    medicines.push({ id: uid(), ...catalog, ...batchData });
    if (qty > 0) purchases.push({
      id: uid(), date: new Date().toISOString(), invoiceNo: '', medicineName: name, batch, expiry, qty, freeQty: 0,
      rate: purchasePrice, discount: 0, purchasePrice, mrp, amount: qty * purchasePrice, supplierId: batchData.supplierId, payment: 'Opening'
    });
    showToast('Product thapiyo');
  }
  save();
  closeModal('modal-medicine');
  renderMedicineTable($('medicine-search').value);
  renderPurchaseTable();
});

/* ============ NEW PURCHASE (multi-item supplier bill) ============ */
function purLineHtml() {
  const opts = '<option value="">-- Select --</option>' + getDistinctProducts().map(m => `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('');
  return `<tr class="pur-line">
    <td><select class="pl-product">${opts}</select></td>
    <td><input class="pl-batch" type="text" style="width:90px"></td>
    <td><input class="pl-expiry" type="date" min="${todayISO()}" style="width:140px"></td>
    <td><input class="pl-qty" type="number" min="1" style="width:70px"></td>
    <td><input class="pl-free" type="number" min="0" value="0" style="width:60px"></td>
    <td><input class="pl-rate" type="number" min="0" step="0.01" style="width:80px"></td>
    <td><input class="pl-disc" type="number" min="0" max="100" step="0.01" value="0" style="width:60px"></td>
    <td><input class="pl-mrp" type="number" min="0" step="0.01" style="width:80px"></td>
    <td><input class="pl-sell" type="number" min="0" step="0.01" style="width:80px"></td>
    <td class="pl-amt">Rs. 0</td>
    <td><button type="button" class="link-btn danger pl-remove">X</button></td></tr>`;
}

function addPurLine() { $('pur-lines-tbody').insertAdjacentHTML('beforeend', purLineHtml()); }

function purLineAmount(tr) {
  const q = parseFloat(tr.querySelector('.pl-qty').value) || 0;
  const r = parseFloat(tr.querySelector('.pl-rate').value) || 0;
  const d = parseFloat(tr.querySelector('.pl-disc').value) || 0;
  return q * r * (1 - d / 100);
}

function updatePurTotals() {
  let total = 0;
  document.querySelectorAll('#pur-lines-tbody tr').forEach(tr => {
    const a = purLineAmount(tr); total += a;
    tr.querySelector('.pl-amt').textContent = rs(a);
  });
  $('pur-total').textContent = rs(total);
  const credit = $('pur-payment').value === 'Credit';
  $('pur-paid-wrap').style.display = credit ? 'block' : 'none';
  if (credit) $('pur-due').textContent = 'Baaki (supplier due): ' + rs(Math.max(total - (parseFloat($('pur-paid').value) || 0), 0));
  return total;
}

$('pur-lines-tbody').addEventListener('input', updatePurTotals);
$('pur-lines-tbody').addEventListener('change', e => {
  if (!e.target.classList.contains('pl-product')) return;
  const tr = e.target.closest('tr');
  const batches = medicines.filter(m => sameName(m.name, e.target.value));
  const ref = batches[batches.length - 1];
  if (ref) {
    tr.querySelector('.pl-mrp').value = mrpOf(ref);
    tr.querySelector('.pl-sell').value = ref.sellPrice;
    tr.querySelector('.pl-rate').value = ref.purchasePrice;
    if (!$('pur-supplier').value && ref.supplierId) $('pur-supplier').value = ref.supplierId;
  }
  updatePurTotals();
});
$('pur-lines-tbody').addEventListener('click', e => {
  if (!e.target.classList.contains('pl-remove')) return;
  if (document.querySelectorAll('#pur-lines-tbody tr').length > 1) e.target.closest('tr').remove();
  else { $('pur-lines-tbody').innerHTML = ''; addPurLine(); }
  updatePurTotals();
});
$('btn-add-pur-line').addEventListener('click', addPurLine);
$('pur-payment').addEventListener('change', updatePurTotals);
$('pur-paid').addEventListener('input', updatePurTotals);

$('btn-new-purchase').addEventListener('click', () => {
  if (!getDistinctProducts().length) { showToast('Pahile Medicines page bata product thapnu hos'); return; }
  populateSupplierDropdown();
  $('pur-supplier').value = '';
  $('pur-invoice-no').value = '';
  $('pur-date').value = todayISO();
  $('pur-payment').value = 'Cash';
  $('pur-paid').value = '';
  $('pur-lines-tbody').innerHTML = '';
  addPurLine();
  updatePurTotals();
  openModal('modal-purchase');
});
$('btn-cancel-purchase').addEventListener('click', () => closeModal('modal-purchase'));

$('btn-save-purchase').addEventListener('click', () => {
  const supplierId = $('pur-supplier').value || null;
  const invoiceNo = val('pur-invoice-no');
  const payment = $('pur-payment').value;
  const dateVal = $('pur-date').value || todayISO();
  if (payment === 'Credit' && !supplierId) { showToast('Credit purchase ko lagi supplier select garnu hos'); return; }

  const items = [];
  const rows = [...document.querySelectorAll('#pur-lines-tbody tr')];
  for (let i = 0; i < rows.length; i++) {
    const tr = rows[i], g = c => tr.querySelector(c).value.trim();
    if (!g('.pl-product') && !g('.pl-batch') && !g('.pl-qty')) continue;
    const label = 'Line ' + (i + 1) + ': ';
    const ref = medicines.find(m => sameName(m.name, g('.pl-product')));
    const batch = g('.pl-batch'), expiry = g('.pl-expiry');
    const qty = parseInt(g('.pl-qty')), free = parseInt(g('.pl-free')) || 0;
    const rate = parseFloat(g('.pl-rate')), disc = parseFloat(g('.pl-disc')) || 0;
    const mrp = parseFloat(g('.pl-mrp')), sell = parseFloat(g('.pl-sell'));
    if (!ref || !batch || !expiry || isNaN(qty) || isNaN(rate) || isNaN(mrp) || isNaN(sell)) { showToast(label + 'sabai required (*) field bharnu hos'); return; }
    if (qty < 1 || free < 0 || rate < 0 || disc < 0 || disc > 100 || mrp <= 0 || sell <= 0) { showToast(label + 'qty / price galat xa'); return; }
    if (sell > mrp) { showToast(label + 'Selling price MRP bhanda badhi hunu hudaina'); return; }
    if (daysUntil(expiry) < 0) { showToast(label + 'Expire bhaisakeko medicine receive garna milena'); return; }
    const exist = medicines.find(m => sameName(m.name, ref.name) && sameName(m.batch, batch));
    if (exist && exist.expiry !== expiry) { showToast(label + 'Yo batch ko expiry ' + exist.expiry + ' xa, milena'); return; }
    if (items.some(it => sameName(it.ref.name, ref.name) && sameName(it.batch, batch))) { showToast(label + 'Same batch duplicate xa'); return; }
    const amount = qty * rate * (1 - disc / 100);
    const totalQty = qty + free;
    items.push({ ref, batch, expiry, qty, free, totalQty, rate, disc, mrp, sell, amount, cost: Math.round(amount / totalQty * 100) / 100 });
  }
  if (!items.length) { showToast('Kam se kam ek item thapnu hos'); return; }

  const total = items.reduce((s, it) => s + it.amount, 0);
  const iso = new Date(dateVal + 'T12:00:00').toISOString();
  items.forEach(it => {
    const b = medicines.find(m => sameName(m.name, it.ref.name) && sameName(m.batch, it.batch));
    if (b) { b.qty += it.totalQty; b.purchasePrice = it.cost; b.mrp = it.mrp; b.sellPrice = it.sell; if (supplierId) b.supplierId = supplierId; }
    else medicines.push({ id: uid(), ...catalogOf(it.ref), batch: it.batch, expiry: it.expiry, qty: it.totalQty,
      purchasePrice: it.cost, mrp: it.mrp, sellPrice: it.sell, supplierId });
    purchases.push({ id: uid(), date: iso, invoiceNo, medicineName: it.ref.name, batch: it.batch, expiry: it.expiry,
      qty: it.totalQty, freeQty: it.free, rate: it.rate, discount: it.disc, purchasePrice: it.cost, mrp: it.mrp,
      amount: it.amount, supplierId, payment });
  });
  if (payment === 'Credit') {
    const paid = Math.min(parseFloat($('pur-paid').value) || 0, total);
    const sup = suppliers.find(s => s.id === supplierId);
    if (sup) sup.due = (sup.due || 0) + (total - paid);
  }
  save();
  closeModal('modal-purchase');
  renderMedicineTable($('medicine-search').value);
  renderPurchaseTable();
  showToast(`Purchase save bhayo (${items.length} item), stock update bhayo`);
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
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:24px;">Kunai purchase entry xaina</td></tr>`;
    return;
  }
  tbody.innerHTML = [...purchases].reverse().map(p => {
    const supplierName = suppliers.find(s => s.id === p.supplierId)?.name || '-';
    const amount = p.amount ?? (p.qty * p.purchasePrice);
    return `<tr>
      <td>${new Date(p.date).toLocaleDateString()}</td><td>${esc(p.invoiceNo || '-')}</td><td>${esc(p.medicineName)}</td>
      <td>${esc(p.batch)}</td><td>${p.qty}${p.freeQty ? ` <small>(+${p.freeQty} free)</small>` : ''}</td>
      <td>${rs(p.rate ?? p.purchasePrice)}</td><td>${rs(amount)}</td><td>${esc(supplierName)}</td><td>${esc(p.payment || '-')}</td>
    </tr>`;
  }).join('');
}

/* ============ BILLING ============ */
const billingSearch = document.getElementById('billing-search');

function sellableBatches(q) {
  q = q.toLowerCase();
  return medicines.filter(m => m.qty > 0 && daysUntil(m.expiry) >= 0 &&
    (m.name.toLowerCase().includes(q) || (m.sku || '').toLowerCase().includes(q) ||
     (m.barcode || '').toLowerCase().includes(q) || (m.generic || '').toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name) || a.expiry.localeCompare(b.expiry)); // FEFO: earliest expiry first
}

billingSearch.addEventListener('input', () => {
  const q = billingSearch.value.trim();
  const resultsEl = document.getElementById('billing-search-results');
  if (!q) { resultsEl.innerHTML = ''; return; }
  const matches = sellableBatches(q).slice(0, 10);
  resultsEl.innerHTML = matches.length ? matches.map(m =>
    `<div class="search-result-item" onclick="addToCart('${m.id}')">
      ${esc(m.name)} <span class="sr-meta">(Batch ${esc(m.batch)}, Exp ${esc(m.expiry)}, Stock: ${m.qty}, Rs.${m.sellPrice}${daysUntil(m.expiry) <= settings.expiryDays ? ' ⚠ near expiry' : ''})</span>
    </div>`).join('') : `<div class="search-result-item sr-meta">Kunai medicine fela parena (ya stock sakiyo / expire bhayo)</div>`;
});
// Barcode scanner / Enter: exact barcode or SKU match goes straight to cart, otherwise first (earliest-expiry) result
billingSearch.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const q = billingSearch.value.trim();
  if (!q) return;
  const list = sellableBatches(q);
  const exact = list.find(m => m.barcode === q || (m.sku || '').toLowerCase() === q.toLowerCase());
  const pick = exact || list[0];
  if (pick) addToCart(pick.id); else showToast('Medicine fela parena');
});

window.addToCart = function (medId) {
  const m = medicines.find(x => x.id === medId);
  if (!m) return;
  if (daysUntil(m.expiry) < 0) { showToast('Expire bhaisakeko medicine bechna milena'); return; }
  const existing = cart.find(c => c.medId === medId);
  if (existing) {
    if (existing.qty < m.qty) existing.qty++; else showToast('Stock bhanda dherai add garna milena');
  } else {
    cart.push({ medId, name: m.name, batch: m.batch, expiry: m.expiry, qty: 1, rate: m.sellPrice, maxQty: m.qty, vatable: isVatable(m) });
  }
  billingSearch.value = '';
  document.getElementById('billing-search-results').innerHTML = '';
  renderCart();
};

function renderCart() {
  const tbody = document.getElementById('cart-tbody');
  tbody.innerHTML = cart.length ? cart.map((c, i) => `<tr>
      <td>${esc(c.name)}</td><td>${esc(c.batch)}</td>
      <td><input type="number" min="1" max="${c.maxQty}" value="${c.qty}" style="width:60px" onchange="updateCartQty(${i}, this.value)"></td>
      <td>${c.rate}</td><td>${rs(c.qty * c.rate)}</td>
      <td><button class="link-btn danger" onclick="removeFromCart(${i})">X</button></td>
    </tr>`).join('')
    : `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;">Cart khali xa</td></tr>`;
  updateBillSummary();
}

window.updateCartQty = function (i, val) {
  let q = parseInt(val);
  if (isNaN(q) || q < 1) q = 1;
  if (q > cart[i].maxQty) { q = cart[i].maxQty; showToast('Stock ma yeti matra xa'); }
  cart[i].qty = q;
  renderCart();
};
window.removeFromCart = function (i) { cart.splice(i, 1); renderCart(); };

// Nepal: MRP already includes VAT, so VAT is extracted (13/113) from VAT-applicable items only.
function calcBill() {
  const subtotal = cart.reduce((s, c) => s + c.qty * c.rate, 0);
  const discount = Math.min(Math.max(parseFloat(document.getElementById('bill-discount').value) || 0, 0), subtotal);
  const vatGross = cart.filter(c => c.vatable).reduce((s, c) => s + c.qty * c.rate, 0);
  const vatAfterDisc = subtotal ? vatGross - discount * vatGross / subtotal : 0;
  const vat = vatAfterDisc * 13 / 113;
  return { subtotal, discount, vat, total: subtotal - discount };
}

function updateBillSummary() {
  const b = calcBill();
  document.getElementById('bill-subtotal').textContent = rs(b.subtotal);
  document.getElementById('bill-vat').textContent = rs(b.vat);
  document.getElementById('bill-total').textContent = rs(b.total);
}
document.getElementById('bill-discount').addEventListener('input', updateBillSummary);
document.getElementById('btn-clear-cart').addEventListener('click', () => { cart = []; renderCart(); });

document.getElementById('btn-complete-sale').addEventListener('click', () => {
  if (!cart.length) { showToast('Cart khali xa'); return; }
  const mode = document.getElementById('bill-payment-mode').value;
  const customerName = document.getElementById('billing-customer-name').value.trim();
  if (mode === 'Credit' && !customerName) { showToast('Udharo ko lagi customer ko naam chahiyo'); return; }
  for (const c of cart) {
    const m = medicines.find(x => x.id === c.medId);
    if (!m || m.qty < c.qty) { showToast(`${c.name} ko stock sufficient xaina`); return; }
    if (daysUntil(m.expiry) < 0) { showToast(`${c.name} expire bhaisakyo, bechna milena`); return; }
  }
  const b = calcBill();
  let cost = 0;
  cart.forEach(c => {
    const m = medicines.find(x => x.id === c.medId);
    m.qty -= c.qty;
    cost += m.purchasePrice * c.qty;
  });
  const invoice = {
    id: uid(), invoiceNo: 'INV-' + (sales.length + 1001), date: new Date().toISOString(),
    customerName, customerPhone: document.getElementById('billing-customer-phone').value.trim(),
    items: cart.map(c => ({ ...c })),
    subtotal: b.subtotal, discount: b.discount, vat: b.vat, total: b.total,
    profit: b.total - b.vat - cost, paymentMode: mode
  };
  sales.push(invoice);
  save();
  renderMedicineTable($('medicine-search').value);
  showInvoice(invoice);
  cart = [];
  document.getElementById('billing-customer-name').value = '';
  document.getElementById('billing-customer-phone').value = '';
  document.getElementById('bill-discount').value = 0;
  renderCart();
});

function showInvoice(inv) {
  document.getElementById('invoice-print-area').innerHTML = `
    <h3>${esc(settings.name)}</h3>
    <div class="inv-meta">${esc(settings.address || '')}${settings.contact ? ' | ' + esc(settings.contact) : ''}<br>${settings.pan ? 'PAN: ' + esc(settings.pan) : ''}${settings.dda ? ' | DDA: ' + esc(settings.dda) : ''}</div>
    <div class="inv-meta"><b>${esc(inv.invoiceNo)}</b> | ${new Date(inv.date).toLocaleString()}</div>
    ${inv.customerName ? `<div class="inv-meta">Customer: ${esc(inv.customerName)} ${inv.customerPhone ? '(' + esc(inv.customerPhone) + ')' : ''}</div>` : ''}
    <table>
      <thead><tr><th>Item</th><th>Batch/Exp</th><th>Qty</th><th>Rate</th><th>Amt</th></tr></thead>
      <tbody>${inv.items.map(i => `<tr><td>${esc(i.name)}</td><td>${esc(i.batch)}<br><small>${esc(i.expiry || '')}</small></td><td>${i.qty}</td><td>${i.rate}</td><td>${(i.qty * i.rate).toFixed(2)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="bill-row"><span>Subtotal</span><span>${rs(inv.subtotal)}</span></div>
    <div class="bill-row"><span>Discount</span><span>${rs(inv.discount)}</span></div>
    <div class="bill-row"><span>VAT 13% (included)</span><span>${rs(inv.vat)}</span></div>
    <div class="inv-total-row"><span>Total</span><span>${rs(inv.total)}</span></div>
    <div class="inv-meta" style="margin-top:10px;">Payment: ${esc(inv.paymentMode)}</div>`;
  document.getElementById('modal-invoice').classList.add('open');
}
document.getElementById('btn-close-invoice').addEventListener('click', () => document.getElementById('modal-invoice').classList.remove('open'));
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
    { id: uid(), name: 'Paracetamol 500mg', generic: 'Paracetamol', category: 'Tablet', batch: 'PCM-22A', expiry: addDays(400), qty: 150, purchasePrice: 1.5, sellPrice: 2.5, mrp: 2.5, vat: 'exempt', unit: 'Strip', supplierId: sup1.id },
    { id: uid(), name: 'Amoxicillin 500mg', generic: 'Amoxicillin', category: 'Capsule', batch: 'AMX-11', expiry: addDays(45), qty: 8, purchasePrice: 5, sellPrice: 8, mrp: 8, vat: 'exempt', unit: 'Capsule', supplierId: sup1.id },
    { id: uid(), name: 'Cough Syrup', generic: 'Dextromethorphan', category: 'Syrup', batch: 'CS-09', expiry: addDays(20), qty: 25, purchasePrice: 45, sellPrice: 65, mrp: 65, vat: 'exempt', unit: 'Bottle', supplierId: sup1.id }
  );
  save();
}

seedDemoData();
populateSupplierDropdown();
renderDashboard();
renderMedicineTable();
renderCart();
