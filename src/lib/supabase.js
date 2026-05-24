// DESHAN TEXTILE POS v4 — Hybrid Database (Supabase + LocalStorage fallback)
// ✅ Works ONLINE (syncs to Supabase) and OFFLINE (localStorage)
// ✅ Auto-detects connection, queues offline changes for sync

import { createClient } from '@supabase/supabase-js';

// ============================================================
// SUPABASE CLIENT
// ============================================================
const SB_URL  = import.meta.env.VITE_SUPABASE_URL  || '';
const SB_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export let supabase = null;
export let isOnline = false;

// Track sync status for UI
const syncListeners = [];
export function onSyncStatusChange(fn) { syncListeners.push(fn); }
function setSyncStatus(online) {
  isOnline = online;
  syncListeners.forEach(fn => fn(online));
}

// Initialize Supabase if credentials exist
if (SB_URL && SB_KEY && SB_URL.startsWith('https://')) {
  try {
    supabase = createClient(SB_URL, SB_KEY, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 2 } },
    });
    // Test connection
    supabase.from('staff').select('id').limit(1)
      .then(({ error }) => {
        setSyncStatus(!error);
        if (!error) flushOfflineQueue();
      })
      .catch(() => setSyncStatus(false));
  } catch {
    supabase = null;
  }
}

// Monitor online/offline browser events
window.addEventListener('online',  () => { if (supabase) supabase.from('staff').select('id').limit(1).then(({ error }) => { setSyncStatus(!error); if (!error) flushOfflineQueue(); }).catch(() => setSyncStatus(false)); });
window.addEventListener('offline', () => setSyncStatus(false));

// ============================================================
// OFFLINE QUEUE — sync writes when back online
// ============================================================
const QUEUE_KEY = 'dpos_offline_queue';
function loadQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch { return []; } }
function saveQueue(q) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {} }

async function flushOfflineQueue() {
  if (!supabase || !isOnline) return;
  const queue = loadQueue();
  if (queue.length === 0) return;
  const failed = [];
  for (const op of queue) {
    try {
      if (op.type === 'upsert') await supabase.from(op.table).upsert(op.data);
      else if (op.type === 'insert') await supabase.from(op.table).insert(op.data);
      else if (op.type === 'update') await supabase.from(op.table).update(op.data).eq('id', op.id);
      else if (op.type === 'delete') await supabase.from(op.table).delete().eq('id', op.id);
    } catch { failed.push(op); }
  }
  saveQueue(failed);
}

function queueOp(op) {
  const q = loadQueue();
  q.push({ ...op, queued_at: new Date().toISOString() });
  saveQueue(q.slice(-200)); // keep latest 200
}

// ============================================================
// LOCAL STORAGE HELPERS
// ============================================================
function ls_load(key, def = []) {
  try { return JSON.parse(localStorage.getItem('dpos_' + key)) ?? def; }
  catch { return def; }
}
function ls_save(key, val) {
  try { localStorage.setItem('dpos_' + key, JSON.stringify(val)); }
  catch (e) { console.warn('Storage full?', e); }
}
function genId() {
  return 'local_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ============================================================
// SEED DEFAULT LOCAL DATA (first run only)
// ============================================================
(function seedDefaults() {
  if (ls_load('seeded', false)) return;
  ls_save('staff', [
    { id: 'staff-mgr', name: 'Manager',  role: 'manager',  pin_hash: '1234', active: true },
    { id: 'staff-cas', name: 'Cashier 1', role: 'cashier', pin_hash: '0000', active: true },
  ]);
  ls_save('categories', [
    { id: 'cat-1', name: 'Fabrics',         color: '#B8860B' },
    { id: 'cat-2', name: 'Accessories',     color: '#5F9EA0' },
    { id: 'cat-3', name: 'Threads',         color: '#8B4513' },
    { id: 'cat-4', name: 'Lace & Trim',     color: '#9370DB' },
    { id: 'cat-5', name: 'Buttons & Zip',   color: '#2E8B57' },
  ]);
  ls_save('products',       []);
  ls_save('customers',      []);
  ls_save('suppliers',      []);
  ls_save('bills',          []);
  ls_save('bill_items',     []);
  ls_save('returns',        []);
  ls_save('return_items',   []);
  ls_save('expenses',       []);
  ls_save('stock_movements',[]);
  ls_save('seeded', true);
})();

// ============================================================
// STAFF
// ============================================================
export async function verifyPin(role, pin) {
  if (supabase && isOnline) {
    try {
      const { data } = await supabase.from('staff').select('*').eq('role', role).eq('pin_hash', pin).eq('active', true).maybeSingle();
      if (data) return data;
    } catch {}
  }
  return ls_load('staff').find(s => s.role === role && s.pin_hash === pin && s.active) || null;
}

export async function getStaff() {
  if (supabase && isOnline) {
    try {
      const { data } = await supabase.from('staff').select('*').order('name');
      if (data) { ls_save('staff', data); return data; }
    } catch {}
  }
  return ls_load('staff').sort((a, b) => a.name.localeCompare(b.name));
}

export async function addStaff(staff) {
  if (supabase && isOnline) {
    try {
      const { data } = await supabase.from('staff').insert(staff).select().single();
      if (data) { const list = ls_load('staff'); list.push(data); ls_save('staff', list); return data; }
    } catch {}
  }
  const item = { ...staff, id: genId() };
  const list = ls_load('staff'); list.push(item); ls_save('staff', list);
  queueOp({ type: 'insert', table: 'staff', data: item });
  return item;
}

export async function updateStaff(id, updates) {
  if (supabase && isOnline) {
    try { await supabase.from('staff').update(updates).eq('id', id); }
    catch {}
  } else {
    queueOp({ type: 'update', table: 'staff', id, data: updates });
  }
  const list = ls_load('staff');
  const idx = list.findIndex(s => s.id === id);
  if (idx >= 0) { list[idx] = { ...list[idx], ...updates }; ls_save('staff', list); }
}

// ============================================================
// CATEGORIES
// ============================================================
export async function getCategories() {
  if (supabase && isOnline) {
    try {
      const { data } = await supabase.from('categories').select('*').order('name');
      if (data) { ls_save('categories', data); return data; }
    } catch {}
  }
  return ls_load('categories').sort((a, b) => a.name.localeCompare(b.name));
}

export async function upsertCategory(cat) {
  if (supabase && isOnline) {
    try {
      const { data } = await supabase.from('categories').upsert(cat).select().single();
      if (data) {
        const list = ls_load('categories');
        const idx = list.findIndex(c => c.id === data.id);
        if (idx >= 0) list[idx] = data; else list.push(data);
        ls_save('categories', list);
        return data;
      }
    } catch {}
  }
  const list = ls_load('categories');
  if (cat.id) {
    const idx = list.findIndex(c => c.id === cat.id);
    if (idx >= 0) { list[idx] = { ...list[idx], ...cat }; ls_save('categories', list); queueOp({ type: 'upsert', table: 'categories', data: list[idx] }); return list[idx]; }
  }
  const item = { ...cat, id: genId() };
  list.push(item); ls_save('categories', list);
  queueOp({ type: 'insert', table: 'categories', data: item });
  return item;
}

// ============================================================
// PRODUCTS
// ============================================================
export async function getProducts() {
  if (supabase && isOnline) {
    try {
      const { data } = await supabase.from('products').select('*, categories(name, color)').eq('active', true).order('name');
      if (data) { ls_save('products', data); return data; }
    } catch {}
  }
  const cats = ls_load('categories');
  const catMap = Object.fromEntries(cats.map(c => [c.id, c]));
  return ls_load('products')
    .filter(p => p.active !== false)
    .map(p => ({ ...p, categories: p.categories || catMap[p.category_id] || { name: 'Other', color: '#aaa' } }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function upsertProduct(product) {
  const now = new Date().toISOString();
  const payload = { ...product, updated_at: now };
  if (!payload.id) payload.created_at = now;

  if (supabase && isOnline) {
    try {
      const { data } = await supabase.from('products').upsert(payload).select('*, categories(name, color)').single();
      if (data) {
        const list = ls_load('products');
        const idx = list.findIndex(p => p.id === data.id);
        if (idx >= 0) list[idx] = data; else list.push(data);
        ls_save('products', list);
        return data;
      }
    } catch {}
  }
  const list = ls_load('products');
  if (payload.id) {
    const idx = list.findIndex(p => p.id === payload.id);
    if (idx >= 0) { list[idx] = { ...list[idx], ...payload }; ls_save('products', list); queueOp({ type: 'upsert', table: 'products', data: payload }); return list[idx]; }
  }
  const item = { ...payload, id: genId(), active: true };
  list.push(item); ls_save('products', list);
  queueOp({ type: 'insert', table: 'products', data: item });
  return item;
}

export async function deleteProduct(id) {
  if (supabase && isOnline) {
    try { await supabase.from('products').update({ active: false }).eq('id', id); }
    catch {}
  } else {
    queueOp({ type: 'update', table: 'products', id, data: { active: false } });
  }
  const list = ls_load('products');
  const idx = list.findIndex(p => p.id === id);
  if (idx >= 0) { list[idx].active = false; ls_save('products', list); }
}

// ============================================================
// STOCK
// ============================================================
export async function addStockMovement(mov) {
  const item = { ...mov, id: genId(), created_at: new Date().toISOString() };
  if (supabase && isOnline) {
    try { await supabase.from('stock_movements').insert(item); }
    catch { queueOp({ type: 'insert', table: 'stock_movements', data: item }); }
  } else {
    queueOp({ type: 'insert', table: 'stock_movements', data: item });
  }
  const list = ls_load('stock_movements');
  list.unshift(item);
  ls_save('stock_movements', list.slice(0, 500));
}

export async function getStockMovements(limit = 100) {
  if (supabase && isOnline) {
    try {
      const { data } = await supabase.from('stock_movements')
        .select('*, products(name), staff(name)')
        .order('created_at', { ascending: false }).limit(limit);
      if (data) return data;
    } catch {}
  }
  const products = ls_load('products');
  const staff    = ls_load('staff');
  const pMap = Object.fromEntries(products.map(p => [p.id, p]));
  const sMap = Object.fromEntries(staff.map(s => [s.id, s]));
  return ls_load('stock_movements').slice(0, limit)
    .map(m => ({ ...m, products: pMap[m.product_id], staff: sMap[m.created_by] }));
}

function _updateLocalStock(productId, delta) {
  const list = ls_load('products');
  const idx = list.findIndex(p => p.id === productId);
  if (idx >= 0) {
    list[idx].stock = Math.max(0, (Number(list[idx].stock) || 0) + delta);
    ls_save('products', list);
  }
}

// ============================================================
// CUSTOMERS
// ============================================================
export async function getCustomers() {
  if (supabase && isOnline) {
    try {
      const { data } = await supabase.from('customers').select('*').order('name');
      if (data) { ls_save('customers', data); return data; }
    } catch {}
  }
  return ls_load('customers').sort((a, b) => a.name.localeCompare(b.name));
}

export async function findCustomer(phone) {
  if (supabase && isOnline) {
    try {
      const { data } = await supabase.from('customers').select('*').eq('phone', phone).maybeSingle();
      if (data !== undefined) return data;
    } catch {}
  }
  return ls_load('customers').find(c => c.phone === phone) || null;
}

export async function upsertCustomer(customer) {
  if (supabase && isOnline) {
    try {
      const { data } = await supabase.from('customers').upsert(customer).select().single();
      if (data) {
        const list = ls_load('customers');
        const idx = list.findIndex(c => c.id === data.id);
        if (idx >= 0) list[idx] = data; else list.push(data);
        ls_save('customers', list);
        return data;
      }
    } catch {}
  }
  const list = ls_load('customers');
  if (customer.id) {
    const idx = list.findIndex(c => c.id === customer.id);
    if (idx >= 0) { list[idx] = { ...list[idx], ...customer }; ls_save('customers', list); queueOp({ type: 'upsert', table: 'customers', data: list[idx] }); return list[idx]; }
  }
  const item = { ...customer, id: genId(), loyalty_points: 0, total_spent: 0, created_at: new Date().toISOString() };
  list.push(item); ls_save('customers', list);
  queueOp({ type: 'insert', table: 'customers', data: item });
  return item;
}

// ============================================================
// SUPPLIERS
// ============================================================
export async function getSuppliers() {
  if (supabase && isOnline) {
    try {
      const { data } = await supabase.from('suppliers').select('*').order('name');
      if (data) { ls_save('suppliers', data); return data; }
    } catch {}
  }
  return ls_load('suppliers').sort((a, b) => a.name.localeCompare(b.name));
}

export async function upsertSupplier(s) {
  if (supabase && isOnline) {
    try {
      const { data } = await supabase.from('suppliers').upsert(s).select().single();
      if (data) {
        const list = ls_load('suppliers');
        const idx = list.findIndex(x => x.id === data.id);
        if (idx >= 0) list[idx] = data; else list.push(data);
        ls_save('suppliers', list);
        return data;
      }
    } catch {}
  }
  const list = ls_load('suppliers');
  if (s.id) {
    const idx = list.findIndex(x => x.id === s.id);
    if (idx >= 0) { list[idx] = { ...list[idx], ...s }; ls_save('suppliers', list); queueOp({ type: 'upsert', table: 'suppliers', data: list[idx] }); return list[idx]; }
  }
  const item = { ...s, id: genId(), created_at: new Date().toISOString() };
  list.push(item); ls_save('suppliers', list);
  queueOp({ type: 'insert', table: 'suppliers', data: item });
  return item;
}

// ============================================================
// BILLING
// ============================================================
export async function saveBill(bill, items, staffId) {
  const today = new Date();
  const prefix = `DT${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;

  // Generate bill number
  let billNumber;
  if (supabase && isOnline) {
    try {
      const { count } = await supabase.from('bills').select('*', { count: 'exact', head: true });
      billNumber = `${prefix}-${String((count || 0) + 1).padStart(4, '0')}`;
    } catch {
      const bills = ls_load('bills');
      billNumber = `${prefix}-${String(bills.length + 1).padStart(4, '0')}`;
    }
  } else {
    const bills = ls_load('bills');
    billNumber = `${prefix}-${String(bills.length + 1).padStart(4, '0')}`;
  }

  const now = new Date().toISOString();
  const billRecord = { ...bill, id: genId(), bill_number: billNumber, cashier_id: staffId, status: 'completed', created_at: now };

  if (supabase && isOnline) {
    try {
      const { data: savedBill } = await supabase.from('bills').insert(billRecord).select().single();
      if (savedBill) {
        const billItems = items.map(i => ({
          id: genId(), bill_id: savedBill.id,
          product_id: i.id, product_name: i.name,
          unit_price: i.price, quantity: i.qty, total: i.price * i.qty
        }));
        await supabase.from('bill_items').insert(billItems);
        // Update stock in Supabase
        for (const item of items) {
          await supabase.rpc('decrement_stock', { product_id: item.id, amount: item.qty }).catch(() => {
            supabase.from('products').select('stock').eq('id', item.id).single().then(({ data }) => {
              if (data) supabase.from('products').update({ stock: Math.max(0, data.stock - item.qty) }).eq('id', item.id);
            });
          });
          await addStockMovement({ product_id: item.id, movement_type: 'sale', quantity: -item.qty, reference_id: savedBill.id, created_by: staffId });
        }
        // Update customer
        if (bill.customer_id) {
          const pts = Math.floor(Number(bill.total) / 100);
          await supabase.from('customers').select('total_spent,loyalty_points').eq('id', bill.customer_id).single()
            .then(({ data }) => {
              if (data) supabase.from('customers').update({ total_spent: (data.total_spent || 0) + Number(bill.total), loyalty_points: (data.loyalty_points || 0) + pts }).eq('id', bill.customer_id);
            });
        }
        // Save locally too
        const allBills = ls_load('bills'); allBills.unshift(savedBill); ls_save('bills', allBills);
        const allItems = ls_load('bill_items'); allItems.unshift(...billItems); ls_save('bill_items', allItems.slice(0, 5000));
        items.forEach(item => _updateLocalStock(item.id, -item.qty));
        return { ...savedBill, items: billItems };
      }
    } catch (e) { console.warn('Supabase bill save failed, using local', e); }
  }

  // Offline save
  const bills = ls_load('bills');
  bills.unshift(billRecord);
  ls_save('bills', bills);

  const billItems = items.map(i => ({
    id: genId(), bill_id: billRecord.id,
    product_id: i.id, product_name: i.name,
    unit_price: i.price, quantity: i.qty, total: i.price * i.qty
  }));
  const allItems = ls_load('bill_items');
  allItems.unshift(...billItems);
  ls_save('bill_items', allItems.slice(0, 5000));

  items.forEach(item => {
    _updateLocalStock(item.id, -item.qty);
    addStockMovement({ product_id: item.id, movement_type: 'sale', quantity: -item.qty, reference_id: billRecord.id, created_by: staffId });
  });

  if (bill.customer_id) {
    const custs = ls_load('customers');
    const ci = custs.findIndex(c => c.id === bill.customer_id);
    if (ci >= 0) {
      custs[ci].total_spent    = (Number(custs[ci].total_spent)    || 0) + Number(bill.total);
      custs[ci].loyalty_points = (Number(custs[ci].loyalty_points) || 0) + Math.floor(Number(bill.total) / 100);
      ls_save('customers', custs);
    }
  }

  queueOp({ type: 'insert', table: 'bills', data: billRecord });
  billItems.forEach(bi => queueOp({ type: 'insert', table: 'bill_items', data: bi }));

  return { ...billRecord, items: billItems };
}

// ============================================================
// RETURNS
// ============================================================
export async function saveReturn(ret, items, staffId) {
  const today = new Date();
  const prefix = `RTN${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
  const returns = ls_load('returns');
  const returnNumber = `${prefix}-${String(returns.length + 1).padStart(4, '0')}`;
  const now = new Date().toISOString();

  const retRecord = { ...ret, id: genId(), return_number: returnNumber, processed_by: staffId, created_at: now };

  if (supabase && isOnline) {
    try {
      const { data: savedRet } = await supabase.from('returns').insert(retRecord).select().single();
      if (savedRet) {
        const retItems = items.map(i => ({
          id: genId(), return_id: savedRet.id,
          product_id: i.product_id || i.id || null,
          product_name: i.product_name || i.name,
          unit_price: i.unit_price || i.price,
          quantity: i.qty,
          total: (i.unit_price || i.price) * i.qty
        }));
        await supabase.from('return_items').insert(retItems);
        // Restore stock
        for (const item of items) {
          const pid = item.product_id || item.id;
          if (pid) {
            await addStockMovement({ product_id: pid, movement_type: 'return', quantity: item.qty, reference_id: savedRet.id, created_by: staffId });
          }
        }
        // Save locally
        const allRet = ls_load('returns'); allRet.unshift(savedRet); ls_save('returns', allRet);
        const allRetItems = ls_load('return_items'); allRetItems.unshift(...retItems); ls_save('return_items', allRetItems.slice(0, 2000));
        items.forEach(item => { const pid = item.product_id || item.id; if (pid) _updateLocalStock(pid, item.qty); });
        return { ...savedRet, items: retItems };
      }
    } catch {}
  }

  // Offline
  returns.unshift(retRecord);
  ls_save('returns', returns);

  const retItems = items.map(i => ({
    id: genId(), return_id: retRecord.id,
    product_id: i.product_id || i.id || null,
    product_name: i.product_name || i.name,
    unit_price: i.unit_price || i.price,
    quantity: i.qty,
    total: (i.unit_price || i.price) * i.qty
  }));
  const allRetItems = ls_load('return_items');
  allRetItems.unshift(...retItems);
  ls_save('return_items', allRetItems.slice(0, 2000));

  items.forEach(item => {
    const pid = item.product_id || item.id;
    if (pid) {
      _updateLocalStock(pid, item.qty);
      addStockMovement({ product_id: pid, movement_type: 'return', quantity: item.qty, reference_id: retRecord.id, created_by: staffId });
    }
  });

  queueOp({ type: 'insert', table: 'returns', data: retRecord });
  retItems.forEach(ri => queueOp({ type: 'insert', table: 'return_items', data: ri }));

  return { ...retRecord, items: retItems };
}

export async function getReturns(type = null) {
  if (supabase && isOnline) {
    try {
      let q = supabase.from('returns').select('*, return_items(*), staff(name)').order('created_at', { ascending: false });
      if (type) q = q.eq('sale_type', type);
      const { data } = await q;
      if (data) return data;
    } catch {}
  }
  const staff = ls_load('staff');
  const sMap  = Object.fromEntries(staff.map(s => [s.id, s]));
  const retItems = ls_load('return_items');
  return ls_load('returns')
    .filter(r => !type || r.sale_type === type)
    .map(r => ({ ...r, return_items: retItems.filter(i => i.return_id === r.id), staff: sMap[r.processed_by] || null }));
}

export async function getBillByNumber(billNumber) {
  if (supabase && isOnline) {
    try {
      const { data } = await supabase.from('bills').select('*, bill_items(*)').eq('bill_number', billNumber).maybeSingle();
      if (data) return data;
    } catch {}
  }
  const bill = ls_load('bills').find(b => b.bill_number === billNumber);
  if (!bill) return null;
  const items = ls_load('bill_items').filter(i => i.bill_id === bill.id);
  return { ...bill, bill_items: items };
}

// ============================================================
// EXPENSES
// ============================================================
export async function getExpenses(month = null) {
  if (supabase && isOnline) {
    try {
      let q = supabase.from('expenses').select('*, staff(name)').order('date', { ascending: false });
      if (month) q = q.gte('date', `${month}-01`).lte('date', `${month}-31`);
      const { data } = await q;
      if (data) return data;
    } catch {}
  }
  const staff = ls_load('staff');
  const sMap  = Object.fromEntries(staff.map(s => [s.id, s]));
  return ls_load('expenses')
    .filter(e => !month || (e.date >= `${month}-01` && e.date <= `${month}-31`))
    .sort((a, b) => b.date?.localeCompare(a.date))
    .map(e => ({ ...e, staff: sMap[e.created_by] || null }));
}

export async function addExpense(exp) {
  const item = { ...exp, id: genId(), created_at: new Date().toISOString() };
  if (supabase && isOnline) {
    try {
      const { data } = await supabase.from('expenses').insert(item).select('*, staff(name)').single();
      if (data) { const list = ls_load('expenses'); list.unshift(data); ls_save('expenses', list); return data; }
    } catch {}
  }
  queueOp({ type: 'insert', table: 'expenses', data: item });
  const list = ls_load('expenses');
  list.unshift(item);
  ls_save('expenses', list);
  return item;
}

export async function deleteExpense(id) {
  if (supabase && isOnline) {
    try { await supabase.from('expenses').delete().eq('id', id); }
    catch { queueOp({ type: 'delete', table: 'expenses', id }); }
  } else {
    queueOp({ type: 'delete', table: 'expenses', id });
  }
  ls_save('expenses', ls_load('expenses').filter(e => e.id !== id));
}

// ============================================================
// REPORTS
// ============================================================
export async function getBillsForDate(date) {
  const dateStr = (date instanceof Date ? date.toISOString() : String(date)).slice(0, 10);
  if (supabase && isOnline) {
    try {
      const { data } = await supabase.from('bills')
        .select('*, bill_items(*), staff(name)')
        .gte('created_at', `${dateStr}T00:00:00`)
        .lte('created_at', `${dateStr}T23:59:59`)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });
      if (data) return data;
    } catch {}
  }
  const staff    = ls_load('staff');
  const sMap     = Object.fromEntries(staff.map(s => [s.id, s]));
  const allItems = ls_load('bill_items');
  return ls_load('bills')
    .filter(b => b.created_at?.startsWith(dateStr) && b.status === 'completed')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(b => ({ ...b, bill_items: allItems.filter(i => i.bill_id === b.id), staff: sMap[b.cashier_id] || null }));
}

export async function getTopProducts(limit = 10) {
  if (supabase && isOnline) {
    try {
      const { data } = await supabase.from('bill_items').select('product_id, product_name, quantity, total');
      if (data) {
        const totals = {};
        for (const i of data) {
          if (!totals[i.product_id]) totals[i.product_id] = { product_id: i.product_id, name: i.product_name, total_qty: 0, total_revenue: 0 };
          totals[i.product_id].total_qty      += Number(i.quantity) || 0;
          totals[i.product_id].total_revenue  += Number(i.total)    || 0;
        }
        return Object.values(totals).sort((a, b) => b.total_revenue - a.total_revenue).slice(0, limit);
      }
    } catch {}
  }
  const items    = ls_load('bill_items');
  const products = ls_load('products');
  const pMap     = Object.fromEntries(products.map(p => [p.id, p]));
  const totals   = {};
  for (const i of items) {
    if (!totals[i.product_id]) totals[i.product_id] = { product_id: i.product_id, name: pMap[i.product_id]?.name || i.product_name, total_qty: 0, total_revenue: 0 };
    totals[i.product_id].total_qty      += Number(i.quantity) || 0;
    totals[i.product_id].total_revenue  += Number(i.total)    || 0;
  }
  return Object.values(totals).sort((a, b) => b.total_revenue - a.total_revenue).slice(0, limit);
}

// Export queue info for UI
export function getOfflineQueueCount() { return loadQueue().length; }
