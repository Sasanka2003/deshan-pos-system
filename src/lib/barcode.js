// DESHAN TEXTILE POS v4 — Barcode System
// ✅ USB HID Scanner (plug & play — no drivers needed)
// ✅ EAN-13 barcode generation (SVG via JsBarcode)
// ✅ Code128 for SKU barcodes
// ✅ Barcode print sheet (print multiple labels at once)

import JsBarcode from 'jsbarcode';

// ============================================================
// USB BARCODE SCANNER (keyboard wedge)
// ============================================================
export class BarcodeScanner {
  constructor(onScan) {
    this.onScan = onScan;
    this.buffer = '';
    this.lastKeyTime = 0;
    this.timeout = null;
    this._handler = this._handleKeyDown.bind(this);
  }

  _handleKeyDown(e) {
    // Ignore if user is typing in an input/textarea (except productSearch)
    const tag = e.target.tagName;
    if ((tag === 'INPUT' || tag === 'TEXTAREA') && e.target.id !== 'productSearch') return;

    const now = Date.now();
    if (now - this.lastKeyTime > 120 && this.buffer.length > 0) {
      this.buffer = '';
    }
    this.lastKeyTime = now;

    if (e.key === 'Enter' && this.buffer.length >= 4) {
      const code = this.buffer.trim();
      this.buffer = '';
      clearTimeout(this.timeout);
      this.onScan(code);
      e.preventDefault();
      return;
    }

    if (e.key.length === 1) {
      this.buffer += e.key;
    }

    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      if (this.buffer.length >= 4) {
        const code = this.buffer.trim();
        this.buffer = '';
        this.onScan(code);
      } else {
        this.buffer = '';
      }
    }, 250);
  }

  start() { window.addEventListener('keydown', this._handler, true); }
  stop()  { window.removeEventListener('keydown', this._handler, true); this.buffer = ''; clearTimeout(this.timeout); }
}

// ============================================================
// EAN-13 CHECK DIGIT
// ============================================================
export function ean13CheckDigit(base12) {
  const digits = String(base12).padStart(12, '0').slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function generateEAN13(seed) {
  // Use numeric seed (product SKU digits or timestamp)
  const numeric = String(seed).replace(/\D/g, '').padStart(12, '0').slice(0, 12);
  const check   = ean13CheckDigit(numeric);
  return numeric + check;
}

// ============================================================
// BARCODE RENDER — renders to SVG element
// ============================================================
export function renderBarcodeToSVG(svgElement, code, format = 'auto') {
  if (!code || !svgElement) return false;
  try {
    const isEAN = /^\d{13}$/.test(code);
    const isCODE39 = /^[A-Z0-9\-. $/+%]+$/.test(code);
    let fmt = format;
    if (format === 'auto') {
      if (isEAN) fmt = 'EAN13';
      else if (/^\d{8}$/.test(code)) fmt = 'EAN8';
      else fmt = 'CODE128';
    }
    JsBarcode(svgElement, code, {
      format: fmt,
      width: 1.5,
      height: 50,
      displayValue: true,
      fontSize: 10,
      margin: 4,
      lineColor: '#000',
      background: '#fff',
    });
    return true;
  } catch (e) {
    console.warn('Barcode render error:', e);
    return false;
  }
}

// ============================================================
// BARCODE LABEL HTML (for printing)
// ============================================================
export function generateBarcodeLabel(product, qty = 1) {
  const barcode = product.barcode || generateEAN13(
    String(product.sku || product.name).replace(/\D/g, '') || Date.now().toString().slice(-12)
  );

  const labels = Array.from({ length: qty }, () => `
    <div class="label">
      <div class="shop-name">Deshan Textile</div>
      <div class="prod-name">${product.name}</div>
      <svg class="barcode-svg" data-barcode="${barcode}"></svg>
      <div class="price">LKR ${Number(product.price).toLocaleString()}</div>
      ${product.sku ? `<div class="sku">SKU: ${product.sku}</div>` : ''}
    </div>
  `).join('');

  return { html: labels, barcode };
}

// ============================================================
// BARCODE SHEET MODAL — print multiple product labels
// ============================================================
export function openBarcodePrintModal(products, selectedIds) {
  const selected = products.filter(p => selectedIds.includes(p.id));
  if (selected.length === 0) { alert('Select at least one product'); return; }

  const win = window.open('', '_blank', 'width=800,height=600');
  if (!win) { alert('Popup blocked — allow popups for this site'); return; }

  const labels = selected.map(p => {
    const barcode = p.barcode || generateEAN13(
      String(p.sku || p.name).replace(/\D/g, '').padStart(12, '0').slice(0, 12)
    );
    return { ...p, _barcode: barcode };
  });

  win.document.write(`<!DOCTYPE html><html><head>
  <meta charset="UTF-8">
  <title>Barcode Labels — Deshan Textile</title>
  <style>
    body { font-family: Arial, sans-serif; background: white; margin: 0; }
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
      .labels { gap: 2mm; padding: 4mm; }
    }
    .no-print { padding: 12px; background: #f5f5f5; display: flex; gap: 8px; align-items: center; }
    .no-print button { padding: 8px 18px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .print-btn { background: #1a1410; color: #F5D98B; }
    .close-btn  { background: #eee; color: #333; }
    .labels { display: flex; flex-wrap: wrap; gap: 4mm; padding: 8mm; }
    .label {
      border: 0.5px solid #ddd; border-radius: 4px;
      padding: 4px 6px; width: 50mm; text-align: center;
      break-inside: avoid; box-sizing: border-box;
    }
    .shop-name { font-size: 7pt; color: #B8860B; font-weight: bold; margin-bottom: 1px; }
    .prod-name { font-size: 7.5pt; font-weight: 600; color: #1a1410; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .price     { font-size: 9pt; font-weight: bold; color: #1a1410; margin-top: 2px; }
    .sku       { font-size: 6pt; color: #888; margin-top: 1px; }
    svg.barcode-svg { max-width: 100%; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  </head><body>
  <div class="no-print">
    <button class="print-btn" onclick="window.print()">🖨 Print Labels</button>
    <button class="close-btn" onclick="window.close()">Close</button>
    <span style="font-size:13px;color:#666;">${labels.length} label(s) ready</span>
  </div>
  <div class="labels">
    ${labels.map(p => `
      <div class="label">
        <div class="shop-name">Deshan Textile</div>
        <div class="prod-name">${p.name}</div>
        <svg class="barcode-svg" id="bc_${p.id}"></svg>
        <div class="price">LKR ${Number(p.price).toLocaleString()}</div>
        ${p.sku ? `<div class="sku">SKU: ${p.sku}</div>` : ''}
      </div>
    `).join('')}
  </div>
  <script>
    window.onload = function() {
      ${labels.map(p => `
        try {
          JsBarcode('#bc_${p.id}', '${p._barcode}', { format: '${/^\d{13}$/.test(p._barcode) ? 'EAN13' : 'CODE128'}', width:1.4, height:40, displayValue:true, fontSize:9, margin:3 });
        } catch(e) { console.warn(e); }
      `).join('')}
    };
  <\/script>
  </body></html>`);
  win.document.close();
}
