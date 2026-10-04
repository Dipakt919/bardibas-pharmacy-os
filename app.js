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
let salesDrafts = DB.get('salesDrafts', []);
let purchaseDrafts = DB.get('purchaseDrafts', []);
let activityLog = DB.get('activityLog', []);

function save() {
  DB.set('medicines', medicines);
  DB.set('suppliers', suppliers);
  DB.set('sales', sales);
  DB.set('purchases', purchases);
  DB.set('settings', settings);
  DB.set('salesDrafts', salesDrafts);
  DB.set('purchaseDrafts', purchaseDrafts);
  DB.set('activityLog', activityLog);
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
    .reduce((sum, s) => sum + saleNet(s), 0);
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
const todayISO = () => localISO(new Date());

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

let editingBillId = null, resumingPurDraftId = null;

function collectPurForm() {
  return { supplierId: $('pur-supplier').value, invoiceNo: val('pur-invoice-no'), date: $('pur-date').value,
    payment: $('pur-payment').value, paid: $('pur-paid').value,
    lines: [...document.querySelectorAll('#pur-lines-tbody tr')].map(tr => {
      const g = c => tr.querySelector(c).value;
      return { product: g('.pl-product'), batch: g('.pl-batch'), expiry: g('.pl-expiry'), qty: g('.pl-qty'), free: g('.pl-free'),
        rate: g('.pl-rate'), disc: g('.pl-disc'), mrp: g('.pl-mrp'), sell: g('.pl-sell') };
    }) };
}

function openPurchaseModal(p) {
  p = p || {};
  populateSupplierDropdown();
  $('pur-supplier').value = p.supplierId || '';
  $('pur-invoice-no').value = p.invoiceNo || '';
  $('pur-date').value = p.date || todayISO();
  $('pur-payment').value = p.payment || 'Cash';
  $('pur-paid').value = p.paid ?? '';
  $('pur-lines-tbody').innerHTML = '';
  (p.lines && p.lines.length ? p.lines : [{}]).forEach(l => {
    addPurLine();
    const tr = $('pur-lines-tbody').lastElementChild, s = (c, v) => { tr.querySelector(c).value = v ?? ''; };
    s('.pl-product', l.product); s('.pl-batch', l.batch); s('.pl-expiry', l.expiry); s('.pl-qty', l.qty);
    s('.pl-free', l.free ?? 0); s('.pl-rate', l.rate); s('.pl-disc', l.disc ?? 0); s('.pl-mrp', l.mrp); s('.pl-sell', l.sell);
  });
  $('pur-modal-title').textContent = editingBillId ? 'Edit Purchase Bill' : 'New Purchase (Supplier Bill)';
  updatePurTotals();
  openModal('modal-purchase');
}

$('btn-new-purchase').addEventListener('click', () => {
  if (!getDistinctProducts().length) { showToast('Pahile Medicines page bata product thapnu hos'); return; }
  editingBillId = null; resumingPurDraftId = null;
  openPurchaseModal();
});
$('btn-cancel-purchase').addEventListener('click', () => { closeModal('modal-purchase'); editingBillId = null; });

$('btn-save-pur-draft').addEventListener('click', () => {
  const f = collectPurForm();
  if (!f.lines.some(l => l.product || l.batch || l.qty) && !f.invoiceNo) { showToast('Draft ma kei data chaina'); return; }
  const d = { id: resumingPurDraftId || uid(), saved: new Date().toISOString(), ...f };
  const i = purchaseDrafts.findIndex(x => x.id === d.id);
  if (i >= 0) purchaseDrafts[i] = d; else purchaseDrafts.push(d);
  save(); updateDraftCounts();
  closeModal('modal-purchase'); editingBillId = null; resumingPurDraftId = null;
  showToast('Purchase draft save bhayo');
});

// Undo a bill's effect on stock. Returns an error string if stock was already sold, else null.
function reverseBill(bill, dryRun) {
  const need = new Map();
  bill.lines.forEach(l => { const k = l.medicineName.toLowerCase() + '|' + String(l.batch).toLowerCase(); need.set(k, { l, q: (need.get(k)?.q || 0) + l.qty }); });
  for (const { l, q } of need.values()) {
    const b = medicines.find(m => sameName(m.name, l.medicineName) && sameName(m.batch, l.batch));
    if (b && b.qty < q) return `${l.medicineName} (batch ${l.batch}) ko stock ${b.qty} matra xa, ${q} ghatauna milena (pahile nai bikri bhaisakyo)`;
  }
  if (dryRun) return null;
  bill.lines.forEach(l => {
    const b = medicines.find(m => sameName(m.name, l.medicineName) && sameName(m.batch, l.batch));
    if (b) b.qty -= l.qty;
  });
  const sup = suppliers.find(s => s.id === bill.supplierId);
  if (sup && bill.dueAdded) sup.due = Math.max((sup.due || 0) - bill.dueAdded, 0);
  return null;
}

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
    if (exist && exist.expiry !== expiry && !editingBillId) { showToast(label + 'Yo batch ko expiry ' + exist.expiry + ' xa, milena'); return; }
    if (items.some(it => sameName(it.ref.name, ref.name) && sameName(it.batch, batch))) { showToast(label + 'Same batch duplicate xa'); return; }
    const amount = qty * rate * (1 - disc / 100), totalQty = qty + free;
    items.push({ ref, batch, expiry, qty, free, totalQty, rate, disc, mrp, sell, amount, cost: Math.round(amount / totalQty * 100) / 100 });
  }
  if (!items.length) { showToast('Kam se kam ek item thapnu hos'); return; }

  if (editingBillId) {
    const old = purchaseBills().find(b => b.id === editingBillId);
    if (old) {
      const err = reverseBill(old, true);
      if (err) { showToast(err); return; }
      reverseBill(old, false);
      purchases = purchases.filter(p => (p.billId || p.id) !== editingBillId);
    }
  }
  const billId = editingBillId || uid();
  const total = items.reduce((s, it) => s + it.amount, 0);
  const paid = payment === 'Credit' ? Math.min(parseFloat($('pur-paid').value) || 0, total) : total;
  const dueAdded = payment === 'Credit' ? total - paid : 0;
  const iso = new Date(dateVal + 'T12:00:00').toISOString();
  items.forEach(it => {
    const b = medicines.find(m => sameName(m.name, it.ref.name) && sameName(m.batch, it.batch));
    if (b) { b.qty += it.totalQty; b.expiry = it.expiry; b.purchasePrice = it.cost; b.mrp = it.mrp; b.sellPrice = it.sell; if (supplierId) b.supplierId = supplierId; }
    else medicines.push({ id: uid(), ...catalogOf(it.ref), batch: it.batch, expiry: it.expiry, qty: it.totalQty,
      purchasePrice: it.cost, mrp: it.mrp, sellPrice: it.sell, supplierId });
    purchases.push({ id: uid(), billId, date: iso, invoiceNo, medicineName: it.ref.name, batch: it.batch, expiry: it.expiry,
      qty: it.totalQty, freeQty: it.free, rate: it.rate, discount: it.disc, purchasePrice: it.cost, mrp: it.mrp, sell: it.sell,
      amount: it.amount, supplierId, payment, paid, dueAdded });
  });
  const sup = suppliers.find(s => s.id === supplierId);
  if (sup && dueAdded) sup.due = (sup.due || 0) + dueAdded;
  logAct((editingBillId ? 'Purchase edit: ' : 'Purchase: ') + (invoiceNo || 'no-invoice') + ' (' + items.length + ' item, ' + rs(total) + ')');
  if (resumingPurDraftId) { purchaseDrafts = purchaseDrafts.filter(d => d.id !== resumingPurDraftId); resumingPurDraftId = null; }
  const wasEdit = !!editingBillId;
  editingBillId = null;
  save(); updateDraftCounts();
  closeModal('modal-purchase');
  renderMedicineTable($('medicine-search').value);
  renderPurchaseTable();
  showToast(wasEdit ? 'Purchase bill update bhayo' : `Purchase save bhayo (${items.length} item), stock update bhayo`);
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

/* ============ PURCHASE REGISTER (bills: view / edit / delete / drafts) ============ */
function purchaseBills() {
  const map = new Map();
  purchases.forEach(p => {
    const k = p.billId || p.id;
    if (!map.has(k)) map.set(k, { id: k, date: p.date, invoiceNo: p.invoiceNo || '', supplierId: p.supplierId, payment: p.payment || '-', dueAdded: p.dueAdded || 0, paid: p.paid, lines: [] });
    map.get(k).lines.push(p);
  });
  return [...map.values()].map(b => ({ ...b, total: b.lines.reduce((s, l) => s + (l.amount ?? l.qty * l.purchasePrice), 0) }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}
const supName = id => suppliers.find(s => s.id === id)?.name || '-';
function inRange(iso, from, to) {
  const d = new Date(iso);
  if (from && d < new Date(from + 'T00:00:00')) return false;
  if (to && d > new Date(to + 'T23:59:59')) return false;
  return true;
}
function fillSupplierFilters() {
  ['pf-supplier', 'rp-supplier'].forEach(id => {
    const sel = $(id); if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">All</option>' + suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    sel.value = cur;
  });
}

function renderPurchaseTable() {
  fillSupplierFilters();
  const from = $('pf-from').value, to = $('pf-to').value, sup = $('pf-supplier').value, q = $('pf-q').value.trim().toLowerCase();
  const bills = purchaseBills().filter(b => inRange(b.date, from, to) && (!sup || b.supplierId === sup) &&
    (!q || (b.invoiceNo || '').toLowerCase().includes(q) || b.lines.some(l => l.medicineName.toLowerCase().includes(q))));
  reportData.purchaseBills = { title: 'Purchase Bills', headers: ['Date', 'Invoice#', 'Supplier', 'Items', 'Total', 'Payment'],
    rows: bills.map(b => [fmtDate(b.date), b.invoiceNo || '-', supName(b.supplierId), b.lines.length, +b.total.toFixed(2), b.payment]) };
  $('purchase-tbody').innerHTML = bills.length ? bills.map(b => `<tr>
    <td>${fmtDate(b.date)}</td><td>${esc(b.invoiceNo || '-')}</td><td>${esc(supName(b.supplierId))}</td><td>${b.lines.length}</td>
    <td>${rs(b.total)}</td><td>${esc(b.payment)}${b.dueAdded ? ` <small>(due ${rs(b.dueAdded)})</small>` : ''}</td>
    <td><button class="link-btn" onclick="viewPurchase('${b.id}')">View</button>
        <button class="link-btn" onclick="editPurchase('${b.id}')">Edit</button>
        <button class="link-btn danger" onclick="deletePurchase('${b.id}')">Delete</button></td></tr>`).join('')
    : `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">Kunai purchase entry xaina</td></tr>`;
}

window.viewPurchase = function (id) {
  const b = purchaseBills().find(x => x.id === id); if (!b) return;
  const rows = b.lines.map(l => `<tr><td>${esc(l.medicineName)}</td><td>${esc(l.batch)}</td><td>${esc(l.expiry || '')}</td>
    <td>${l.qty}${l.freeQty ? ` <small>(+${l.freeQty} free)</small>` : ''}</td><td>${l.rate ?? l.purchasePrice}</td><td>${l.discount || 0}%</td><td>${rs(l.amount ?? l.qty * l.purchasePrice)}</td></tr>`).join('');
  showGeneric('Purchase Bill ' + (b.invoiceNo || ''), `
    <div class="hint">${fmtDate(b.date)} | Supplier: ${esc(supName(b.supplierId))} | ${esc(b.payment)}${b.dueAdded ? ' | Due: ' + rs(b.dueAdded) : ''}</div>
    <div class="table-wrap"><table style="min-width:480px"><thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Qty</th><th>Rate</th><th>Disc</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="bill-row total" style="margin-top:12px;"><span>Total</span><span>${rs(b.total)}</span></div>`,
    [{ label: 'Close' }, { label: 'Edit', onClick: () => { setTimeout(() => editPurchase(id), 0); } },
     { label: 'Print / PDF', primary: true, onClick: () => { setTimeout(() => printTable('Purchase Bill ' + (b.invoiceNo || ''), ['Medicine', 'Batch', 'Expiry', 'Qty', 'Rate', 'Disc %', 'Amount'],
        b.lines.map(l => [l.medicineName, l.batch, l.expiry || '', l.qty, l.rate ?? l.purchasePrice, l.discount || 0, +(l.amount ?? l.qty * l.purchasePrice).toFixed(2)]),
        `Supplier: ${supName(b.supplierId)} | Date: ${fmtDate(b.date)} | Total: ${rs(b.total)}`), 150); } }]);
};

window.editPurchase = function (id) {
  const b = purchaseBills().find(x => x.id === id); if (!b) return;
  const err = reverseBill(b, true);
  if (err) { showToast(err); return; }
  editingBillId = id; resumingPurDraftId = null;
  openPurchaseModal({ supplierId: b.supplierId || '', invoiceNo: b.invoiceNo, date: localISO(new Date(b.date)),
    payment: b.payment === 'Credit' ? 'Credit' : 'Cash', paid: b.payment === 'Credit' ? (b.paid ?? 0) : '',
    lines: b.lines.map(l => ({ product: l.medicineName, batch: l.batch, expiry: l.expiry, qty: l.qty - (l.freeQty || 0), free: l.freeQty || 0,
      rate: l.rate ?? l.purchasePrice, disc: l.discount || 0, mrp: l.mrp ?? mrpOf(medicines.find(m => sameName(m.name, l.medicineName)) || {}),
      sell: l.sell ?? medicines.find(m => sameName(m.name, l.medicineName) && sameName(m.batch, l.batch))?.sellPrice }))});
};

window.deletePurchase = function (id) {
  const b = purchaseBills().find(x => x.id === id); if (!b) return;
  const err = reverseBill(b, true);
  if (err) { showToast(err); return; }
  if (!confirm(`Yo purchase bill (${b.invoiceNo || fmtDate(b.date)}, ${rs(b.total)}) delete garne? Stock ghatchha.`)) return;
  reverseBill(b, false);
  purchases = purchases.filter(p => (p.billId || p.id) !== id);
  logAct('Purchase delete: ' + (b.invoiceNo || fmtDate(b.date)) + ' ' + rs(b.total));
  save(); renderPurchaseTable(); renderMedicineTable($('medicine-search').value);
  showToast('Purchase bill delete bhayo');
};

window.showPurchaseDrafts = function () {
  const body = purchaseDrafts.length ? purchaseDrafts.map(d => `<div class="alert-item"><span>${fmtDate(d.saved)} | ${esc(supName(d.supplierId || null))} | ${esc(d.invoiceNo || 'no invoice')} | ${d.lines.filter(l => l.product).length} item</span>
    <span><button class="link-btn" onclick="resumePurDraft('${d.id}')">Resume</button><button class="link-btn danger" onclick="deletePurDraft('${d.id}')">Delete</button></span></div>`).join('')
    : '<div class="alert-empty">Kunai draft chaina</div>';
  showGeneric('Purchase Drafts', `<div class="alert-list">${body}</div>`, [{ label: 'Close' }]);
};
window.resumePurDraft = function (id) {
  const d = purchaseDrafts.find(x => x.id === id); if (!d) return;
  closeModal('modal-generic');
  editingBillId = null; resumingPurDraftId = id;
  openPurchaseModal({ supplierId: d.supplierId, invoiceNo: d.invoiceNo, date: d.date, payment: d.payment, paid: d.paid, lines: d.lines });
};
window.deletePurDraft = function (id) {
  if (!confirm('Draft delete garne?')) return;
  purchaseDrafts = purchaseDrafts.filter(d => d.id !== id);
  save(); updateDraftCounts(); showPurchaseDrafts();
};
$('btn-pur-drafts').addEventListener('click', showPurchaseDrafts);
['pf-from', 'pf-to', 'pf-supplier', 'pf-q'].forEach(id => $(id).addEventListener('input', renderPurchaseTable));

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
    c.cost = m.purchasePrice;
    cost += m.purchasePrice * c.qty;
  });
  const invoice = {
    id: uid(), invoiceNo: 'INV-' + nextInvoiceNo(), date: new Date().toISOString(),
    customerName, customerPhone: document.getElementById('billing-customer-phone').value.trim(),
    items: cart.map(c => ({ ...c })),
    subtotal: b.subtotal, discount: b.discount, vat: b.vat, total: b.total,
    profit: b.total - b.vat - cost, paymentMode: mode
  };
  sales.push(invoice);
  if (resumingSaleDraftId) { salesDrafts = salesDrafts.filter(d => d.id !== resumingSaleDraftId); resumingSaleDraftId = null; }
  logAct('Sale: ' + invoice.invoiceNo + ' ' + rs(invoice.total));
  save(); updateDraftCounts();
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
    ${inv.returned ? `<div class="bill-row"><span>Returned</span><span>- ${rs(inv.returned)}</span></div>` : ''}
    <div class="inv-meta" style="margin-top:10px;">Payment: ${esc(inv.paymentMode)}</div>
    ${inv.status === 'Cancelled' ? '<div class="inv-meta" style="color:var(--red);"><b>*** CANCELLED ***</b></div>' : ''}`;
  document.getElementById('modal-invoice').classList.add('open');
}
document.getElementById('btn-close-invoice').addEventListener('click', () => document.getElementById('modal-invoice').classList.remove('open'));
document.getElementById('btn-print-invoice').addEventListener('click', () => window.print());

/* ============ SHARED UTILITIES ============ */
const reportData = {};
function localISO(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString('en-GB') : '-'; }
function logAct(text) { activityLog.push({ date: new Date().toISOString(), text }); if (activityLog.length > 300) activityLog.shift(); }
function updateDraftCounts() {
  $('btn-drafts').textContent = `Drafts (${salesDrafts.length})`;
  $('btn-pur-drafts').textContent = `Drafts (${purchaseDrafts.length})`;
}

function showGeneric(title, html, buttons) {
  $('gen-title').textContent = title;
  $('gen-body').innerHTML = html;
  const act = $('gen-actions'); act.innerHTML = '';
  (buttons || [{ label: 'Close' }]).forEach(b => {
    const el = document.createElement('button');
    el.className = 'btn' + (b.primary ? ' primary' : '');
    el.textContent = b.label;
    el.addEventListener('click', () => { const r = b.onClick ? b.onClick() : undefined; if (r !== false) closeModal('modal-generic'); });
    act.appendChild(el);
  });
  openModal('modal-generic');
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Excel (.xlsx) when the SheetJS library loaded, otherwise CSV so export never fails.
function exportTable(filename, sheet, headers, rows) {
  if (window.XLSX) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), sheet.slice(0, 31));
    XLSX.writeFile(wb, filename + '.xlsx');
    showToast('Excel file download bhayo');
  } else {
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    downloadBlob(new Blob(['\ufeff' + [headers, ...rows].map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), filename + '.csv');
    showToast('Internet chaina — CSV download bhayo (Excel ma khulchha)');
  }
}

// PDF = browser "Save as PDF" on a clean print view
function printTable(title, headers, rows, summary) {
  $('print-area').innerHTML = `<h2>${esc(settings.name)}</h2><div>${esc(settings.address || '')} ${settings.pan ? '| PAN: ' + esc(settings.pan) : ''}</div>
    <h3>${esc(title)}</h3><div class="hint">${esc(summary || '')} | Printed: ${new Date().toLocaleString()}</div>
    <table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-export],[data-print]'); if (!t) return;
  const key = t.dataset.export || t.dataset.print, d = reportData[key];
  if (!d) { showToast('Report khali xa'); return; }
  if (t.dataset.export) exportTable(key + '_' + todayISO(), d.title, d.headers, d.rows);
  else printTable(d.title, d.headers, d.rows, d.summary);
});

/* ============ REPORTS ============ */
document.querySelectorAll('.report-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.report-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    $('report-' + btn.dataset.tab).classList.add('active');
  });
});
function renderReports() { fillSupplierFilters(); renderSalesReport(); renderPurchaseReport(); renderStockReport(); renderExpiryReport(); }

const saleNet = s => s.status === 'Cancelled' ? 0 : s.total - (s.returned || 0);
const saleProfitNet = s => s.status === 'Cancelled' ? 0 : s.profit - (s.returnedProfit || 0);
const nextInvoiceNo = () => Math.max(1000, ...sales.map(s => parseInt(String(s.invoiceNo).replace(/\D/g, '')) || 0)) + 1;

function filteredSales() {
  const from = $('sales-from').value, to = $('sales-to').value, mode = $('sales-mode').value, st = $('sales-status').value, q = $('sales-q').value.trim().toLowerCase();
  return sales.filter(s => inRange(s.date, from, to) && (!mode || s.paymentMode === mode) &&
    (!st || (st === 'Cancelled') === (s.status === 'Cancelled')) &&
    (!q || s.invoiceNo.toLowerCase().includes(q) || (s.customerName || '').toLowerCase().includes(q) || (s.customerPhone || '').includes(q) || s.items.some(i => i.name.toLowerCase().includes(q))))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function renderSalesReport() {
  const list = filteredSales(), live = list.filter(s => s.status !== 'Cancelled');
  const net = live.reduce((a, s) => a + saleNet(s), 0), profit = live.reduce((a, s) => a + saleProfitNet(s), 0);
  const due = live.filter(s => s.paymentMode === 'Credit' && !s.creditPaid).reduce((a, s) => a + saleNet(s), 0);
  $('report-total-sales').textContent = rs(net);
  $('report-total-invoices').textContent = live.length;
  $('report-total-profit').textContent = rs(profit);
  $('report-credit-due').textContent = rs(due);
  const status = s => s.status === 'Cancelled' ? 'Cancelled' : (s.returned ? 'Partly Returned' : 'Completed');
  const pay = s => s.paymentMode + (s.paymentMode === 'Credit' ? (s.creditPaid ? ' (Paid)' : ' (Due)') : '');
  reportData.sales = { title: 'Sales Report', summary: `Net sales ${rs(net)} | Profit ${rs(profit)} | Credit due ${rs(due)}`,
    headers: ['Invoice#', 'Date', 'Customer', 'Phone', 'Items', 'Total', 'Returned', 'Net', 'Payment', 'Status'],
    rows: list.map(s => [s.invoiceNo, fmtDate(s.date), s.customerName || '', s.customerPhone || '', s.items.length, +s.total.toFixed(2), +(s.returned || 0).toFixed(2), +saleNet(s).toFixed(2), pay(s), status(s)]) };
  $('sales-report-tbody').innerHTML = list.length ? list.map(s => {
    const c = s.status === 'Cancelled';
    return `<tr class="${c ? 'row-muted' : ''}"><td>${esc(s.invoiceNo)}</td><td>${fmtDate(s.date)}</td><td>${esc(s.customerName || '-')}</td><td>${s.items.length}</td>
      <td>${rs(s.total)}${s.returned ? `<br><small>return ${rs(s.returned)}</small>` : ''}</td><td>${esc(pay(s))}</td><td>${status(s)}</td>
      <td><button class="link-btn" onclick="viewSale('${s.id}')">View</button>${c ? '' : `
        <button class="link-btn" onclick="editSale('${s.id}')">Edit</button>
        <button class="link-btn" onclick="returnSale('${s.id}')">Return</button>
        ${s.paymentMode === 'Credit' && !s.creditPaid ? `<button class="link-btn" onclick="payCredit('${s.id}')">Mark Paid</button>` : ''}
        <button class="link-btn danger" onclick="cancelSale('${s.id}')">Cancel</button>`}
        ${c ? `<button class="link-btn danger" onclick="deleteSale('${s.id}')">Delete</button>` : ''}</td></tr>`;
  }).join('') : `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:20px;">Kunai sale xaina</td></tr>`;
}
['sales-from', 'sales-to', 'sales-mode', 'sales-status', 'sales-q'].forEach(id => $(id).addEventListener('input', renderSalesReport));
document.querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', () => {
  const now = new Date(), r = b.dataset.range;
  $('sales-to').value = r === 'all' ? '' : localISO(now);
  $('sales-from').value = r === 'today' ? localISO(now) : r === 'month' ? localISO(new Date(now.getFullYear(), now.getMonth(), 1)) : '';
  renderSalesReport();
}));

window.viewSale = id => { const s = sales.find(x => x.id === id); if (s) showInvoice(s); };

window.editSale = function (id) {
  const s = sales.find(x => x.id === id); if (!s) return;
  showGeneric('Edit ' + s.invoiceNo, `
    <label>Customer Name</label><input id="g-name" value="${esc(s.customerName || '')}">
    <label>Phone</label><input id="g-phone" value="${esc(s.customerPhone || '')}">
    <label>Payment Mode</label><select id="g-mode">${['Cash', 'Card', 'Credit'].map(m => `<option ${m === s.paymentMode ? 'selected' : ''}>${m}</option>`).join('')}</select>
    <label>Discount Rs. ${s.returned ? '(return bhaisakeko bill ma badlina milena)' : ''}</label><input id="g-disc" type="number" min="0" value="${s.discount}" ${s.returned ? 'disabled' : ''}>
    <p class="hint" style="margin-top:10px;">Item / quantity badlina: bill Cancel gari naya bill banaunu hos, ya Return use garnu hos.</p>`,
    [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: () => {
      const mode = $('g-mode').value, name = val('g-name');
      if (mode === 'Credit' && !name) { showToast('Udharo ko lagi customer ko naam chahiyo'); return false; }
      s.customerName = name; s.customerPhone = val('g-phone');
      if (mode !== s.paymentMode) { s.paymentMode = mode; s.creditPaid = false; }
      if (!s.returned) {
        const disc = Math.min(Math.max(parseFloat($('g-disc').value) || 0, 0), s.subtotal);
        const cost = s.total - s.vat - s.profit;
        const vg = s.items.filter(i => i.vatable).reduce((a, i) => a + i.qty * i.rate, 0);
        s.discount = disc; s.vat = (s.subtotal ? vg - disc * vg / s.subtotal : 0) * 13 / 113;
        s.total = s.subtotal - disc; s.profit = s.total - s.vat - cost;
      }
      s.edited = new Date().toISOString();
      logAct('Sale edit: ' + s.invoiceNo); save(); renderSalesReport(); renderDashboard(); showToast('Bill update bhayo');
    } }]);
};

window.returnSale = function (id) {
  const s = sales.find(x => x.id === id); if (!s) return;
  const rows = s.items.map((it, i) => { const remain = it.qty - (it.returnedQty || 0);
    return `<tr><td>${esc(it.name)} <small>(${esc(it.batch)})</small></td><td>${it.qty}</td><td>${it.returnedQty || 0}</td>
    <td><input id="g-ret-${i}" type="number" min="0" max="${remain}" value="0" ${remain ? '' : 'disabled'} style="width:70px"></td></tr>`; }).join('');
  showGeneric('Sales Return — ' + s.invoiceNo, `<div class="table-wrap"><table style="min-width:420px"><thead><tr><th>Item</th><th>Sold</th><th>Returned</th><th>Return Qty</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="hint" style="margin-top:10px;">Return gareko qty stock ma wapas jancha, ra refund amount sales bata ghatchha.</p>`,
    [{ label: 'Cancel' }, { label: 'Confirm Return', primary: true, onClick: () => {
      const share = s.subtotal ? 1 - s.discount / s.subtotal : 1;
      let refund = 0, vatR = 0, costR = 0; const qtys = [];
      for (let i = 0; i < s.items.length; i++) {
        const it = s.items[i], rq = parseInt($('g-ret-' + i).value) || 0, remain = it.qty - (it.returnedQty || 0);
        if (rq < 0 || rq > remain) { showToast(it.name + ': return qty galat xa'); return false; }
        qtys.push(rq);
        const amt = rq * it.rate * share; refund += amt; if (it.vatable) vatR += amt * 13 / 113;
        costR += rq * (it.cost ?? medicines.find(m => m.id === it.medId)?.purchasePrice ?? 0);
      }
      if (!refund) { showToast('Return qty halnu hos'); return false; }
      s.items.forEach((it, i) => { if (!qtys[i]) return; it.returnedQty = (it.returnedQty || 0) + qtys[i];
        const m = medicines.find(x => x.id === it.medId); if (m) m.qty += qtys[i]; });
      s.returned = (s.returned || 0) + refund; s.returnedVat = (s.returnedVat || 0) + vatR; s.returnedProfit = (s.returnedProfit || 0) + (refund - vatR - costR);
      logAct(`Sales return: ${s.invoiceNo} ${rs(refund)}`); save(); renderSalesReport(); renderMedicineTable($('medicine-search').value); renderDashboard();
      showToast('Return record bhayo, refund ' + rs(refund));
    } }]);
};

window.cancelSale = function (id) {
  const s = sales.find(x => x.id === id); if (!s) return;
  if (!confirm(`${s.invoiceNo} cancel garne? Stock wapas jancha, ra yo bill sales total bata hatchha.`)) return;
  s.items.forEach(it => { const m = medicines.find(x => x.id === it.medId); if (m) m.qty += it.qty - (it.returnedQty || 0); });
  s.status = 'Cancelled'; s.cancelledDate = new Date().toISOString();
  logAct('Sale cancel: ' + s.invoiceNo); save(); renderSalesReport(); renderMedicineTable($('medicine-search').value); renderDashboard();
  showToast('Bill cancel bhayo, stock wapas bhayo');
};
window.deleteSale = function (id) {
  const s = sales.find(x => x.id === id); if (!s || s.status !== 'Cancelled') { showToast('Pahile bill Cancel garnu hos'); return; }
  if (!confirm(s.invoiceNo + ' hmesha ko lagi delete garne?')) return;
  sales = sales.filter(x => x.id !== id); logAct('Sale delete: ' + s.invoiceNo); save(); renderSalesReport(); showToast('Bill delete bhayo');
};
window.payCredit = function (id) {
  const s = sales.find(x => x.id === id); if (!s) return;
  if (!confirm(`${s.customerName} bata ${rs(saleNet(s))} paayo (paid mark garne)?`)) return;
  s.creditPaid = true; s.paidDate = new Date().toISOString(); logAct('Credit paid: ' + s.invoiceNo); save(); renderSalesReport(); showToast('Paid mark bhayo');
};

/* ---- sales drafts (hold bill) ---- */
let resumingSaleDraftId = null;
$('btn-save-draft').addEventListener('click', () => {
  if (!cart.length) { showToast('Cart khali xa'); return; }
  const d = { id: resumingSaleDraftId || uid(), saved: new Date().toISOString(), customerName: val('billing-customer-name'), customerPhone: val('billing-customer-phone'),
    discount: $('bill-discount').value, mode: $('bill-payment-mode').value, items: cart.map(c => ({ ...c })) };
  const i = salesDrafts.findIndex(x => x.id === d.id);
  if (i >= 0) salesDrafts[i] = d; else salesDrafts.push(d);
  resumingSaleDraftId = null; cart = [];
  ['billing-customer-name', 'billing-customer-phone'].forEach(id => $(id).value = ''); $('bill-discount').value = 0;
  save(); updateDraftCounts(); renderCart(); showToast('Bill draft (hold) save bhayo');
});
$('btn-drafts').addEventListener('click', showSaleDrafts);
function showSaleDrafts() {
  const body = salesDrafts.length ? salesDrafts.map(d => `<div class="alert-item"><span>${new Date(d.saved).toLocaleString()} | ${esc(d.customerName || 'Walk-in')} | ${d.items.length} item | ${rs(d.items.reduce((a, c) => a + c.qty * c.rate, 0))}</span>
    <span><button class="link-btn" onclick="resumeSaleDraft('${d.id}')">Resume</button><button class="link-btn danger" onclick="deleteSaleDraft('${d.id}')">Delete</button></span></div>`).join('')
    : '<div class="alert-empty">Kunai draft chaina</div>';
  showGeneric('Held Bills (Drafts)', `<div class="alert-list">${body}</div>`, [{ label: 'Close' }]);
}
window.resumeSaleDraft = function (id) {
  const d = salesDrafts.find(x => x.id === id); if (!d) return;
  if (cart.length && !confirm('Abhiko cart replace garne?')) return;
  let dropped = 0; const items = [];
  d.items.forEach(it => {
    const m = medicines.find(x => x.id === it.medId);
    if (!m || m.qty <= 0 || daysUntil(m.expiry) < 0) { dropped++; return; }
    items.push({ ...it, rate: m.sellPrice, maxQty: m.qty, qty: Math.min(it.qty, m.qty), vatable: isVatable(m), expiry: m.expiry });
  });
  cart = items; resumingSaleDraftId = id;
  $('billing-customer-name').value = d.customerName || ''; $('billing-customer-phone').value = d.customerPhone || '';
  $('bill-discount').value = d.discount || 0; $('bill-payment-mode').value = d.mode || 'Cash';
  closeModal('modal-generic'); renderCart();
  showToast(dropped ? `${dropped} item stock/expiry ko karan hatayo` : 'Draft cart ma load bhayo');
};
window.deleteSaleDraft = function (id) {
  if (!confirm('Draft delete garne?')) return;
  salesDrafts = salesDrafts.filter(d => d.id !== id); save(); updateDraftCounts(); showSaleDrafts();
};

/* ---- purchase / stock / expiry reports ---- */
function renderPurchaseReport() {
  const from = $('rp-from').value, to = $('rp-to').value, sup = $('rp-supplier').value;
  const lines = purchases.filter(p => inRange(p.date, from, to) && (!sup || p.supplierId === sup)).sort((a, b) => new Date(b.date) - new Date(a.date));
  const amt = p => p.amount ?? p.qty * p.purchasePrice, total = lines.reduce((a, p) => a + amt(p), 0);
  $('report-purchase-total').textContent = rs(total);
  $('report-purchase-bills').textContent = new Set(lines.map(p => p.billId || p.id)).size;
  $('report-purchase-items').textContent = lines.length;
  reportData.purchase = { title: 'Purchase Report', summary: `Total purchase ${rs(total)}`,
    headers: ['Date', 'Invoice#', 'Supplier', 'Medicine', 'Batch', 'Expiry', 'Qty', 'Free', 'Rate', 'Amount', 'Payment'],
    rows: lines.map(p => [fmtDate(p.date), p.invoiceNo || '-', supName(p.supplierId), p.medicineName, p.batch, p.expiry || '', p.qty, p.freeQty || 0, p.rate ?? p.purchasePrice, +amt(p).toFixed(2), p.payment || '-']) };
  $('purchase-report-tbody').innerHTML = lines.length ? lines.map(p => `<tr><td>${fmtDate(p.date)}</td><td>${esc(p.invoiceNo || '-')}</td><td>${esc(supName(p.supplierId))}</td>
    <td>${esc(p.medicineName)}</td><td>${esc(p.batch)}</td><td>${p.qty}</td><td>${rs(amt(p))}</td><td>${esc(p.payment || '-')}</td></tr>`).join('')
    : `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:20px;">Kunai purchase xaina</td></tr>`;
}
['rp-from', 'rp-to', 'rp-supplier'].forEach(id => $(id).addEventListener('input', renderPurchaseReport));

function renderStockReport() {
  const list = [...medicines].sort((a, b) => a.name.localeCompare(b.name));
  const val_ = list.reduce((a, m) => a + m.qty * m.purchasePrice, 0), sell = list.reduce((a, m) => a + m.qty * m.sellPrice, 0);
  $('stock-summary').textContent = `Stock value (purchase): ${rs(val_)} | Stock value (selling): ${rs(sell)}`;
  reportData.stock = { title: 'Stock Report', summary: $('stock-summary').textContent, headers: ['Medicine', 'Batch', 'Expiry', 'Qty', 'Purchase', 'MRP', 'Sell', 'Stock Value (purchase)'],
    rows: list.map(m => [m.name, m.batch, m.expiry, m.qty, m.purchasePrice, mrpOf(m), m.sellPrice, +(m.qty * m.purchasePrice).toFixed(2)]) };
  $('stock-report-tbody').innerHTML = list.length ? list.map(m => `<tr><td>${esc(m.name)}</td><td>${esc(m.batch)}</td><td>${m.qty}</td><td>${rs(m.qty * m.purchasePrice)}</td></tr>`).join('')
    : `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">Stock xaina</td></tr>`;
}

function renderExpiryReport() {
  const w = $('expiry-window').value;
  const list = medicines.filter(m => m.qty > 0 && (w === 'all' || (w === 'expired' ? daysUntil(m.expiry) < 0 : daysUntil(m.expiry) <= +w)))
    .sort((a, b) => daysUntil(a.expiry) - daysUntil(b.expiry));
  const atRisk = list.reduce((a, m) => a + m.qty * m.purchasePrice, 0);
  $('expiry-summary').textContent = `${list.length} batch | Value at risk (purchase): ${rs(atRisk)}`;
  reportData.expiry = { title: 'Expiry Report', summary: $('expiry-summary').textContent, headers: ['Medicine', 'Batch', 'Expiry', 'Days Left', 'Qty', 'Value (purchase)', 'Supplier'],
    rows: list.map(m => [m.name, m.batch, m.expiry, daysUntil(m.expiry), m.qty, +(m.qty * m.purchasePrice).toFixed(2), supName(m.supplierId)]) };
  $('expiry-report-tbody').innerHTML = list.length ? list.map(m => { const d = daysUntil(m.expiry);
    return `<tr class="${d < 0 ? 'row-danger' : d <= settings.expiryDays ? 'row-warn' : ''}"><td>${esc(m.name)}</td><td>${esc(m.batch)}</td><td>${esc(m.expiry)}</td><td>${d < 0 ? 'EXPIRED' : d}</td><td>${m.qty}</td></tr>`; }).join('')
    : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">Kunai batch xaina</td></tr>`;
}
$('expiry-window').addEventListener('change', renderExpiryReport);

/* ============ IMPORT / EXPORT / BACKUP ============ */
const IMPORT_HEADERS = ['Name*', 'Generic', 'Manufacturer', 'Category', 'Unit', 'SKU', 'Barcode', 'Class (A/B/C)', 'VAT (exempt/13)', 'Reorder Level', 'Rack', 'Batch*', 'Expiry* (YYYY-MM-DD)', 'Qty*', 'MRP*', 'Purchase Price*', 'Sell Price', 'Supplier'];
$('btn-export-meds').addEventListener('click', () => exportTable('medicines_' + todayISO(), 'Medicines',
  IMPORT_HEADERS.map(h => h.replace('*', '')), [...medicines].sort((a, b) => a.name.localeCompare(b.name)).map(m => [m.name, m.generic || '', m.manufacturer || '', m.category || '', m.unit || '', m.sku || '', m.barcode || '',
    m.drugClass || 'C', m.vat === '13' ? '13' : 'exempt', m.reorderLevel ?? '', m.rack || '', m.batch, m.expiry, m.qty, mrpOf(m), m.purchasePrice, m.sellPrice, supName(m.supplierId) === '-' ? '' : supName(m.supplierId)])));
$('btn-template').addEventListener('click', () => exportTable('medicine_import_template', 'Medicines', IMPORT_HEADERS,
  [['Paracetamol 500mg', 'Paracetamol', 'ABC Pharma', 'Tablet', 'Strip', '', '', 'C', 'exempt', 20, 'A-1', 'B123', '2027-12-31', 100, 25, 18, 24, 'Nepal Pharma Distributors']]));
$('btn-import-meds').addEventListener('click', () => $('import-file').click());

const normKey = k => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const pick = (row, names) => { for (const k in row) if (names.includes(normKey(k)) && String(row[k]).trim() !== '') return row[k]; return ''; };
const p2 = n => String(n).padStart(2, '0');
function parseDate(v) {
  if (v instanceof Date && !isNaN(v)) return localISO(v);
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const s = String(v || '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
  if ((m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/))) return `${m[3]}-${p2(m[2])}-${p2(m[1])}`;
  if ((m = s.match(/^(\d{1,2})[\/-](\d{4})$/))) return `${m[2]}-${p2(m[1])}-${p2(new Date(+m[2], +m[1], 0).getDate())}`;
  return '';
}

$('import-file').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  if (!window.XLSX) { showToast('Excel library load bhayena (internet chahinchha)'); return; }
  let rows;
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  } catch (err) { showToast('File padhna sakiyena'); return; }
  if (!rows.length) { showToast('File ma data xaina'); return; }

  const stage = medicines.map(m => ({ ...m })), errors = [], newPurs = [], billId = uid(), nowIso = new Date().toISOString();
  const cats = ['Tablet', 'Syrup', 'Capsule', 'Injection', 'Ointment', 'Drops', 'Other'];
  let ok = 0, merged = 0, created = 0;
  rows.forEach((r, i) => {
    const line = 'Row ' + (i + 2) + ': ', g = n => pick(r, n);
    const name = String(g(['name', 'medicinename', 'product', 'productname'])).trim(), batch = String(g(['batch', 'batchno', 'batchnumber'])).trim();
    const expiry = parseDate(g(['expiry', 'expirydate', 'exp', 'expirydateyyyymmdd']) || g(['expiryyyyymmdd']));
    const qty = parseFloat(g(['qty', 'quantity', 'stock'])), mrp = parseFloat(g(['mrp'])), pp = parseFloat(g(['purchaseprice', 'purchaserate', 'cost', 'ptr']));
    let sell = parseFloat(g(['sellprice', 'sellingprice', 'salerate', 'rate'])); if (isNaN(sell)) sell = mrp;
    if (!name || !batch) return errors.push(line + 'Name / Batch chaina');
    if (!expiry || isNaN(new Date(expiry))) return errors.push(line + 'Expiry date galat (YYYY-MM-DD)');
    if (daysUntil(expiry) < 0) return errors.push(line + name + ' expire bhaisakeko');
    if ([qty, mrp, pp, sell].some(isNaN) || qty < 0 || mrp <= 0 || pp < 0 || sell <= 0) return errors.push(line + 'Qty / MRP / Price galat');
    if (sell > mrp) return errors.push(line + 'Sell price MRP bhanda badhi');
    const supText = String(g(['supplier'])).trim(), sup = suppliers.find(s => sameName(s.name, supText));
    const barcode = String(g(['barcode'])).trim(); let sku = String(g(['sku'])).trim();
    const prodRef = stage.find(m => sameName(m.name, name));
    if (!prodRef) {
      if (barcode && stage.some(m => m.barcode === barcode)) return errors.push(line + 'Barcode duplicate');
      if (sku && stage.some(m => (m.sku || '').toLowerCase() === sku.toLowerCase())) return errors.push(line + 'SKU duplicate');
    }
    const cat = cats.find(c => sameName(c, g(['category', 'form']))) || 'Other';
    const cls = String(g(['classabc', 'class', 'drugclass'])).trim().toUpperCase(); const vatS = String(g(['vatexempt13', 'vat'])).trim();
    const catalog = prodRef ? catalogOf(prodRef) : { name, sku: sku || genSku(name, cat), barcode, generic: String(g(['generic', 'genericname'])).trim(), manufacturer: String(g(['manufacturer', 'company'])).trim(),
      category: cat, unit: String(g(['unit'])).trim() || 'Strip', drugClass: ['A', 'B', 'C'].includes(cls) ? cls : 'C', vat: vatS.includes('13') ? '13' : 'exempt',
      reorderLevel: g(['reorderlevel', 'reorder', 'minstock']) === '' ? '' : parseFloat(g(['reorderlevel', 'reorder', 'minstock'])), rack: String(g(['rack', 'location'])).trim() };
    const ex = stage.find(m => sameName(m.name, name) && sameName(m.batch, batch));
    if (ex) { ex.qty += qty; ex.expiry = expiry; ex.mrp = mrp; ex.purchasePrice = pp; ex.sellPrice = sell; if (sup) ex.supplierId = sup.id; merged++; }
    else { stage.push({ id: uid(), ...catalog, batch, expiry, qty, purchasePrice: pp, mrp, sellPrice: sell, supplierId: sup ? sup.id : null }); created++; }
    if (qty > 0) newPurs.push({ id: uid(), billId, date: nowIso, invoiceNo: 'IMPORT', medicineName: catalog.name, batch, expiry, qty, freeQty: 0, rate: pp, discount: 0, purchasePrice: pp, mrp, sell,
      amount: qty * pp, supplierId: sup ? sup.id : null, payment: 'Opening', paid: qty * pp, dueAdded: 0 });
    ok++;
  });
  const errHtml = errors.length ? `<div class="alert-list" style="max-height:200px;overflow:auto;margin-top:10px;color:var(--red);">${errors.slice(0, 30).map(x => `<div class="alert-item">${esc(x)}</div>`).join('')}${errors.length > 30 ? `<div class="alert-item">...aru ${errors.length - 30} error</div>` : ''}</div>` : '';
  showGeneric('Import Preview', `<div class="stat-grid small" style="grid-template-columns:repeat(3,1fr);margin-bottom:0;">
    <div class="stat-card good"><div class="stat-label">Valid rows</div><div class="stat-value">${ok}</div></div>
    <div class="stat-card"><div class="stat-label">Naya batch / merge</div><div class="stat-value">${created} / ${merged}</div></div>
    <div class="stat-card ${errors.length ? 'danger' : ''}"><div class="stat-label">Errors (skip hunchha)</div><div class="stat-value">${errors.length}</div></div></div>${errHtml}`,
    [{ label: 'Cancel' }, { label: 'Import ' + ok + ' rows', primary: true, onClick: () => {
      if (!ok) { showToast('Import garna milne row chaina'); return false; }
      medicines = stage; purchases.push(...newPurs); logAct(`Excel import: ${ok} rows (${file.name})`); save();
      renderMedicineTable($('medicine-search').value); renderPurchaseTable(); renderDashboard(); showToast(ok + ' row import bhayo');
    } }]);
});

$('btn-backup').addEventListener('click', () => {
  downloadBlob(new Blob([JSON.stringify({ app: 'pharmacy-os', version: 2, exported: new Date().toISOString(), medicines, suppliers, sales, purchases, settings, salesDrafts, purchaseDrafts, activityLog })], { type: 'application/json' }), 'pharmacy_backup_' + todayISO() + '.json');
  showToast('Backup download bhayo');
});
$('btn-restore').addEventListener('click', () => $('restore-file').click());
$('restore-file').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (d.app !== 'pharmacy-os' || !Array.isArray(d.medicines) || !Array.isArray(d.sales)) throw new Error('bad');
    if (!confirm(`Restore garda abhiko sabai data replace huncha.\nBackup: ${d.medicines.length} batch, ${d.sales.length} sale. Continue?`)) return;
    medicines = d.medicines; suppliers = d.suppliers || []; sales = d.sales; purchases = d.purchases || []; settings = d.settings || settings;
    salesDrafts = d.salesDrafts || []; purchaseDrafts = d.purchaseDrafts || []; activityLog = d.activityLog || [];
    save(); location.reload();
  } catch (err) { showToast('Backup file valid xaina'); }
});
$('btn-export-all').addEventListener('click', () => {
  if (!window.XLSX) { showToast('Excel library load bhayena (internet chahinchha)'); return; }
  const wb = XLSX.utils.book_new(), add = (n, h, r) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([h, ...r]), n);
  add('Medicines', ['Name', 'Batch', 'Expiry', 'Qty', 'Purchase', 'MRP', 'Sell', 'Supplier'], medicines.map(m => [m.name, m.batch, m.expiry, m.qty, m.purchasePrice, mrpOf(m), m.sellPrice, supName(m.supplierId)]));
  add('Sales', ['Invoice', 'Date', 'Customer', 'Total', 'Returned', 'Payment', 'Status'], sales.map(s => [s.invoiceNo, fmtDate(s.date), s.customerName || '', s.total, s.returned || 0, s.paymentMode, s.status || 'Completed']));
  add('Sale Items', ['Invoice', 'Item', 'Batch', 'Qty', 'Rate'], sales.flatMap(s => s.items.map(i => [s.invoiceNo, i.name, i.batch, i.qty, i.rate])));
  add('Purchases', ['Date', 'Invoice', 'Supplier', 'Medicine', 'Batch', 'Qty', 'Rate', 'Amount', 'Payment'], purchases.map(p => [fmtDate(p.date), p.invoiceNo || '', supName(p.supplierId), p.medicineName, p.batch, p.qty, p.rate ?? p.purchasePrice, p.amount ?? p.qty * p.purchasePrice, p.payment || '']));
  add('Suppliers', ['Name', 'Phone', 'Address', 'PAN', 'Due'], suppliers.map(s => [s.name, s.phone || '', s.address || '', s.pan || '', s.due || 0]));
  XLSX.writeFile(wb, 'pharmacy_all_data_' + todayISO() + '.xlsx'); showToast('Excel download bhayo');
});
$('btn-activity').addEventListener('click', () => showGeneric('Activity Log (last 100)',
  `<div class="alert-list" style="max-height:360px;overflow:auto;">${[...activityLog].reverse().slice(0, 100).map(a => `<div class="alert-item"><span>${esc(a.text)}</span><span class="sr-meta">${new Date(a.date).toLocaleString()}</span></div>`).join('') || '<div class="alert-empty">Kunai activity chaina</div>'}</div>`));

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
updateDraftCounts();
renderPurchaseTable();
