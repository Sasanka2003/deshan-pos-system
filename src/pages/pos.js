// DESHAN TEXTILE POS v4 — Main POS
// ✅ Supabase + Offline fallback
// ✅ Barcode generation & print labels
// ✅ All bugs fixed
import { getProducts, upsertProduct, deleteProduct, getCategories, upsertCategory,
         getStaff, addStaff, updateStaff, getCustomers, findCustomer, upsertCustomer,
         getSuppliers, upsertSupplier, saveBill, saveReturn, getReturns, getBillByNumber,
         getExpenses, addExpense, deleteExpense, getBillsForDate, getTopProducts,
         addStockMovement, onSyncStatusChange, isOnline, getOfflineQueueCount } from '../lib/supabase.js';
import { printReceipt, downloadReceipt, generateDailyReportPDF } from '../lib/receipt.js';
import { sendReceiptViaWhatsApp, sendLowStockAlert, sendDailySummary } from '../lib/whatsapp.js';
import { askBusinessAssistant, AI_QUICK_ACTIONS } from '../lib/ai.js';
import { BarcodeScanner, generateEAN13, renderBarcodeToSVG, openBarcodePrintModal } from '../lib/barcode.js';
import { navigate } from '../main.js';

// ============================================================
// APP STATE
// ============================================================
let products = [], categories = [], customers = [], suppliers = [], staff = [];
let cart = [], discount = 0, saleType = 'retail', holdBills = [];
let currentUser = null, currentCustomer = null, barcodeScanner = null;
let todaySales = 0, transactionCount = 0, itemsSold = 0;
let todayReturns = 0, retailReturns = [], wholesaleReturns = [];
let salesLog = [], expenses = [];
let activeTab = 'billing', activeCat = 'All';
let receiptLang = 'en';
let billCounter = 1;
let selectedForBarcode = new Set();

const EXPENSE_CATS = ['Rent','Electricity','Water','Wages','Transport','Packaging','Maintenance','Marketing','Other'];

// ============================================================
// ENTRY POINT
// ============================================================
export async function renderPOS(container, { user }) {
  currentUser = user;
  container.innerHTML = buildShell(user);
  injectStyles();
  updateTime(); setInterval(updateTime, 1000);
  initTabs();

  // Sync status listener
  onSyncStatusChange(online => {
    const dot = document.getElementById('syncDot');
    const qCount = getOfflineQueueCount();
    if (dot) {
      if (online) {
        dot.textContent = qCount > 0 ? `● Syncing (${qCount})` : '● Online';
        dot.style.color = qCount > 0 ? '#BA7517' : 'var(--dt-ok)';
      } else {
        dot.textContent = '○ Offline' + (qCount > 0 ? ` (${qCount} pending)` : '');
        dot.style.color = '#E24B4A';
      }
    }
  });

  showToast('Loading data...', 'info');
  await loadAllData();
  renderProductGrid();
  renderCategories();
  if (user.role === 'manager') loadDashboard();

  barcodeScanner = new BarcodeScanner(handleBarcodeScan);
  barcodeScanner.start();

  // Update sync dot on load
  const dot = document.getElementById('syncDot');
  if (dot) {
    dot.textContent = isOnline ? '● Online' : '○ Offline';
    dot.style.color = isOnline ? 'var(--dt-ok)' : '#E24B4A';
  }
}

async function loadAllData() {
  try {
    const [p, c, cu, sp, st, exp, retAll] = await Promise.allSettled([
      getProducts(), getCategories(), getCustomers(), getSuppliers(), getStaff(),
      getExpenses(), getReturns()
    ]);
    if (p.status   === 'fulfilled') products   = p.value   || [];
    if (c.status   === 'fulfilled') categories = c.value   || [];
    if (cu.status  === 'fulfilled') customers  = cu.value  || [];
    if (sp.status  === 'fulfilled') suppliers  = sp.value  || [];
    if (st.status  === 'fulfilled') staff      = st.value  || [];
    if (exp.status === 'fulfilled') expenses   = exp.value || [];
    if (retAll.status === 'fulfilled') {
      retailReturns    = (retAll.value || []).filter(r => r.sale_type === 'retail');
      wholesaleReturns = (retAll.value || []).filter(r => r.sale_type === 'wholesale');
    }
    // Load today's sales
    const todayBills = await getBillsForDate(new Date()).catch(() => []);
    if (todayBills.length > 0) {
      salesLog = todayBills;
      todaySales = todayBills.reduce((s, b) => s + Number(b.total || 0), 0);
      transactionCount = todayBills.length;
      itemsSold = todayBills.reduce((s, b) => s + (b.bill_items || []).reduce((ss, i) => ss + Number(i.quantity || 0), 0), 0);
    }
    showToast(isOnline ? 'Data loaded from cloud ☁' : 'Loaded from local storage (offline)', isOnline ? 'ok' : 'warn');
  } catch(e) {
    showToast('Data load error — running offline', 'warn');
  }
}

// ============================================================
// SHELL
// ============================================================
function buildShell(user) {
  const isMgr = user.role === 'manager';
  const navItems = [
    { id:'billing',   icon:'🧾', label:'Billing',    sub:'විකිණීම' },
    { id:'returns',   icon:'↩️', label:'Returns',    sub:'ආපසු' },
    ...(isMgr ? [
    { id:'dashboard', icon:'📊', label:'Dashboard',  sub:'දළ විශ්ලේෂණ' },
    { id:'inventory', icon:'📦', label:'Inventory',  sub:'තොග' },
    { id:'barcodes',  icon:'▦',  label:'Barcodes',   sub:'බාකෝඩ' },
    { id:'expenses',  icon:'💸', label:'Expenses',   sub:'වියදම්' },
    { id:'reports',   icon:'📈', label:'Reports',    sub:'වාර්තා' },
    { id:'customers', icon:'👥', label:'Customers',  sub:'ගනුදෙනු' },
    { id:'suppliers', icon:'🤝', label:'Suppliers',  sub:'සැපයුම්' },
    { id:'staff',     icon:'👤', label:'Staff',      sub:'කාර්ය' },
    { id:'ai',        icon:'✨', label:'AI Assist',  sub:'ව්‍යාපාර AI' },
    ] : [])
  ];

  return `
  <div style="display:flex;height:100vh;overflow:hidden;">
    <!-- SIDEBAR -->
    <div id="sidebar" class="sidebar no-print">
      <div class="sidebar-logo">
        <div style="width:36px;height:36px;background:var(--dt-gold);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">🧵</div>
        <div id="sidebarLogoText" style="overflow:hidden;transition:all 0.3s;">
          <div style="font-size:0.82rem;font-weight:600;color:var(--dt-gold-light);white-space:nowrap;">Deshan Textile</div>
          <div style="font-size:0.6rem;color:#5a4a30;white-space:nowrap;">POS v4</div>
        </div>
      </div>
      <button id="sidebarToggle" onclick="toggleSidebar()" style="width:100%;display:flex;align-items:center;justify-content:flex-end;padding:4px 10px 8px;background:none;color:#5a4a30;font-size:0.7rem;">
        <span id="toggleIcon" style="font-size:14px;transition:transform 0.3s;">◀</span>
      </button>
      <nav style="flex:1;overflow-y:auto;overflow-x:hidden;padding:0 8px;scrollbar-width:none;">
        ${navItems.map(n => `
        <div class="sidebar-item ${n.id==='billing'?'active':''}" id="nav${n.id.charAt(0).toUpperCase()+n.id.slice(1)}" onclick="switchTab('${n.id}')" title="${n.label}">
          <span class="sidebar-icon">${n.icon}</span>
          <div class="sidebar-label">
            <div style="font-size:0.79rem;font-weight:500;white-space:nowrap;">${n.label}</div>
            <div style="font-size:0.6rem;color:#8B7355;white-space:nowrap;">${n.sub}</div>
          </div>
        </div>`).join('')}
      </nav>
      <div style="padding:10px 8px;border-top:0.5px solid rgba(255,255,255,0.06);">
        <div id="langToggle" style="display:flex;gap:3px;background:rgba(255,255,255,0.05);border:0.5px solid rgba(184,134,11,0.25);border-radius:8px;padding:3px;margin-bottom:8px;overflow:hidden;">
          <button id="langEN" onclick="setReceiptLang('en')" style="flex:1;padding:4px 6px;border-radius:5px;font-size:0.68rem;font-weight:600;background:var(--dt-gold);color:var(--dt-dark);">EN</button>
          <button id="langSI" onclick="setReceiptLang('si')" style="flex:1;padding:4px 6px;border-radius:5px;font-size:0.68rem;font-weight:500;background:transparent;color:#8B7355;">සිං</button>
        </div>
        <div id="userBadge" style="display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:9px;background:rgba(255,255,255,0.04);margin-bottom:6px;overflow:hidden;">
          <div style="width:28px;height:28px;border-radius:50%;background:rgba(184,134,11,0.2);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">${user.role==='manager'?'👔':'🧾'}</div>
          <div id="userBadgeText" style="overflow:hidden;">
            <div style="font-size:0.74rem;font-weight:500;color:var(--dt-gold-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${user.name}</div>
            <div style="font-size:0.6rem;color:#8B7355;white-space:nowrap;">${user.role}</div>
          </div>
        </div>
        <div id="topTime" style="font-size:0.63rem;color:#5a4a30;text-align:center;margin-bottom:6px;overflow:hidden;white-space:nowrap;"></div>
        <button onclick="posLogout()" style="width:100%;padding:7px;background:rgba(226,75,74,0.08);color:#C87070;border-radius:8px;font-size:0.74rem;border:0.5px solid rgba(226,75,74,0.2);display:flex;align-items:center;justify-content:center;gap:6px;">
          <span>⏻</span><span id="logoutText" style="white-space:nowrap;overflow:hidden;">Logout</span>
        </button>
      </div>
    </div>

    <!-- MAIN CONTENT AREA -->
    <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;">
      <div style="background:white;border-bottom:0.5px solid var(--dt-border);padding:0 16px;height:44px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;" class="no-print">
        <div style="display:flex;align-items:center;gap:8px;">
          <span id="pageTitle" style="font-size:0.88rem;font-weight:500;color:var(--dt-text);">🧾 Billing</span>
          <span style="font-size:0.68rem;color:var(--dt-muted);">/ Deshan Textile POS</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span id="syncDot" style="font-size:0.68rem;color:#888;">● Connecting...</span>
        </div>
      </div>

      <div style="flex:1;overflow:hidden;display:flex;background:var(--dt-cream);">
        <div id="tabBilling"   class="tab-pane" style="display:flex;flex:1;overflow:hidden;">${buildBillingTab()}</div>
        <div id="tabReturns"   class="tab-pane" style="display:none;flex:1;overflow:auto;padding:16px;">${buildReturnsTab(isMgr)}</div>
        ${isMgr ? `
        <div id="tabDashboard" class="tab-pane" style="display:none;flex:1;overflow:auto;padding:16px;">${buildDashboardTab()}</div>
        <div id="tabInventory" class="tab-pane" style="display:none;flex:1;overflow:auto;padding:16px;">${buildInventoryTab()}</div>
        <div id="tabBarcodes"  class="tab-pane" style="display:none;flex:1;overflow:auto;padding:16px;">${buildBarcodesTab()}</div>
        <div id="tabExpenses"  class="tab-pane" style="display:none;flex:1;overflow:auto;padding:16px;">${buildExpensesTab()}</div>
        <div id="tabReports"   class="tab-pane" style="display:none;flex:1;overflow:auto;padding:16px;">${buildReportsTab()}</div>
        <div id="tabCustomers" class="tab-pane" style="display:none;flex:1;overflow:auto;padding:16px;">${buildCustomersTab()}</div>
        <div id="tabSuppliers" class="tab-pane" style="display:none;flex:1;overflow:auto;padding:16px;">${buildSuppliersTab()}</div>
        <div id="tabStaff"     class="tab-pane" style="display:none;flex:1;overflow:auto;padding:16px;">${buildStaffTab()}</div>
        <div id="tabAI"        class="tab-pane" style="display:none;flex:1;overflow:auto;padding:16px;">${buildAITab()}</div>
        ` : ''}
      </div>
    </div>
  </div>

  <div id="modalOverlay" style="display:none;position:fixed;inset:0;background:rgba(26,20,16,0.74);z-index:200;align-items:center;justify-content:center;padding:1rem;">
    <div id="modalBox" style="background:white;border-radius:14px;padding:1.5rem;width:100%;max-width:500px;max-height:92vh;overflow-y:auto;"></div>
  </div>
  `;
}

// ============================================================
// BILLING TAB
// ============================================================
function buildBillingTab() {
  return `
  <div id="productsPanel" style="flex:1;display:flex;flex-direction:column;overflow:hidden;padding:11px;">
    <div style="display:flex;gap:7px;margin-bottom:8px;">
      <input id="productSearch" placeholder="Search or scan barcode / භාණ්ඩය සොයන්න..." style="flex:1;" oninput="filterProducts(this.value)" />
    </div>
    <div id="categoryPills" style="display:flex;gap:5px;margin-bottom:8px;overflow-x:auto;flex-shrink:0;padding-bottom:3px;scrollbar-width:none;"></div>
    <div id="productsGrid" class="products-grid" style="overflow-y:auto;flex:1;align-content:start;padding-right:4px;"></div>
  </div>

  <div style="width:272px;background:white;border-left:0.5px solid var(--dt-border);display:flex;flex-direction:column;flex-shrink:0;">
    <div style="padding:9px 13px;border-bottom:0.5px solid var(--dt-border);display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:0.8rem;font-weight:500;color:var(--dt-text);">Current Bill / වත්මන් බිල්</div>
        <div id="currentBillNo" style="font-size:0.66rem;color:var(--dt-muted);">DT-0001</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <button onclick="holdCurrentBill()" title="Hold bill" style="font-size:0.68rem;padding:3px 8px;border:0.5px solid var(--dt-border);border-radius:5px;background:white;color:var(--dt-muted);">⏸</button>
        <button onclick="openHeldBills()" title="Recall held bill" style="font-size:0.68rem;padding:3px 8px;border:0.5px solid var(--dt-border);border-radius:5px;background:white;color:var(--dt-muted);" id="holdCount">📋</button>
        <div id="cartCount" style="background:var(--dt-dark);color:var(--dt-gold-light);border-radius:50%;width:21px;height:21px;font-size:0.68rem;font-weight:600;display:flex;align-items:center;justify-content:center;">0</div>
      </div>
    </div>

    <div style="padding:6px 12px;border-bottom:0.5px solid var(--dt-border);display:flex;gap:5px;">
      <button id="btnRetail"    onclick="setSaleType('retail')"    style="flex:1;padding:5px;font-size:0.72rem;border-radius:7px;border:0.5px solid var(--dt-gold);background:var(--dt-dark);color:var(--dt-gold-light);">සිල්ලර / Retail</button>
      <button id="btnWholesale" onclick="setSaleType('wholesale')" style="flex:1;padding:5px;font-size:0.72rem;border-radius:7px;border:0.5px solid var(--dt-border);background:white;color:var(--dt-muted);">තොග / Wholesale</button>
    </div>

    <div style="padding:7px 12px;border-bottom:0.5px solid var(--dt-border);">
      <input id="customerPhone" placeholder="Customer phone (optional)" style="font-size:0.73rem;padding:4px 9px;" oninput="lookupCustomer(this.value)" />
      <div id="customerInfo" style="font-size:0.67rem;margin-top:2px;min-height:12px;"></div>
    </div>

    <div id="cartItems" style="flex:1;overflow-y:auto;padding:7px;min-height:80px;max-height:240px;">
      <div style="text-align:center;color:var(--dt-muted);font-size:0.77rem;padding:1.8rem 1rem;">Tap products to add / නිෂ්පාදන ස්පර්ශ කරන්න</div>
    </div>

    <div style="padding:7px 13px;border-top:0.5px solid var(--dt-border);">
      <div style="display:flex;justify-content:space-between;font-size:0.74rem;color:var(--dt-muted);margin-bottom:3px;"><span>Subtotal / එකතුව</span><span id="subtotal">LKR 0</span></div>
      <div style="display:flex;gap:5px;margin-bottom:4px;">
        <input id="discountInput" type="number" min="0" max="100" placeholder="Discount % / වට්ටම්" style="font-size:0.72rem;padding:4px 8px;" />
        <button onclick="applyDiscount()" style="padding:4px 10px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:7px;font-size:0.7rem;white-space:nowrap;">Apply</button>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.73rem;color:var(--dt-muted);margin-bottom:2px;"><span>Discount / වට්ටම්</span><span id="discountAmt">LKR 0</span></div>
      <div id="loyaltyRow" style="display:none;justify-content:space-between;font-size:0.7rem;color:var(--dt-ok);margin-bottom:2px;"><span>Loyalty pts</span><span id="loyaltyPts">0</span></div>
      <div style="display:flex;justify-content:space-between;font-size:0.98rem;font-weight:600;color:var(--dt-text);margin-top:5px;padding-top:5px;border-top:0.5px solid var(--dt-border);"><span>TOTAL / මුළු</span><span id="billTotal">LKR 0</span></div>
    </div>

    <div style="padding:7px 11px;display:flex;flex-direction:column;gap:5px;border-top:0.5px solid var(--dt-border);">
      <button onclick="processPayment('cash')"   style="padding:10px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:10px;font-size:0.84rem;font-weight:500;">💵 Cash / මුදල්</button>
      <button onclick="processPayment('card')"   style="padding:10px;background:white;color:var(--dt-text);border-radius:10px;font-size:0.84rem;border:0.5px solid var(--dt-border);">💳 Card / කාඩ්</button>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;">
        <button onclick="processPayment('qr')"     style="padding:7px;background:white;color:var(--dt-text);border-radius:8px;font-size:0.7rem;border:0.5px solid var(--dt-border);">📱 QR</button>
        <button onclick="processPayment('credit')" style="padding:7px;background:white;color:#185FA5;border-radius:8px;font-size:0.7rem;border:0.5px solid rgba(30,100,200,0.3);">🏦 Credit</button>
        <button onclick="clearCart()"             style="padding:7px;color:var(--dt-low);background:white;border-radius:8px;font-size:0.7rem;border:0.5px solid rgba(226,75,74,0.3);">🗑 Clear</button>
      </div>
    </div>
  </div>
  `;
}

// ============================================================
// DASHBOARD TAB
// ============================================================
function buildDashboardTab() {
  return `<div style="max-width:1100px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <h2 style="font-size:1rem;font-weight:500;color:var(--dt-text);">📊 Dashboard</h2>
      <div style="display:flex;gap:7px;">
        <button onclick="sendDailySummaryWA()" style="padding:6px 12px;background:#25D366;color:white;border-radius:8px;font-size:0.77rem;">📱 WA Summary</button>
        <button onclick="downloadDayReport()" style="padding:6px 12px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:8px;font-size:0.77rem;">⬇ PDF Report</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:9px;margin-bottom:16px;">
      <div class="stat-card"><div class="stat-label">Revenue Today</div><div class="stat-value" id="dRevenue">LKR 0</div><div class="stat-sub" id="dRevSub">0 bills</div></div>
      <div class="stat-card"><div class="stat-label">Items Sold</div><div class="stat-value" id="dItems">0</div></div>
      <div class="stat-card"><div class="stat-label">Returns Today</div><div class="stat-value" id="dReturns" style="color:var(--dt-low);">LKR 0</div></div>
      <div class="stat-card"><div class="stat-label">Net Revenue</div><div class="stat-value" id="dNet" style="color:var(--dt-ok);">LKR 0</div></div>
      <div class="stat-card"><div class="stat-label">Low Stock</div><div class="stat-value" id="dLow" style="color:var(--dt-low);">0</div><div class="stat-sub" style="color:var(--dt-low);">items</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;"><span style="font-size:0.83rem;font-weight:500;">Low Stock Alerts 🚨</span><button onclick="alertLowStock()" style="padding:4px 9px;background:#25D366;color:white;border-radius:7px;font-size:0.7rem;">📱 Alert</button></div><div id="lowStockList" style="font-size:0.76rem;color:var(--dt-muted);">Loading...</div></div>
      <div class="card"><div style="font-size:0.83rem;font-weight:500;margin-bottom:10px;">Recent Bills</div><div id="recentBills" style="font-size:0.74rem;color:var(--dt-muted);">No bills yet.</div></div>
    </div>
  </div>`;
}

// ============================================================
// INVENTORY TAB
// ============================================================
function buildInventoryTab() {
  return `<div style="max-width:1100px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:13px;">
      <h2 style="font-size:1rem;font-weight:500;">📦 Inventory Management</h2>
      <div style="display:flex;gap:7px;">
        <button onclick="alertLowStock()" style="padding:6px 11px;background:#25D366;color:white;border-radius:8px;font-size:0.77rem;">📱 Low Stock WA</button>
        <button onclick="openCategoryModal()" style="padding:6px 11px;background:white;color:var(--dt-text);border-radius:8px;font-size:0.77rem;border:0.5px solid var(--dt-border);">+ Category</button>
        <button onclick="openProductModal(null)" style="padding:6px 13px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:8px;font-size:0.8rem;font-weight:500;">+ Add Product</button>
      </div>
    </div>
    <input placeholder="Search products..." style="margin-bottom:9px;" oninput="filterInventory(this.value)" id="invSearch">
    <div style="overflow-x:auto;border-radius:10px;border:0.5px solid var(--dt-border);">
      <table class="dt-table" id="invTable">
        <thead><tr>
          <th style="width:24%;">Product</th><th style="width:11%;">SKU</th>
          <th style="width:12%;">Barcode</th>
          <th style="width:12%;">Sell Price</th><th style="width:10%;">Cost</th>
          <th style="width:7%;">Stock</th><th style="width:6%;">Min</th>
          <th style="width:9%;">Margin</th><th style="width:9%;">Actions</th>
        </tr></thead>
        <tbody id="invBody"><tr><td colspan="9" style="text-align:center;color:var(--dt-muted);padding:2rem;">No products yet. Click + Add Product to begin.</td></tr></tbody>
      </table>
    </div>
  </div>`;
}

// ============================================================
// BARCODES TAB
// ============================================================
function buildBarcodesTab() {
  return `<div style="max-width:1100px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:13px;">
      <div>
        <h2 style="font-size:1rem;font-weight:500;">▦ Barcode Manager</h2>
        <p style="font-size:0.72rem;color:var(--dt-muted);margin-top:2px;">Generate, preview, and print product barcode labels</p>
      </div>
      <div style="display:flex;gap:7px;">
        <button onclick="selectAllBarcodes()" style="padding:6px 12px;background:white;color:var(--dt-text);border-radius:8px;font-size:0.77rem;border:0.5px solid var(--dt-border);">☑ Select All</button>
        <button onclick="printSelectedBarcodes()" style="padding:6px 13px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:8px;font-size:0.8rem;font-weight:500;">🖨 Print Selected</button>
      </div>
    </div>
    <input placeholder="Search products for barcodes..." id="bcSearch" style="margin-bottom:12px;" oninput="filterBarcodeList(this.value)">
    <div id="barcodeGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;"></div>
  </div>`;
}

// ============================================================
// RETURNS TAB
// ============================================================
function buildReturnsTab(isMgrRole) {
  if (!isMgrRole) {
    return `<div style="max-width:900px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:13px;">
      <div>
        <h2 style="font-size:1rem;font-weight:500;">↩️ Retail Returns / සිල්ලර ආපසු</h2>
        <p style="font-size:0.72rem;color:var(--dt-muted);margin-top:2px;">Process customer returns for retail bills</p>
      </div>
      <button onclick="openReturnModal('retail')" style="padding:8px 16px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:8px;font-size:0.82rem;font-weight:500;">↩ New Return</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin-bottom:14px;">
      <div class="stat-card"><div class="stat-label">Retail Returns Today</div><div class="stat-value" id="rtnRetailCount" style="color:var(--dt-low);">0</div></div>
      <div class="stat-card"><div class="stat-label">Refund Total Today</div><div class="stat-value" id="rtnRetailAmt" style="color:var(--dt-low);font-size:1rem;">LKR 0</div></div>
    </div>
    <div style="overflow-x:auto;border-radius:10px;border:0.5px solid var(--dt-border);">
      <table class="dt-table">
        <thead><tr><th style="width:20%;">Return No</th><th style="width:18%;">Orig. Bill</th><th style="width:14%;">Date</th><th style="width:22%;">Reason</th><th style="width:14%;">Total</th><th style="width:12%;">Print</th></tr></thead>
        <tbody id="returnBody"><tr><td colspan="6" style="text-align:center;color:var(--dt-muted);padding:2rem;">No returns today.</td></tr></tbody>
      </table>
    </div>
  </div>`;
  }

  return `<div style="max-width:1100px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:13px;">
      <h2 style="font-size:1rem;font-weight:500;">↩️ Returns Management</h2>
      <div style="display:flex;gap:7px;">
        <button onclick="openReturnModal('retail')"    style="padding:6px 13px;background:white;color:var(--dt-text);border-radius:8px;font-size:0.79rem;border:0.5px solid var(--dt-border);">↩ Retail Return</button>
        <button onclick="openReturnModal('wholesale')" style="padding:6px 13px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:8px;font-size:0.79rem;">↩ Wholesale Return</button>
      </div>
    </div>
    <div style="display:flex;gap:0;border-bottom:0.5px solid var(--dt-border);margin-bottom:14px;">
      <button id="rtnTabRetail"    onclick="switchReturnTab('retail')"    style="padding:8px 18px;font-size:0.79rem;font-weight:500;border-bottom:2px solid var(--dt-gold);color:var(--dt-gold);background:none;border-top:none;border-left:none;border-right:none;">Retail</button>
      <button id="rtnTabWholesale" onclick="switchReturnTab('wholesale')" style="padding:8px 18px;font-size:0.79rem;font-weight:500;border-bottom:2px solid transparent;color:var(--dt-muted);background:none;border-top:none;border-left:none;border-right:none;">Wholesale</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:14px;">
      <div class="stat-card"><div class="stat-label">Retail Returns</div><div class="stat-value" id="rtnRetailCount" style="color:var(--dt-low);">0</div></div>
      <div class="stat-card"><div class="stat-label">Retail Refund</div><div class="stat-value" id="rtnRetailAmt" style="color:var(--dt-low);font-size:1rem;">LKR 0</div></div>
      <div class="stat-card"><div class="stat-label">Wholesale Returns</div><div class="stat-value" id="rtnWholesaleCount" style="color:var(--dt-warn);">0</div></div>
      <div class="stat-card"><div class="stat-label">Wholesale Refund</div><div class="stat-value" id="rtnWholesaleAmt" style="color:var(--dt-warn);font-size:1rem;">LKR 0</div></div>
    </div>
    <div style="overflow-x:auto;border-radius:10px;border:0.5px solid var(--dt-border);">
      <table class="dt-table">
        <thead><tr><th style="width:18%;">Return No</th><th style="width:16%;">Orig. Bill</th><th style="width:12%;">Date</th><th style="width:12%;">Type</th><th style="width:20%;">Reason</th><th style="width:13%;">Total</th><th style="width:9%;">Print</th></tr></thead>
        <tbody id="returnBody"><tr><td colspan="7" style="text-align:center;color:var(--dt-muted);padding:2rem;">No returns recorded.</td></tr></tbody>
      </table>
    </div>
  </div>`;
}

// ============================================================
// EXPENSES TAB
// ============================================================
function buildExpensesTab() {
  const mn = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
  return `<div style="max-width:900px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:13px;">
      <h2 style="font-size:1rem;font-weight:500;">💸 Expense Tracker</h2>
      <div style="display:flex;gap:7px;align-items:center;">
        <input type="month" id="expMonth" value="${mn}" onchange="loadExpenses(this.value)" style="font-size:0.77rem;padding:5px 9px;">
        <button onclick="openExpenseModal()" style="padding:6px 13px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:8px;font-size:0.79rem;font-weight:500;">+ Add Expense</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:9px;margin-bottom:15px;">
      <div class="stat-card"><div class="stat-label">Total Expenses</div><div class="stat-value" id="expTotal" style="color:var(--dt-low);">LKR 0</div><div class="stat-sub" id="expCount">0 entries</div></div>
      <div class="stat-card"><div class="stat-label">Revenue</div><div class="stat-value" id="expRevenue">LKR 0</div></div>
      <div class="stat-card"><div class="stat-label">Net Profit</div><div class="stat-value" id="expProfit" style="color:var(--dt-ok);">LKR 0</div></div>
    </div>
    <div style="overflow-x:auto;border-radius:10px;border:0.5px solid var(--dt-border);">
      <table class="dt-table">
        <thead><tr><th style="width:12%;">Date</th><th style="width:18%;">Category</th><th style="width:38%;">Description</th><th style="width:18%;">Amount</th><th style="width:9%;">By</th><th style="width:5%;">Del</th></tr></thead>
        <tbody id="expBody"><tr><td colspan="6" style="text-align:center;color:var(--dt-muted);padding:2rem;">No expenses. Click + Add Expense.</td></tr></tbody>
      </table>
    </div>
  </div>`;
}

// ============================================================
// REPORTS TAB
// ============================================================
function buildReportsTab() {
  return `<div style="max-width:900px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:13px;">
      <h2 style="font-size:1rem;font-weight:500;">📈 Reports / වාර්තා</h2>
      <div style="display:flex;gap:7px;">
        <input type="date" id="reportDate" value="${new Date().toISOString().split('T')[0]}" onchange="loadDayReport(this.value)" style="font-size:0.77rem;padding:5px 9px;">
        <button onclick="downloadDayReport()" style="padding:6px 13px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:8px;font-size:0.77rem;">⬇ PDF</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:9px;margin-bottom:14px;">
      <div class="stat-card"><div class="stat-label">Revenue</div><div class="stat-value" id="rRevenue">LKR 0</div></div>
      <div class="stat-card"><div class="stat-label">Bills</div><div class="stat-value" id="rTxns">0</div></div>
      <div class="stat-card"><div class="stat-label">Discounts</div><div class="stat-value" id="rDisc">LKR 0</div></div>
      <div class="stat-card"><div class="stat-label">Cash / Card</div><div class="stat-value" id="rCash" style="font-size:1rem;">—</div></div>
      <div class="stat-card"><div class="stat-label">Returns</div><div class="stat-value" id="rRet" style="color:var(--dt-low);">LKR 0</div></div>
    </div>
    <div class="card"><div style="font-size:0.83rem;font-weight:500;margin-bottom:10px;">Transactions</div><div id="reportTxnList" style="font-size:0.77rem;color:var(--dt-muted);">Select a date above.</div></div>
  </div>`;
}

// ============================================================
// CUSTOMERS / SUPPLIERS / STAFF / AI TABS
// ============================================================
function buildCustomersTab() {
  return `<div style="max-width:900px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:13px;">
      <h2 style="font-size:1rem;font-weight:500;">👥 Customer Management</h2>
      <button onclick="openCustomerModal(null)" style="padding:6px 13px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:8px;font-size:0.79rem;font-weight:500;">+ Add Customer</button>
    </div>
    <input placeholder="Search customers..." id="custSearch" oninput="filterCustomerTable(this.value)" style="margin-bottom:9px;">
    <div style="overflow-x:auto;border-radius:10px;border:0.5px solid var(--dt-border);">
      <table class="dt-table">
        <thead><tr><th style="width:22%;">Name</th><th style="width:18%;">Phone</th><th style="width:18%;">Total Spent</th><th style="width:14%;">Loyalty Pts</th><th style="width:18%;">Address</th><th style="width:10%;">Edit</th></tr></thead>
        <tbody id="custBody"><tr><td colspan="6" style="text-align:center;color:var(--dt-muted);padding:2rem;">No customers yet.</td></tr></tbody>
      </table>
    </div>
  </div>`;
}

function buildSuppliersTab() {
  return `<div style="max-width:900px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:13px;">
      <h2 style="font-size:1rem;font-weight:500;">🤝 Supplier Management</h2>
      <button onclick="openSupplierModal(null)" style="padding:6px 13px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:8px;font-size:0.79rem;font-weight:500;">+ Add Supplier</button>
    </div>
    <div style="overflow-x:auto;border-radius:10px;border:0.5px solid var(--dt-border);">
      <table class="dt-table">
        <thead><tr><th style="width:25%;">Name</th><th style="width:20%;">Phone</th><th style="width:20%;">Email</th><th style="width:25%;">Address</th><th style="width:10%;">Edit</th></tr></thead>
        <tbody id="suppBody"><tr><td colspan="5" style="text-align:center;color:var(--dt-muted);padding:2rem;">No suppliers yet.</td></tr></tbody>
      </table>
    </div>
  </div>`;
}

function buildStaffTab() {
  return `<div style="max-width:800px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:13px;">
      <h2 style="font-size:1rem;font-weight:500;">👤 Staff Management</h2>
      <button onclick="openStaffModal(null)" style="padding:6px 13px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:8px;font-size:0.79rem;font-weight:500;">+ Add Staff</button>
    </div>
    <div style="overflow-x:auto;border-radius:10px;border:0.5px solid var(--dt-border);">
      <table class="dt-table">
        <thead><tr><th style="width:30%;">Name</th><th style="width:20%;">Role</th><th style="width:15%;">Status</th><th style="width:20%;">Change PIN</th><th style="width:15%;">Actions</th></tr></thead>
        <tbody id="staffBody"><tr><td colspan="5" style="text-align:center;color:var(--dt-muted);padding:2rem;">No staff records.</td></tr></tbody>
      </table>
    </div>
  </div>`;
}

function buildAITab() {
  const chips = (typeof AI_QUICK_ACTIONS !== 'undefined' ? AI_QUICK_ACTIONS : []).map(a=>`<button class="ai-chip" onclick="aiQuickAsk('${a.prompt.replace(/'/g,"\\'")}')"> ${a.label}</button>`).join('');
  return `<div style="max-width:720px;margin:0 auto;">
    <h2 style="font-size:1rem;font-weight:500;margin-bottom:4px;">✨ AI Business Assistant</h2>
    <p style="font-size:0.77rem;color:var(--dt-muted);margin-bottom:10px;">Powered by Google Gemini — knows your live sales & expenses.</p>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;" id="aiChips">${chips}</div>
    <div style="background:white;border:0.5px solid var(--dt-border);border-radius:14px;display:flex;flex-direction:column;">
      <div id="aiMessages" style="overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:9px;min-height:300px;max-height:400px;">
        <div style="max-width:86%;"><div style="font-size:0.66rem;color:var(--dt-muted);margin-bottom:3px;">Deshan AI</div>
        <div style="background:var(--dt-cream);padding:9px 13px;border-radius:4px 12px 12px 12px;font-size:0.82rem;line-height:1.6;color:var(--dt-text);">ආයුබෝවන්! I can help with sales analysis, reorder planning, pricing, and business insights. Ask me anything!</div></div>
      </div>
      <div style="display:flex;gap:7px;padding:9px 11px;border-top:0.5px solid var(--dt-border);">
        <input id="aiInput" placeholder="Ask about your business..." style="flex:1;" onkeydown="if(event.key==='Enter')sendAIMessage()">
        <button onclick="sendAIMessage()" style="padding:7px 15px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:9px;font-size:0.82rem;">Ask ↗</button>
      </div>
    </div>
  </div>`;
}

// ============================================================
// RECEIPT LANGUAGE
// ============================================================
window.setReceiptLang = (lang) => {
  receiptLang = lang;
  ['EN','SI'].forEach(l => {
    const btn = document.getElementById('lang'+l);
    if (btn) { btn.style.background = lang === l.toLowerCase() ? 'var(--dt-gold)' : 'transparent'; btn.style.color = lang === l.toLowerCase() ? 'var(--dt-dark)' : '#8B7355'; }
  });
};

// ============================================================
// TABS
// ============================================================
function initTabs() {
  const pageTitles = {
    billing:'🧾 Billing', dashboard:'📊 Dashboard', inventory:'📦 Inventory',
    barcodes:'▦ Barcodes', returns:'↩️ Returns', expenses:'💸 Expenses',
    reports:'📈 Reports', customers:'👥 Customers', suppliers:'🤝 Suppliers',
    staff:'👤 Staff', ai:'✨ AI Assistant'
  };
  window.switchTab = (tab) => {
    activeTab = tab;
    document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.sidebar-item').forEach(t => t.classList.remove('active'));
    const pane = document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if (pane) pane.style.display = tab === 'billing' ? 'flex' : 'block';
    const nav = document.getElementById('nav' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if (nav) nav.classList.add('active');
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = pageTitles[tab] || tab;
    if (tab === 'dashboard')  loadDashboard();
    if (tab === 'inventory')  renderInventoryTable();
    if (tab === 'barcodes')   renderBarcodeList();
    if (tab === 'returns')    loadReturnsTab();
    if (tab === 'expenses')   loadExpenses();
    if (tab === 'reports')    loadDayReport(new Date().toISOString().split('T')[0]);
    if (tab === 'customers')  renderCustomersTable();
    if (tab === 'suppliers')  renderSuppliersTable();
    if (tab === 'staff')      renderStaffTable();
  };
}

// ============================================================
// PRODUCTS & CATEGORIES
// ============================================================
function renderCategories() {
  const cats = ['All', ...categories.map(c => c.name)];
  const el = document.getElementById('categoryPills'); if (!el) return;
  el.innerHTML = cats.map((c, i) => `<button onclick="filterCat('${c.replace(/'/g,"\\'")}',this)" style="padding:4px 11px;border-radius:20px;border:0.5px solid var(--dt-border);background:${i===0?'var(--dt-dark)':'white'};color:${i===0?'var(--dt-gold-light)':'#5F5E5A'};font-size:0.7rem;font-weight:500;cursor:pointer;white-space:nowrap;flex-shrink:0;">${c}</button>`).join('');
}

window.filterCat = (cat, el) => {
  activeCat = cat;
  document.querySelectorAll('#categoryPills button').forEach(b => { b.style.background = 'white'; b.style.color = '#5F5E5A'; });
  el.style.background = 'var(--dt-dark)'; el.style.color = 'var(--dt-gold-light)';
  filterProducts(document.getElementById('productSearch')?.value || '');
};

window.filterProducts = (q) => {
  const filtered = products.filter(p => {
    const cat = p.categories?.name || 'Other';
    const matchCat = activeCat === 'All' || cat === activeCat;
    const matchQ   = !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.barcode === q || (p.sku || '').toLowerCase().includes(q.toLowerCase());
    return matchCat && matchQ;
  });
  renderProductGrid(filtered);
};

function renderProductGrid(list) {
  const el = document.getElementById('productsGrid'); if (!el) return;
  const items = list !== undefined ? list : products;
  if (items.length === 0) {
    el.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--dt-muted);padding:3rem;font-size:0.83rem;">${products.length === 0 ? 'No products yet. Ask manager to add products.' : 'No products found'}</div>`;
    return;
  }
  el.innerHTML = items.map(p => {
    const low = p.stock <= p.min_stock; const mid = p.stock <= p.min_stock * 1.5 && !low;
    return `<div class="product-card" onclick="addToCart('${p.id}')">
      <span style="font-size:26px;display:block;margin-bottom:4px;">${p.emoji || '🧵'}</span>
      <div style="font-size:0.68rem;font-weight:500;color:var(--dt-text);margin-bottom:2px;line-height:1.3;">${p.name}</div>
      <div style="font-size:0.75rem;color:var(--dt-gold);font-weight:600;">LKR ${Number(p.price).toLocaleString()}</div>
      <div style="font-size:0.6rem;color:${low?'var(--dt-low)':mid?'var(--dt-warn)':'var(--dt-muted)'};">${low?'⚠️ ':''}${p.stock} ${(p.unit||'').split(' ')[0]||''}</div>
    </div>`;
  }).join('');
}

// ============================================================
// CART
// ============================================================
window.setSaleType = (type) => {
  saleType = type;
  const btnR = document.getElementById('btnRetail');
  const btnW = document.getElementById('btnWholesale');
  if (btnR) { btnR.style.background = type==='retail' ? 'var(--dt-dark)' : 'white'; btnR.style.color = type==='retail' ? 'var(--dt-gold-light)' : 'var(--dt-muted)'; btnR.style.borderColor = type==='retail' ? 'var(--dt-gold)' : 'var(--dt-border)'; }
  if (btnW) { btnW.style.background = type==='wholesale' ? 'var(--dt-dark)' : 'white'; btnW.style.color = type==='wholesale' ? 'var(--dt-gold-light)' : 'var(--dt-muted)'; btnW.style.borderColor = type==='wholesale' ? 'var(--dt-gold)' : 'var(--dt-border)'; }
  if (type === 'wholesale' && discount === 0) { discount = 10; const di = document.getElementById('discountInput'); if (di) di.value = 10; updateTotals(); }
};

window.addToCart = (id) => {
  const p = products.find(x => x.id === id); if (!p) return;
  if (p.stock <= 0) { showToast(`${p.name} is out of stock!`, 'warn'); return; }
  const ex = cart.find(x => x.id === id);
  if (ex) {
    if (ex.qty >= p.stock) { showToast(`Only ${p.stock} in stock!`, 'warn'); return; }
    ex.qty++;
  } else {
    cart.push({ ...p, qty: 1 });
  }
  renderCart();
};

window.changeQty = (id, d) => {
  const item = cart.find(x => x.id === id); if (!item) return;
  const product = products.find(x => x.id === id);
  if (d > 0 && product && item.qty >= product.stock) { showToast(`Only ${product.stock} in stock!`, 'warn'); return; }
  item.qty += d;
  if (item.qty <= 0) cart = cart.filter(x => x.id !== id);
  renderCart();
};

window.setItemPrice = (id, val) => {
  const item = cart.find(x => x.id === id);
  if (item) { const price = parseFloat(val); if (price >= 0) { item.price = price; updateTotals(); } }
};

window.clearCart = () => {
  cart = []; discount = 0; currentCustomer = null; saleType = 'retail';
  const di = document.getElementById('discountInput'); if (di) di.value = '';
  const cp = document.getElementById('customerPhone'); if (cp) cp.value = '';
  const ci = document.getElementById('customerInfo'); if (ci) ci.textContent = '';
  const lr = document.getElementById('loyaltyRow'); if (lr) lr.style.display = 'none';
  window.setSaleType('retail');
  renderCart();
};

function renderCart() {
  const el = document.getElementById('cartItems'); if (!el) return;
  const cartCountEl = document.getElementById('cartCount');
  if (cartCountEl) cartCountEl.textContent = cart.reduce((s, i) => s + i.qty, 0);
  if (cart.length === 0) {
    el.innerHTML = `<div style="text-align:center;color:var(--dt-muted);font-size:0.76rem;padding:1.8rem 1rem;">Tap products to add</div>`;
    updateTotals(); return;
  }
  el.innerHTML = cart.map(item => `
    <div style="display:flex;align-items:center;gap:4px;padding:5px;border-radius:7px;margin-bottom:3px;" onmouseenter="this.style.background='var(--dt-cream)'" onmouseleave="this.style.background='transparent'">
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.73rem;font-weight:500;color:var(--dt-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.emoji||''} ${item.name}</div>
        <input type="number" value="${item.price}" min="0" step="0.01" onchange="setItemPrice('${item.id}',this.value)" style="font-size:0.66rem;padding:2px 5px;width:88px;margin-top:1px;" title="Edit price">
      </div>
      <div style="display:flex;align-items:center;gap:3px;flex-shrink:0;">
        <button onclick="changeQty('${item.id}',-1)" style="width:18px;height:18px;border-radius:50%;border:0.5px solid var(--dt-border);background:white;font-size:12px;display:flex;align-items:center;justify-content:center;">−</button>
        <span style="font-size:0.76rem;font-weight:500;min-width:15px;text-align:center;">${item.qty}</span>
        <button onclick="changeQty('${item.id}',1)"  style="width:18px;height:18px;border-radius:50%;border:0.5px solid var(--dt-border);background:white;font-size:12px;display:flex;align-items:center;justify-content:center;">+</button>
      </div>
      <div style="font-size:0.73rem;font-weight:500;min-width:50px;text-align:right;">LKR ${(item.price*item.qty).toLocaleString()}</div>
    </div>`).join('');
  updateTotals();
}

function updateTotals() {
  const sub  = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const disc = sub * (discount / 100);
  const total = sub - disc;
  const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setEl('subtotal',    'LKR ' + sub.toLocaleString());
  setEl('discountAmt', 'LKR ' + Math.round(disc).toLocaleString());
  setEl('billTotal',   'LKR ' + Math.round(total).toLocaleString());
  const lr = document.getElementById('loyaltyRow');
  if (currentCustomer && lr) {
    lr.style.display = 'flex';
    setEl('loyaltyPts', (currentCustomer.loyalty_points || 0) + ' pts (earn +' + Math.floor(total / 100) + ')');
  }
}

window.applyDiscount = () => {
  const v = parseFloat(document.getElementById('discountInput')?.value) || 0;
  discount = Math.min(100, Math.max(0, v));
  updateTotals();
};

// ============================================================
// HOLD BILLS
// ============================================================
window.holdCurrentBill = () => {
  if (cart.length === 0) { showToast('Cart is empty!', 'warn'); return; }
  holdBills.push({ cart: cart.map(i => ({ ...i })), discount, saleType, customer: currentCustomer, heldAt: new Date() });
  clearCart();
  showToast('Bill held! ⏸', 'ok');
  const hc = document.getElementById('holdCount');
  if (hc) hc.textContent = `📋 ${holdBills.length}`;
};

window.openHeldBills = () => {
  if (holdBills.length === 0) { showToast('No held bills', 'warn'); return; }
  openModal(`<h3 style="font-size:0.95rem;font-weight:500;margin-bottom:1rem;">⏸ Held Bills (${holdBills.length})</h3>` +
    holdBills.map((b, i) => `<div style="border:0.5px solid var(--dt-border);border-radius:10px;padding:9px;margin-bottom:7px;display:flex;justify-content:space-between;align-items:center;">
      <div><div style="font-size:0.8rem;font-weight:500;">${b.cart.length} items · LKR ${b.cart.reduce((s,x)=>s+x.price*x.qty,0).toLocaleString()}</div>
      <div style="font-size:0.68rem;color:var(--dt-muted);">${b.heldAt.toLocaleTimeString('en-LK',{hour:'2-digit',minute:'2-digit'})} · ${b.saleType}</div></div>
      <button onclick="recallBill(${i})" style="padding:5px 11px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:7px;font-size:0.76rem;">Recall</button>
    </div>`).join('') +
    `<button onclick="closeModal()" style="width:100%;padding:8px;border:0.5px solid var(--dt-border);border-radius:9px;margin-top:6px;font-size:0.83rem;">Close</button>`
  );
};

window.recallBill = (i) => {
  const b = holdBills.splice(i, 1)[0];
  cart = b.cart; discount = b.discount; saleType = b.saleType; currentCustomer = b.customer;
  if (b.customer) { const cp = document.getElementById('customerPhone'); if (cp) cp.value = b.customer.phone || ''; lookupCustomer(b.customer.phone); }
  const di = document.getElementById('discountInput'); if (di) di.value = b.discount;
  window.setSaleType(b.saleType);
  renderCart();
  closeModal();
  const hc = document.getElementById('holdCount');
  if (hc) hc.textContent = holdBills.length > 0 ? `📋 ${holdBills.length}` : '📋';
  showToast('Bill recalled!', 'ok');
};

// ============================================================
// CUSTOMER LOOKUP
// ============================================================
window.lookupCustomer = async (phone) => {
  const infoEl = document.getElementById('customerInfo'); if (!infoEl) return;
  const cleaned = (phone || '').replace(/\D/g, '');
  if (cleaned.length < 9) { infoEl.textContent = ''; currentCustomer = null; const lr = document.getElementById('loyaltyRow'); if (lr) lr.style.display = 'none'; return; }
  try {
    const c = await findCustomer(phone.trim());
    if (c) { currentCustomer = c; infoEl.textContent = `${c.name} · ${c.loyalty_points||0} pts · LKR ${Number(c.total_spent||0).toLocaleString()}`; infoEl.style.color = 'var(--dt-ok)'; const lr = document.getElementById('loyaltyRow'); if (lr) lr.style.display = 'flex'; updateTotals(); }
    else { infoEl.textContent = 'New customer'; infoEl.style.color = 'var(--dt-warn)'; currentCustomer = null; }
  } catch { infoEl.textContent = ''; }
};

// ============================================================
// PAYMENT
// ============================================================
window.processPayment = async (method) => {
  if (cart.length === 0) { showToast('Add items first!', 'warn'); return; }
  const sub     = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discAmt = sub * (discount / 100);
  const total   = sub - discAmt;
  const billData = { subtotal: sub, discount_percent: discount, discount_amount: discAmt, tax_amount: 0, total, payment_method: method, cashier_name: currentUser.name, sale_type: saleType, customer_id: currentCustomer?.id };

  let savedBill = null;
  try {
    savedBill = await saveBill(billData, cart, currentUser.id);
  } catch (e) {
    billCounter++;
    const today = new Date();
    const prefix = `DT${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    savedBill = { ...billData, bill_number: `${prefix}-${String(billCounter).padStart(4,'0')}`, created_at: new Date().toISOString(), items: cart.map(i => ({ ...i, product_name: i.name, unit_price: i.price, quantity: i.qty, total: i.price * i.qty })) };
  }

  todaySales += total; transactionCount++; itemsSold += cart.reduce((s, i) => s + i.qty, 0);
  salesLog.push(savedBill);

  // Update local stock display
  cart.forEach(item => {
    const p = products.find(x => x.id === item.id);
    if (p) p.stock = Math.max(0, p.stock - item.qty);
  });
  renderProductGrid();

  showReceiptModal(savedBill);
  clearCart();
};

// ============================================================
// RECEIPT MODAL
// ============================================================
function showReceiptModal(bill) {
  const phone = document.getElementById('customerPhone')?.value || '';
  openModal(`
    <div style="display:flex;align-items:center;gap:9px;background:var(--dt-dark);margin:-1.5rem -1.5rem 1rem;padding:1rem 1.5rem;border-radius:14px 14px 0 0;">
      <span style="font-size:20px;">🧵</span>
      <div><div style="font-size:0.9rem;font-weight:600;color:var(--dt-gold-light);">Receipt / රිසිට්පත</div>
      <div style="font-size:0.68rem;color:#8B7355;">${bill.bill_number} · ${(bill.sale_type||'retail').toUpperCase()}</div></div>
    </div>
    <div style="font-size:0.74rem;color:var(--dt-muted);margin-bottom:3px;">${new Date(bill.created_at).toLocaleString('en-LK')}</div>
    <div style="font-size:0.74rem;color:var(--dt-muted);margin-bottom:10px;">Payment: <strong>${(bill.payment_method||'cash').toUpperCase()}</strong></div>
    <hr style="border:none;border-top:1px dashed #ccc;margin:8px 0;">
    ${(bill.items||[]).map(i=>`<div style="display:flex;justify-content:space-between;font-size:0.79rem;margin-bottom:4px;"><span>${i.product_name||i.name} × ${i.quantity||i.qty}</span><span>LKR ${Number(i.total||(i.price*i.qty)).toLocaleString()}</span></div>`).join('')}
    <hr style="border:none;border-top:1px dashed #ccc;margin:8px 0;">
    ${bill.discount_amount > 0 ? `<div style="display:flex;justify-content:space-between;font-size:0.74rem;color:var(--dt-muted);margin-bottom:3px;"><span>Discount (${bill.discount_percent}%)</span><span>−LKR ${Number(bill.discount_amount).toLocaleString()}</span></div>` : ''}
    <div style="display:flex;justify-content:space-between;font-size:0.98rem;font-weight:600;color:var(--dt-text);margin-top:6px;"><span>TOTAL / මුළු</span><span>LKR ${Number(bill.total).toLocaleString()}</span></div>
    <div style="text-align:center;margin-top:12px;font-size:0.74rem;color:var(--dt-muted);">ස්තූතියි! Thank you for shopping at Deshan Textile 🙏</div>
    <div style="margin-top:12px;">
      <div style="font-size:0.72rem;color:var(--dt-muted);margin-bottom:5px;">Receipt Language:</div>
      <div style="display:flex;gap:5px;margin-bottom:10px;">
        <button onclick="window._pLang='en';this.style.background='var(--dt-dark)';this.style.color='var(--dt-gold-light)';this.nextElementSibling.style.background='white';this.nextElementSibling.style.color='var(--dt-text)';" style="flex:1;padding:5px;border:0.5px solid var(--dt-border);border-radius:7px;font-size:0.74rem;background:var(--dt-dark);color:var(--dt-gold-light);">English</button>
        <button onclick="window._pLang='si';this.style.background='var(--dt-dark)';this.style.color='var(--dt-gold-light)';this.previousElementSibling.style.background='white';this.previousElementSibling.style.color='var(--dt-text)';" style="flex:1;padding:5px;border:0.5px solid var(--dt-border);border-radius:7px;font-size:0.74rem;background:white;">සිංහල</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
      <button onclick="doPrint()" style="padding:9px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:9px;font-size:0.79rem;">🖨 Print</button>
      <button onclick="doDownload()" style="padding:9px;background:white;color:var(--dt-text);border-radius:9px;font-size:0.79rem;border:0.5px solid var(--dt-border);">⬇ PDF</button>
    </div>
    ${phone ? `<button onclick="doWA()" style="width:100%;margin-top:6px;padding:9px;background:#25D366;color:white;border-radius:9px;font-size:0.79rem;">📱 WhatsApp Receipt</button>` : ''}
    <button onclick="closeModal()" style="width:100%;margin-top:6px;padding:9px;background:var(--dt-cream);color:var(--dt-text);border-radius:9px;font-size:0.79rem;border:0.5px solid var(--dt-border);">Close</button>
  `);
  window._pLang = receiptLang;
  window.doPrint    = () => printReceipt(bill, window._pLang || 'en');
  window.doDownload = () => downloadReceipt(bill, window._pLang || 'en');
  window.doWA       = () => { if (phone) sendReceiptViaWhatsApp(bill, phone, window._pLang || 'en'); };
}

// ============================================================
// BARCODE SCANNING
// ============================================================
function handleBarcodeScan(code) {
  const p = products.find(x => x.barcode === code || x.sku === code);
  if (p) {
    addToCart(p.id);
    showToast(`${p.name} added 📦`, 'ok');
    const i = document.getElementById('productSearch');
    if (i) { i.value = ''; filterProducts(''); }
  } else {
    const i = document.getElementById('productSearch');
    if (i) { i.value = code; filterProducts(code); }
    showToast(`Barcode: ${code} — not found`, 'warn');
  }
}

// ============================================================
// BARCODE GENERATION (Barcodes Tab)
// ============================================================
function renderBarcodeList(filter = '') {
  const grid = document.getElementById('barcodeGrid'); if (!grid) return;
  const list = products.filter(p => !filter || p.name.toLowerCase().includes(filter.toLowerCase()));
  if (list.length === 0) { grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--dt-muted);padding:3rem;">No products found.</div>'; return; }

  grid.innerHTML = list.map(p => {
    const barcode = p.barcode || generateEAN13(String(p.sku || p.name).replace(/\D/g,'').padStart(12,'0').slice(0,12));
    const checked = selectedForBarcode.has(p.id);
    return `<div style="background:white;border:${checked ? '2px solid var(--dt-gold)' : '0.5px solid var(--dt-border)'};border-radius:10px;padding:12px;text-align:center;cursor:pointer;" onclick="toggleBarcodeSelect('${p.id}',this)" id="bcCard_${p.id}">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
        <input type="checkbox" ${checked?'checked':''} style="flex-shrink:0;" onclick="event.stopPropagation()">
        <div style="font-size:0.77rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${p.emoji||'🧵'} ${p.name}</div>
      </div>
      <svg id="bcSvg_${p.id}" style="max-width:100%;"></svg>
      <div style="font-size:0.7rem;color:var(--dt-muted);margin-top:4px;">${barcode}</div>
      <div style="font-size:0.75rem;font-weight:600;color:var(--dt-gold);margin-top:2px;">LKR ${Number(p.price).toLocaleString()}</div>
      <button onclick="event.stopPropagation();printSingleBarcode('${p.id}')" style="margin-top:6px;padding:4px 10px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:6px;font-size:0.7rem;width:100%;">🖨 Print Label</button>
    </div>`;
  }).join('');

  // Render barcodes after DOM update
  requestAnimationFrame(() => {
    list.forEach(p => {
      const svg = document.getElementById('bcSvg_' + p.id);
      if (svg) {
        const barcode = p.barcode || generateEAN13(String(p.sku || p.name).replace(/\D/g,'').padStart(12,'0').slice(0,12));
        renderBarcodeToSVG(svg, barcode);
      }
    });
  });
}

window.toggleBarcodeSelect = (id, card) => {
  if (selectedForBarcode.has(id)) { selectedForBarcode.delete(id); card.style.border = '0.5px solid var(--dt-border)'; card.querySelector('input').checked = false; }
  else { selectedForBarcode.add(id); card.style.border = '2px solid var(--dt-gold)'; card.querySelector('input').checked = true; }
};

window.filterBarcodeList = (q) => renderBarcodeList(q);

window.selectAllBarcodes = () => {
  products.forEach(p => selectedForBarcode.add(p.id));
  renderBarcodeList(document.getElementById('bcSearch')?.value || '');
};

window.printSelectedBarcodes = () => {
  if (selectedForBarcode.size === 0) { showToast('Select at least one product', 'warn'); return; }
  openBarcodePrintModal(products, [...selectedForBarcode]);
};

window.printSingleBarcode = (id) => {
  openBarcodePrintModal(products, [id]);
};

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  document.getElementById('dRevenue').textContent = 'LKR ' + Math.round(todaySales).toLocaleString();
  document.getElementById('dRevSub').textContent  = transactionCount + ' bills';
  document.getElementById('dItems').textContent   = itemsSold;
  const retTotal = [...retailReturns, ...wholesaleReturns].filter(r => (r.date || '').startsWith(new Date().toISOString().split('T')[0])).reduce((s, r) => s + Number(r.total || 0), 0);
  document.getElementById('dReturns').textContent = 'LKR ' + Math.round(retTotal).toLocaleString();
  document.getElementById('dNet').textContent     = 'LKR ' + Math.round(todaySales - retTotal).toLocaleString();
  document.getElementById('dNet').style.color     = todaySales - retTotal >= 0 ? 'var(--dt-ok)' : 'var(--dt-low)';
  const low = products.filter(p => p.stock <= p.min_stock);
  document.getElementById('dLow').textContent = low.length;
  const lowEl = document.getElementById('lowStockList');
  if (lowEl) lowEl.innerHTML = low.length === 0 ? '<span style="color:var(--dt-ok);">✅ All stocked!</span>' :
    low.map(p => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:0.5px solid var(--dt-border);font-size:0.74rem;"><span>${p.emoji||''} ${p.name}</span><span style="color:var(--dt-low);font-weight:500;">${p.stock} left</span></div>`).join('');
  const recentEl = document.getElementById('recentBills');
  if (recentEl) recentEl.innerHTML = salesLog.length === 0 ? 'No bills today.' :
    salesLog.slice(-6).reverse().map(b => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:0.5px solid var(--dt-border);font-size:0.74rem;"><span>${b.bill_number}</span><span>${(b.payment_method||'').toUpperCase()}</span><span style="font-weight:500;">LKR ${Number(b.total).toLocaleString()}</span></div>`).join('');
}

window.sendDailySummaryWA = () => {
  const phone = prompt('Manager WhatsApp number:', '');
  if (phone) sendDailySummary({ revenue: todaySales, transactions: transactionCount, items: itemsSold, expenses: expenses.reduce((s, e) => s + Number(e.amount), 0) }, phone);
};
window.alertLowStock = () => {
  const low = products.filter(p => p.stock <= p.min_stock);
  if (low.length === 0) { showToast('All stocked!', 'ok'); return; }
  const phone = prompt('Manager WhatsApp number:', '');
  if (phone) sendLowStockAlert(low, phone);
};

// ============================================================
// INVENTORY
// ============================================================
function renderInventoryTable(filter = '') {
  const tbody = document.getElementById('invBody'); if (!tbody) return;
  const items = products.filter(p => !filter || p.name.toLowerCase().includes(filter.toLowerCase()));
  if (items.length === 0) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--dt-muted);padding:2rem;">No products. Click + Add Product.</td></tr>'; return; }
  tbody.innerHTML = items.map(p => {
    const low = p.stock <= p.min_stock; const mid = p.stock <= p.min_stock * 1.5;
    const margin = p.cost_price > 0 ? Math.round(((p.price - p.cost_price) / p.price) * 100) : null;
    const barcode = p.barcode || generateEAN13(String(p.sku || p.name).replace(/\D/g,'').padStart(12,'0').slice(0,12));
    return `<tr>
      <td>${p.emoji||'🧵'} ${p.name}</td>
      <td style="color:var(--dt-muted);font-family:monospace;font-size:0.7rem;">${p.sku||'—'}</td>
      <td style="font-family:monospace;font-size:0.65rem;color:var(--dt-muted);">${barcode.slice(0,8)}…</td>
      <td>LKR ${Number(p.price).toLocaleString()}</td>
      <td style="color:var(--dt-muted);">${p.cost_price>0?'LKR '+Number(p.cost_price).toLocaleString():'—'}</td>
      <td><span class="badge ${low?'badge-low':mid?'badge-mid':'badge-ok'}">${p.stock}</span></td>
      <td style="color:var(--dt-muted);">${p.min_stock}</td>
      <td>${margin!==null?`<span style="color:${margin>30?'var(--dt-ok)':margin>15?'var(--dt-warn)':'var(--dt-low)'};font-weight:500;">${margin}%</span>`:'—'}</td>
      <td style="white-space:nowrap;">
        <button onclick="openProductModal('${p.id}')" style="padding:3px 7px;border:0.5px solid var(--dt-border);border-radius:5px;font-size:0.68rem;background:white;margin-right:2px;">Edit</button>
        <button onclick="delProduct('${p.id}')" style="padding:3px 6px;border:0.5px solid rgba(226,75,74,0.3);border-radius:5px;font-size:0.68rem;background:white;color:var(--dt-low);">Del</button>
      </td>
    </tr>`;
  }).join('');
}

window.filterInventory = (q) => renderInventoryTable(q);

window.openProductModal = (idOrNull) => {
  const p = idOrNull ? products.find(x => x.id === idOrNull) : null;
  const catOptions = categories.map(c => `<option value="${c.id}" ${p?.category_id === c.id ? 'selected' : ''}>${c.name}</option>`).join('');
  // Auto-generate barcode if new product
  const autoBarcode = p?.barcode || '';

  openModal(`
    <h3 style="font-size:0.93rem;font-weight:500;margin-bottom:1rem;">${p ? 'Edit Product' : 'Add New Product'}</h3>
    <div style="display:grid;gap:8px;">
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Product Name *</label><input id="pName" value="${p?.name||''}" placeholder="e.g. Cotton Fabric"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;">
        <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Sell Price (LKR) *</label><input id="pPrice" type="number" value="${p?.price||''}" placeholder="0.00"></div>
        <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Cost Price (LKR)</label><input id="pCost" type="number" value="${p?.cost_price||''}" placeholder="0.00"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;">
        <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Stock Qty *</label><input id="pStock" type="number" value="${p?.stock||0}"></div>
        <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Min Stock Alert</label><input id="pMin" type="number" value="${p?.min_stock||10}"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;">
        <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">SKU</label><input id="pSku" value="${p?.sku||''}" placeholder="e.g. CTN-001"></div>
        <div>
          <label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Barcode
            <button type="button" onclick="autoGenBarcode()" style="font-size:0.6rem;padding:1px 5px;border:0.5px solid var(--dt-border);border-radius:4px;background:white;margin-left:4px;">Auto-generate</button>
          </label>
          <input id="pBarcode" value="${autoBarcode}" placeholder="Scan or type / Auto-generate">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;">
        <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Emoji</label><input id="pEmoji" value="${p?.emoji||'🧵'}" style="font-size:1.1rem;" maxlength="2"></div>
        <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Category</label><select id="pCat"><option value="">No category</option>${catOptions}</select></div>
        <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Unit</label><select id="pUnit">${['per meter','per piece','per roll','per kg','per yard','per set'].map(u=>`<option ${(p?.unit||'per meter')===u?'selected':''}>${u}</option>`).join('')}</select></div>
      </div>
    </div>
    <div style="display:flex;gap:7px;margin-top:1rem;">
      <button onclick="saveProduct('${p?.id||''}')" style="flex:1;padding:9px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:9px;font-size:0.84rem;font-weight:500;">Save / සුරකින්න</button>
      <button onclick="closeModal()" style="padding:9px 16px;border:0.5px solid var(--dt-border);border-radius:9px;font-size:0.84rem;">Cancel</button>
    </div>
  `);
};

// Auto-generate EAN-13 barcode from SKU or timestamp
window.autoGenBarcode = () => {
  const sku = document.getElementById('pSku')?.value || '';
  const seed = sku.replace(/\D/g,'') || Date.now().toString().slice(-12);
  const bc = generateEAN13(seed.padStart(12,'0').slice(0,12));
  const el = document.getElementById('pBarcode');
  if (el) el.value = bc;
};

window.saveProduct = async (existingId) => {
  const name = document.getElementById('pName').value.trim();
  if (!name) { showToast('Product name required!', 'warn'); return; }
  const price = parseFloat(document.getElementById('pPrice').value) || 0;
  if (price <= 0) { showToast('Valid price required!', 'warn'); return; }
  const sku = document.getElementById('pSku').value.trim() || null;
  let barcode = document.getElementById('pBarcode').value.trim() || null;
  // Auto-generate barcode if empty
  if (!barcode) {
    const seed = (sku || name).replace(/\D/g,'') || Date.now().toString().slice(-12);
    barcode = generateEAN13(seed.padStart(12,'0').slice(0,12));
  }

  const prod = {
    ...(existingId ? { id: existingId } : {}),
    name, price,
    cost_price: parseFloat(document.getElementById('pCost').value) || 0,
    stock:     parseInt(document.getElementById('pStock').value)   || 0,
    min_stock: parseInt(document.getElementById('pMin').value)     || 10,
    sku, barcode,
    emoji:       document.getElementById('pEmoji').value   || '🧵',
    category_id: document.getElementById('pCat').value     || null,
    unit:        document.getElementById('pUnit').value,
    active: true,
  };

  try {
    const saved = await upsertProduct(prod);
    if (existingId) { const idx = products.findIndex(p => p.id === existingId); if (idx >= 0) products[idx] = { ...products[idx], ...saved }; }
    else { const cat = categories.find(c => c.id === prod.category_id); products.push({ ...saved, categories: cat ? { name: cat.name, color: cat.color } : null }); }
    showToast('Product saved!', 'ok');
  } catch(e) {
    if (existingId) { const idx = products.findIndex(p => p.id === existingId); if (idx >= 0) products[idx] = { ...products[idx], ...prod }; }
    else { prod.id = 'local-' + Date.now(); const cat = categories.find(c => c.id === prod.category_id); products.push({ ...prod, categories: cat ? { name: cat.name } : null }); }
    showToast('Saved locally (offline)', 'warn');
  }
  closeModal();
  renderInventoryTable(document.getElementById('invSearch')?.value || '');
  renderProductGrid();
  renderCategories();
};

window.delProduct = async (id) => {
  if (!confirm('Delete this product?')) return;
  try { await deleteProduct(id); } catch {}
  products = products.filter(p => p.id !== id);
  renderInventoryTable();
  renderProductGrid();
  showToast('Product deleted', 'ok');
};

window.openCategoryModal = () => {
  openModal(`
    <h3 style="font-size:0.93rem;font-weight:500;margin-bottom:1rem;">+ Add Category</h3>
    <div style="display:grid;gap:8px;">
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Category Name *</label><input id="catName" placeholder="e.g. Cotton"></div>
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Color</label><input id="catColor" type="color" value="#B8860B" style="height:36px;padding:2px;"></div>
    </div>
    <div style="display:flex;gap:7px;margin-top:1rem;">
      <button onclick="saveCategory()" style="flex:1;padding:9px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:9px;font-size:0.84rem;font-weight:500;">Save</button>
      <button onclick="closeModal()" style="padding:9px 16px;border:0.5px solid var(--dt-border);border-radius:9px;font-size:0.84rem;">Cancel</button>
    </div>
  `);
};

window.saveCategory = async () => {
  const name = document.getElementById('catName').value.trim();
  if (!name) { showToast('Category name required!', 'warn'); return; }
  const cat = { name, color: document.getElementById('catColor').value };
  try { const saved = await upsertCategory(cat); categories.push(saved); }
  catch { cat.id = 'cat-' + Date.now(); categories.push(cat); }
  closeModal();
  renderCategories();
  showToast('Category added!', 'ok');
};

// ============================================================
// RETURNS
// ============================================================
let activeReturnType = 'retail';

window.switchReturnTab = (type) => {
  activeReturnType = type;
  ['retail','wholesale'].forEach(t => {
    const btn = document.getElementById('rtnTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) { btn.style.borderBottomColor = t === type ? 'var(--dt-gold)' : 'transparent'; btn.style.color = t === type ? 'var(--dt-gold)' : 'var(--dt-muted)'; }
  });
  renderReturnsTable();
};

async function loadReturnsTab() {
  try {
    const allRet = await getReturns();
    retailReturns    = allRet.filter(r => r.sale_type === 'retail');
    wholesaleReturns = allRet.filter(r => r.sale_type === 'wholesale');
  } catch {}
  const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  const rRC = retailReturns.reduce((s, r) => s + Number(r.total || 0), 0);
  const wRC = wholesaleReturns.reduce((s, r) => s + Number(r.total || 0), 0);
  setEl('rtnRetailCount',    retailReturns.length);
  setEl('rtnRetailAmt',      'LKR ' + Math.round(rRC).toLocaleString());
  setEl('rtnWholesaleCount', wholesaleReturns.length);
  setEl('rtnWholesaleAmt',   'LKR ' + Math.round(wRC).toLocaleString());
  renderReturnsTable();
}

function renderReturnsTable() {
  const tbody = document.getElementById('returnBody'); if (!tbody) return;
  const isMgrView = currentUser && currentUser.role === 'manager';
  const list = activeReturnType === 'retail' ? retailReturns : wholesaleReturns;
  const cols = isMgrView ? 7 : 6;
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;color:var(--dt-muted);padding:2rem;">No ${activeReturnType} returns. Click ↩ ${activeReturnType === 'retail' ? 'Retail' : 'Wholesale'} Return to process.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(r => `<tr>
    <td style="font-weight:500;color:var(--dt-low);">${r.return_number}</td>
    <td>${r.original_bill_number||'—'}</td>
    <td>${r.date||new Date(r.created_at).toLocaleDateString('en-LK')}</td>
    ${isMgrView?`<td><span class="badge ${r.sale_type==='wholesale'?'badge-mid':'badge-low'}">${(r.sale_type||'retail').toUpperCase()}</span></td>`:''}
    <td style="white-space:normal;font-size:0.73rem;">${r.reason||'—'}</td>
    <td style="font-weight:500;color:var(--dt-low);">LKR ${Number(r.total||0).toLocaleString()}</td>
    <td><button onclick="printReturnReceipt('${r.id}')" style="padding:3px 7px;border:0.5px solid var(--dt-border);border-radius:5px;font-size:0.7rem;background:white;cursor:pointer;">🖨</button></td>
  </tr>`).join('');
}

window.openReturnModal = (type) => {
  openModal(`
    <h3 style="font-size:0.93rem;font-weight:500;margin-bottom:1rem;">↩ ${type==='wholesale'?'Wholesale':'Retail'} Return</h3>
    <div style="display:grid;gap:8px;">
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Original Bill Number *</label>
        <div style="display:flex;gap:5px;"><input id="origBill" placeholder="e.g. DT20250101-0001"><button onclick="lookupBill()" style="padding:5px 11px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:7px;font-size:0.74rem;white-space:nowrap;">Lookup</button></div>
      </div>
      <div id="billLookupResult" style="font-size:0.75rem;color:var(--dt-muted);"></div>
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Return Reason *</label>
        <select id="retReason"><option value="">Select reason...</option><option>Defective / දෝෂ සහිත</option><option>Wrong item / වැරදි භාණ්ඩය</option><option>Customer changed mind</option><option>Overcharged / අතිරේකව අයකළ</option><option>Other / වෙනත්</option></select>
      </div>
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Items to Return *</label>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:5px;margin-bottom:4px;font-size:0.7rem;color:var(--dt-muted);"><span>Product Name</span><span>Qty</span><span>Price</span></div>
        <div id="retItems">
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:5px;margin-bottom:5px;">
            <input id="rItem0Name" placeholder="Item name"><input id="rItem0Qty" type="number" placeholder="Qty" value="1"><input id="rItem0Price" type="number" placeholder="Price">
          </div>
        </div>
        <button onclick="addReturnItemRow()" style="font-size:0.72rem;padding:4px 10px;border:0.5px dashed var(--dt-border);border-radius:6px;background:white;color:var(--dt-muted);">+ Add Item</button>
      </div>
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Refund Method</label>
        <select id="retRefund"><option value="cash">Cash</option><option value="store_credit">Store Credit</option><option value="exchange">Exchange</option></select>
      </div>
    </div>
    <div style="display:flex;gap:7px;margin-top:1rem;">
      <button onclick="submitReturn('${type}')" style="flex:1;padding:9px;background:var(--dt-low);color:white;border-radius:9px;font-size:0.84rem;font-weight:500;">Process Return</button>
      <button onclick="closeModal()" style="padding:9px 16px;border:0.5px solid var(--dt-border);border-radius:9px;font-size:0.84rem;">Cancel</button>
    </div>
  `);
  window._retItemCount = 1;
};

window.addReturnItemRow = () => {
  const i = window._retItemCount++;
  const div = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr;gap:5px;margin-bottom:5px;';
  div.innerHTML = `<input id="rItem${i}Name" placeholder="Item name"><input id="rItem${i}Qty" type="number" placeholder="Qty" value="1"><input id="rItem${i}Price" type="number" placeholder="Price">`;
  const container = document.getElementById('retItems');
  if (container) container.appendChild(div);
};

window.lookupBill = async () => {
  const bn  = document.getElementById('origBill').value.trim();
  const res = document.getElementById('billLookupResult');
  if (!bn) { res.textContent = 'Enter bill number'; return; }
  try {
    const bill = await getBillByNumber(bn);
    if (bill) {
      res.innerHTML = `<span style="color:var(--dt-ok);">✅ Bill found: LKR ${Number(bill.total).toLocaleString()} · ${new Date(bill.created_at).toLocaleDateString('en-LK')}</span>`;
      const container = document.getElementById('retItems');
      if (container) { container.innerHTML = ''; window._retItemCount = 0; }
      (bill.bill_items || []).forEach((item, i) => {
        window._retItemCount++;
        const div = document.createElement('div');
        div.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr;gap:5px;margin-bottom:5px;';
        div.innerHTML = `<input id="rItem${i}Name" value="${item.product_name}" placeholder="Item"><input id="rItem${i}Qty" type="number" value="${item.quantity}"><input id="rItem${i}Price" type="number" value="${item.unit_price}">`;
        if (container) container.appendChild(div);
      });
    } else { res.innerHTML = `<span style="color:var(--dt-low);">Bill not found</span>`; }
  } catch { res.textContent = 'Lookup failed (offline?)'; }
};

window.submitReturn = async (type) => {
  const reason   = document.getElementById('retReason').value;
  const refund   = document.getElementById('retRefund').value;
  const origBill = document.getElementById('origBill').value.trim();
  if (!reason) { showToast('Select a reason', 'warn'); return; }
  const items = [];
  for (let i = 0; i < window._retItemCount; i++) {
    const name  = document.getElementById(`rItem${i}Name`)?.value.trim();
    const qty   = parseFloat(document.getElementById(`rItem${i}Qty`)?.value)   || 0;
    const price = parseFloat(document.getElementById(`rItem${i}Price`)?.value) || 0;
    if (name && qty > 0 && price > 0) items.push({ name, product_name: name, qty, price, unit_price: price, total: qty * price });
  }
  if (items.length === 0) { showToast('Add at least one item', 'warn'); return; }
  const total = items.reduce((s, i) => s + i.qty * i.price, 0);
  const retData = { sale_type: type, reason, refund_method: refund, total, original_bill_number: origBill || null, date: new Date().toISOString().split('T')[0], cashier_name: currentUser.name };
  let saved = null;
  try { saved = await saveReturn(retData, items, currentUser.id); }
  catch {
    const today = new Date();
    const prefix = `RTN${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    saved = { ...retData, return_number: `${prefix}-${String(Date.now()).slice(-4)}`, created_at: new Date().toISOString(), items };
  }
  todayReturns += total;
  if (type === 'retail') retailReturns.unshift(saved);
  else wholesaleReturns.unshift(saved);
  closeModal();
  loadReturnsTab();
  showToast('Return processed!', 'ok');
  if (confirm('Print return receipt?')) {
    const bill = { ...saved, bill_number: saved.return_number, is_return: true, items: items.map(i => ({ ...i, product_name: i.name, quantity: i.qty })) };
    printReceipt(bill, receiptLang);
  }
};

window.printReturnReceipt = (id) => {
  const r = [...retailReturns, ...wholesaleReturns].find(x => x.id === id);
  if (!r) { showToast('Not found', 'warn'); return; }
  const bill = { ...r, bill_number: r.return_number, is_return: true, items: (r.return_items || []).map(i => ({ ...i, product_name: i.product_name || i.name, quantity: i.quantity || i.qty })) };
  printReceipt(bill, receiptLang);
};

// ============================================================
// EXPENSES
// ============================================================
async function loadExpenses(month = null) {
  try { const data = await getExpenses(month); if (data) expenses = data; } catch {}
  const tbody = document.getElementById('expBody'); if (!tbody) return;
  const total  = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const rev    = todaySales;
  const profit = rev - total;
  const setEl  = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setEl('expTotal',   'LKR ' + Math.round(total).toLocaleString());
  setEl('expCount',   expenses.length + ' entries');
  setEl('expRevenue', 'LKR ' + Math.round(rev).toLocaleString());
  setEl('expProfit',  'LKR ' + Math.round(profit).toLocaleString());
  const profEl = document.getElementById('expProfit');
  if (profEl) profEl.style.color = profit >= 0 ? 'var(--dt-ok)' : 'var(--dt-low)';
  tbody.innerHTML = expenses.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:var(--dt-muted);padding:2rem;">No expenses. Click + Add Expense.</td></tr>' :
    expenses.map(e => `<tr>
      <td>${e.date||'—'}</td>
      <td><span style="background:#FCEBEB;color:#A32D2D;padding:2px 7px;border-radius:9px;font-size:0.7rem;">${e.category}</span></td>
      <td style="white-space:normal;font-size:0.74rem;">${e.description||'—'}</td>
      <td style="font-weight:500;color:var(--dt-low);">LKR ${Number(e.amount).toLocaleString()}</td>
      <td style="color:var(--dt-muted);">${e.staff?.name || currentUser.name}</td>
      <td><button onclick="removeExpense('${e.id}')" style="padding:2px 6px;border:0.5px solid rgba(226,75,74,0.3);border-radius:5px;font-size:0.69rem;color:var(--dt-low);background:white;">✕</button></td>
    </tr>`).join('');
}

window.openExpenseModal = () => {
  openModal(`
    <h3 style="font-size:0.93rem;font-weight:500;margin-bottom:1rem;">💸 Add Expense</h3>
    <div style="display:grid;gap:8px;">
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Category *</label><select id="eCat"><option value="">Select...</option>${EXPENSE_CATS.map(c=>`<option>${c}</option>`).join('')}</select></div>
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Description</label><input id="eDesc" placeholder="e.g. Monthly shop rent"></div>
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Amount (LKR) *</label><input id="eAmt" type="number" placeholder="0.00"></div>
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Date</label><input id="eDate" type="date" value="${new Date().toISOString().split('T')[0]}"></div>
    </div>
    <div style="display:flex;gap:7px;margin-top:1rem;">
      <button onclick="submitExpense()" style="flex:1;padding:9px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:9px;font-size:0.84rem;font-weight:500;">Save</button>
      <button onclick="closeModal()" style="padding:9px 16px;border:0.5px solid var(--dt-border);border-radius:9px;font-size:0.84rem;">Cancel</button>
    </div>
  `);
};

window.submitExpense = async () => {
  const cat = document.getElementById('eCat').value;
  const amt = parseFloat(document.getElementById('eAmt').value);
  if (!cat || !amt || amt <= 0) { showToast('Category & valid amount required', 'warn'); return; }
  const exp = { category: cat, description: document.getElementById('eDesc').value, amount: amt, date: document.getElementById('eDate').value, created_by: currentUser.id };
  try { const d = await addExpense(exp); expenses.unshift({ ...d, staff: { name: currentUser.name } }); }
  catch { expenses.unshift({ ...exp, id: 'local-' + Date.now(), staff: { name: currentUser.name } }); }
  closeModal();
  loadExpenses(document.getElementById('expMonth')?.value || null);
  showToast('Expense saved!', 'ok');
};

window.removeExpense = async (id) => {
  if (!confirm('Delete this expense?')) return;
  try { await deleteExpense(id); } catch {}
  expenses = expenses.filter(e => e.id !== id);
  loadExpenses(document.getElementById('expMonth')?.value || null);
};

// ============================================================
// REPORTS
// ============================================================
window.loadDayReport = async (dateStr) => {
  let dayBills = salesLog.filter(b => b.created_at?.startsWith(dateStr));
  try { const db = await getBillsForDate(new Date(dateStr)); if (db && db.length > 0) dayBills = db; } catch {}
  const rev    = dayBills.reduce((s, b) => s + Number(b.total), 0);
  const allRet = [...retailReturns, ...wholesaleReturns].filter(r => (r.date || '').startsWith(dateStr));
  const setEl  = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setEl('rRevenue', 'LKR ' + Math.round(rev).toLocaleString());
  setEl('rTxns',    dayBills.length);
  setEl('rDisc',    'LKR ' + dayBills.reduce((s, b) => s + Number(b.discount_amount || 0), 0).toLocaleString());
  setEl('rCash',    dayBills.filter(b => b.payment_method === 'cash').length + ' / ' + dayBills.filter(b => b.payment_method === 'card').length);
  setEl('rRet',     'LKR ' + allRet.reduce((s, r) => s + Number(r.total || 0), 0).toLocaleString());
  const listEl = document.getElementById('reportTxnList');
  if (listEl) listEl.innerHTML = dayBills.length === 0 ? 'No transactions for this date.' :
    dayBills.map(b => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:0.5px solid var(--dt-border);font-size:0.76rem;">
      <span>${b.bill_number}</span><span style="color:var(--dt-muted);">${new Date(b.created_at).toLocaleTimeString('en-LK',{hour:'2-digit',minute:'2-digit'})}</span>
      <span>${(b.sale_type||'retail').toUpperCase()}</span><span>${(b.payment_method||'').toUpperCase()}</span>
      <span style="font-weight:600;">LKR ${Number(b.total).toLocaleString()}</span>
    </div>`).join('');
};

window.downloadDayReport = async () => {
  const dateStr = document.getElementById('reportDate')?.value || new Date().toISOString().split('T')[0];
  let dayBills = salesLog.filter(b => b.created_at?.startsWith(dateStr));
  try { const db = await getBillsForDate(new Date(dateStr)); if (db && db.length > 0) dayBills = db; } catch {}
  const allRet = [...retailReturns, ...wholesaleReturns].filter(r => (r.date || '').startsWith(dateStr));
  const summary = {
    total_revenue:     dayBills.reduce((s, b) => s + Number(b.total), 0),
    transaction_count: dayBills.length,
    total_discounts:   dayBills.reduce((s, b) => s + Number(b.discount_amount || 0), 0),
    cash_transactions: dayBills.filter(b => b.payment_method === 'cash').length,
    card_transactions: dayBills.filter(b => b.payment_method === 'card').length,
  };
  try { generateDailyReportPDF(summary, dayBills, allRet, new Date(dateStr)).save(`deshan-report-${dateStr}.pdf`); }
  catch(e) { showToast('PDF error: ' + e.message, 'warn'); }
};

// ============================================================
// CUSTOMERS
// ============================================================
function renderCustomersTable(filter = '') {
  const tbody = document.getElementById('custBody'); if (!tbody) return;
  const list = customers.filter(c => !filter || (c.name||'').toLowerCase().includes(filter.toLowerCase()) || (c.phone||'').includes(filter));
  if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--dt-muted);padding:2rem;">No customers yet.</td></tr>'; return; }
  tbody.innerHTML = list.map(c => `<tr>
    <td style="font-weight:500;">${c.name}</td><td>${c.phone||'—'}</td>
    <td>LKR ${Number(c.total_spent||0).toLocaleString()}</td>
    <td><span class="badge badge-ok">${c.loyalty_points||0} pts</span></td>
    <td style="white-space:normal;font-size:0.73rem;">${c.address||'—'}</td>
    <td><button onclick="openCustomerModal('${c.id}')" style="padding:3px 8px;border:0.5px solid var(--dt-border);border-radius:5px;font-size:0.7rem;background:white;">Edit</button></td>
  </tr>`).join('');
}
window.filterCustomerTable = (q) => renderCustomersTable(q);

window.openCustomerModal = (id) => {
  const c = id ? customers.find(x => x.id === id) : null;
  openModal(`
    <h3 style="font-size:0.93rem;font-weight:500;margin-bottom:1rem;">${c?'Edit':'Add'} Customer</h3>
    <div style="display:grid;gap:8px;">
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Name *</label><input id="cName" value="${c?.name||''}" placeholder="Full name"></div>
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Phone</label><input id="cPhone" value="${c?.phone||''}" placeholder="0771234567"></div>
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Email</label><input id="cEmail" value="${c?.email||''}" placeholder="email@example.com"></div>
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Address</label><input id="cAddr" value="${c?.address||''}" placeholder="Address"></div>
    </div>
    <div style="display:flex;gap:7px;margin-top:1rem;">
      <button onclick="saveCustomer('${c?.id||''}')" style="flex:1;padding:9px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:9px;font-size:0.84rem;font-weight:500;">Save</button>
      <button onclick="closeModal()" style="padding:9px 16px;border:0.5px solid var(--dt-border);border-radius:9px;font-size:0.84rem;">Cancel</button>
    </div>`);
};

window.saveCustomer = async (id) => {
  const name = document.getElementById('cName').value.trim();
  if (!name) { showToast('Name required!', 'warn'); return; }
  const c = { ...(id ? { id } : {}), name, phone: document.getElementById('cPhone').value, email: document.getElementById('cEmail').value, address: document.getElementById('cAddr').value };
  try { const d = await upsertCustomer(c); if (id) { const i = customers.findIndex(x => x.id === id); if (i >= 0) customers[i] = { ...customers[i], ...d }; } else customers.push(d); }
  catch { if (id) { const i = customers.findIndex(x => x.id === id); if (i >= 0) customers[i] = { ...customers[i], ...c }; } else { c.id = 'c-' + Date.now(); customers.push(c); } }
  closeModal();
  renderCustomersTable();
  showToast('Customer saved!', 'ok');
};

// ============================================================
// SUPPLIERS
// ============================================================
function renderSuppliersTable() {
  const tbody = document.getElementById('suppBody'); if (!tbody) return;
  if (suppliers.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--dt-muted);padding:2rem;">No suppliers yet.</td></tr>'; return; }
  tbody.innerHTML = suppliers.map(s => `<tr>
    <td style="font-weight:500;">${s.name}</td><td>${s.phone||'—'}</td><td>${s.email||'—'}</td>
    <td style="white-space:normal;font-size:0.73rem;">${s.address||'—'}</td>
    <td><button onclick="openSupplierModal('${s.id}')" style="padding:3px 8px;border:0.5px solid var(--dt-border);border-radius:5px;font-size:0.7rem;background:white;">Edit</button></td>
  </tr>`).join('');
}

window.openSupplierModal = (id) => {
  const s = id ? suppliers.find(x => x.id === id) : null;
  openModal(`
    <h3 style="font-size:0.93rem;font-weight:500;margin-bottom:1rem;">${s?'Edit':'Add'} Supplier</h3>
    <div style="display:grid;gap:8px;">
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Name *</label><input id="sName" value="${s?.name||''}" placeholder="Supplier name"></div>
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Phone</label><input id="sPhone" value="${s?.phone||''}" placeholder="0771234567"></div>
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Email</label><input id="sEmail" value="${s?.email||''}" placeholder="supplier@example.com"></div>
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Address</label><input id="sAddr" value="${s?.address||''}" placeholder="Address"></div>
    </div>
    <div style="display:flex;gap:7px;margin-top:1rem;">
      <button onclick="saveSupplier('${s?.id||''}')" style="flex:1;padding:9px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:9px;font-size:0.84rem;font-weight:500;">Save</button>
      <button onclick="closeModal()" style="padding:9px 16px;border:0.5px solid var(--dt-border);border-radius:9px;font-size:0.84rem;">Cancel</button>
    </div>`);
};

window.saveSupplier = async (id) => {
  const name = document.getElementById('sName').value.trim();
  if (!name) { showToast('Name required!', 'warn'); return; }
  const s = { ...(id ? { id } : {}), name, phone: document.getElementById('sPhone').value, email: document.getElementById('sEmail').value, address: document.getElementById('sAddr').value };
  try { const d = await upsertSupplier(s); if (id) { const i = suppliers.findIndex(x => x.id === id); if (i >= 0) suppliers[i] = { ...suppliers[i], ...d }; } else suppliers.push(d); }
  catch { if (id) { const i = suppliers.findIndex(x => x.id === id); if (i >= 0) suppliers[i] = { ...suppliers[i], ...s }; } else { s.id = 's-' + Date.now(); suppliers.push(s); } }
  closeModal();
  renderSuppliersTable();
  showToast('Supplier saved!', 'ok');
};

// ============================================================
// STAFF
// ============================================================
function renderStaffTable() {
  const tbody = document.getElementById('staffBody'); if (!tbody) return;
  if (staff.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--dt-muted);padding:2rem;">No staff records.</td></tr>'; return; }
  tbody.innerHTML = staff.map(s => `<tr>
    <td style="font-weight:500;">${s.name}</td>
    <td><span class="badge badge-${s.role}">${s.role}</span></td>
    <td><span class="badge ${s.active?'badge-ok':'badge-low'}">${s.active?'Active':'Inactive'}</span></td>
    <td><button onclick="changeStaffPin('${s.id}')" style="padding:3px 9px;border:0.5px solid var(--dt-border);border-radius:5px;font-size:0.7rem;background:white;">Change PIN</button></td>
    <td><button onclick="toggleStaff('${s.id}',${!s.active})" style="padding:3px 8px;border:0.5px solid var(--dt-border);border-radius:5px;font-size:0.7rem;background:white;color:${s.active?'var(--dt-low)':'var(--dt-ok)'};">${s.active?'Deactivate':'Activate'}</button></td>
  </tr>`).join('');
}

window.openStaffModal = () => {
  openModal(`
    <h3 style="font-size:0.93rem;font-weight:500;margin-bottom:1rem;">+ Add Staff Member</h3>
    <div style="display:grid;gap:8px;">
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Full Name *</label><input id="stName" placeholder="e.g. Chamara Perera"></div>
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Role *</label><select id="stRole"><option value="cashier">Cashier</option><option value="manager">Manager</option></select></div>
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">4-Digit PIN *</label><input id="stPin" type="password" maxlength="4" placeholder="e.g. 1234" style="letter-spacing:0.3em;"></div>
    </div>
    <div style="display:flex;gap:7px;margin-top:1rem;">
      <button onclick="saveStaff()" style="flex:1;padding:9px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:9px;font-size:0.84rem;font-weight:500;">Add Staff</button>
      <button onclick="closeModal()" style="padding:9px 16px;border:0.5px solid var(--dt-border);border-radius:9px;font-size:0.84rem;">Cancel</button>
    </div>`);
};

window.saveStaff = async () => {
  const name = document.getElementById('stName').value.trim();
  const role = document.getElementById('stRole').value;
  const pin  = document.getElementById('stPin').value;
  if (!name || pin.length !== 4) { showToast('Name and 4-digit PIN required!', 'warn'); return; }
  const s = { name, role, pin_hash: pin, active: true };
  try { const d = await addStaff(s); staff.push(d); }
  catch { s.id = 'st-' + Date.now(); staff.push(s); }
  closeModal();
  renderStaffTable();
  showToast('Staff added!', 'ok');
};

window.changeStaffPin = (id) => {
  openModal(`
    <h3 style="font-size:0.93rem;font-weight:500;margin-bottom:1rem;">Change PIN</h3>
    <div style="display:grid;gap:8px;">
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">New 4-Digit PIN *</label><input id="newPin" type="password" maxlength="4" placeholder="e.g. 5678" style="letter-spacing:0.3em;"></div>
      <div><label style="font-size:0.73rem;color:var(--dt-muted);display:block;margin-bottom:3px;">Confirm PIN *</label><input id="confPin" type="password" maxlength="4" placeholder="Repeat PIN" style="letter-spacing:0.3em;"></div>
    </div>
    <div style="display:flex;gap:7px;margin-top:1rem;">
      <button onclick="submitPinChange('${id}')" style="flex:1;padding:9px;background:var(--dt-dark);color:var(--dt-gold-light);border-radius:9px;font-size:0.84rem;font-weight:500;">Update PIN</button>
      <button onclick="closeModal()" style="padding:9px 16px;border:0.5px solid var(--dt-border);border-radius:9px;font-size:0.84rem;">Cancel</button>
    </div>`);
};

window.submitPinChange = async (id) => {
  const p1 = document.getElementById('newPin').value;
  const p2 = document.getElementById('confPin').value;
  if (p1.length !== 4 || p1 !== p2) { showToast('PINs must match and be 4 digits!', 'warn'); return; }
  try { await updateStaff(id, { pin_hash: p1 }); } catch {}
  const s = staff.find(x => x.id === id); if (s) s.pin_hash = p1;
  closeModal();
  showToast('PIN updated!', 'ok');
};

window.toggleStaff = async (id, active) => {
  try { await updateStaff(id, { active }); } catch {}
  const s = staff.find(x => x.id === id); if (s) s.active = active;
  renderStaffTable();
  showToast(active ? 'Staff activated!' : 'Staff deactivated!', 'ok');
};

// ============================================================
// AI ASSISTANT
// ============================================================
window.aiQuickAsk = (prompt) => { const i = document.getElementById('aiInput'); if (i) { i.value = prompt; sendAIMessage(); } };
window.sendAIMessage = async () => {
  const input = document.getElementById('aiInput');
  const q = input?.value?.trim();
  if (!q) return;
  input.value = '';
  const msgs = document.getElementById('aiMessages');
  msgs.innerHTML += `<div style="align-self:flex-end;max-width:80%;"><div style="background:var(--dt-dark);color:var(--dt-gold-light);padding:8px 12px;border-radius:12px 4px 12px 12px;font-size:0.8rem;line-height:1.6;">${q}</div></div>`;
  const t = document.createElement('div'); t.id = 'aiTyping';
  t.style.cssText = 'display:flex;gap:5px;padding:9px 13px;background:var(--dt-cream);border-radius:4px 12px 12px 12px;max-width:80%;';
  t.innerHTML = '<span style="width:6px;height:6px;background:#888;border-radius:50%;animation:bounce 1.2s infinite;display:block;"></span><span style="width:6px;height:6px;background:#888;border-radius:50%;animation:bounce 1.2s .2s infinite;display:block;"></span><span style="width:6px;height:6px;background:#888;border-radius:50%;animation:bounce 1.2s .4s infinite;display:block;"></span>';
  msgs.appendChild(t); msgs.scrollTop = msgs.scrollHeight;
  try {
    const ctx = { todaySales, transactionCount, itemsSold, products: products.slice(0, 20), lowStock: products.filter(p => p.stock <= p.min_stock), totalExpenses: expenses.reduce((s, e) => s + Number(e.amount), 0), netProfit: todaySales - expenses.reduce((s, e) => s + Number(e.amount), 0), retailReturns: retailReturns.length, wholesaleReturns: wholesaleReturns.length };
    const reply = await askBusinessAssistant(q, ctx);
    document.getElementById('aiTyping')?.remove();
    msgs.innerHTML += `<div style="max-width:86%;"><div style="font-size:0.65rem;color:var(--dt-muted);margin-bottom:3px;">Deshan AI</div><div style="background:var(--dt-cream);padding:8px 12px;border-radius:4px 12px 12px 12px;font-size:0.8rem;line-height:1.6;color:var(--dt-text);">${reply.replace(/\n/g,'<br>')}</div></div>`;
  } catch {
    document.getElementById('aiTyping')?.remove();
    msgs.innerHTML += `<div style="max-width:86%;"><div style="background:var(--dt-cream);padding:8px 12px;border-radius:4px 12px 12px 12px;font-size:0.8rem;color:var(--dt-low);">AI unavailable. Check internet / Gemini API key.</div></div>`;
  }
  msgs.scrollTop = msgs.scrollHeight;
};

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(html) {
  const box = document.getElementById('modalBox');
  const overlay = document.getElementById('modalOverlay');
  if (box) box.innerHTML = html;
  if (overlay) overlay.style.display = 'flex';
}
window.closeModal = () => { const o = document.getElementById('modalOverlay'); if (o) o.style.display = 'none'; };
document.addEventListener('click', e => { if (e.target && e.target.id === 'modalOverlay') closeModal(); });

// ============================================================
// TOAST
// ============================================================
function showToast(msg, type = 'ok') {
  const existing = document.getElementById('posToast');
  if (existing) existing.remove();
  const t = document.createElement('div'); t.id = 'posToast';
  const colors = { ok: '#3B6D11', warn: '#BA7517', info: '#1B5FA5', low: '#A32D2D' };
  t.style.cssText = `position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:${colors[type]||colors.ok};color:white;padding:8px 20px;border-radius:24px;font-size:0.8rem;font-weight:500;z-index:9999;pointer-events:none;animation:slideUp 0.2s ease;white-space:nowrap;`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ============================================================
// STYLES
// ============================================================
function injectStyles() {
  if (document.getElementById('posExtraStyles')) return;
  const s = document.createElement('style'); s.id = 'posExtraStyles';
  s.textContent = `.ai-chip{padding:5px 11px;border-radius:20px;border:0.5px solid var(--dt-border);background:white;font-size:0.71rem;color:#5F5E5A;cursor:pointer;white-space:nowrap;transition:all 0.15s;} .ai-chip:hover{border-color:var(--dt-gold);color:var(--dt-text);}`;
  document.head.appendChild(s);
}

// ============================================================
// UTILS
// ============================================================
let sidebarCollapsed = false;
window.toggleSidebar = () => {
  sidebarCollapsed = !sidebarCollapsed;
  const sb = document.getElementById('sidebar');
  const icon = document.getElementById('toggleIcon');
  const hids = ['sidebarLogoText','userBadgeText','logoutText','langToggle'];
  if (sidebarCollapsed) {
    sb.style.width = '56px'; if (icon) icon.style.transform = 'rotate(180deg)';
    hids.forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
    document.querySelectorAll('.sidebar-label').forEach(e => e.style.display = 'none');
    const t = document.getElementById('topTime'); if (t) t.style.display = 'none';
  } else {
    sb.style.width = '178px'; if (icon) icon.style.transform = '';
    hids.forEach(id => { const e = document.getElementById(id); if (e) e.style.display = ''; });
    document.querySelectorAll('.sidebar-label').forEach(e => e.style.display = '');
    const t = document.getElementById('topTime'); if (t) t.style.display = '';
  }
};

window.posLogout = () => { barcodeScanner?.stop(); navigate('login'); };

function updateTime() {
  const el = document.getElementById('topTime');
  if (el) el.textContent = new Date().toLocaleString('en-LK', { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
}
