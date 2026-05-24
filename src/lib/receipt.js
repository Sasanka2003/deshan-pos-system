// DESHAN TEXTILE POS v3 — Receipt Generator (Fixed)
// English : jsPDF  — proper 80mm thermal layout, RETAIL badge below header
// Sinhala : HTML   — browser print with Noto Sans Sinhala, 80mm @page

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const SHOP = {
  name:    'Deshan Textile',
  address: 'Nadugala Wella, Matara',
  phone:   '078-4461570',
};

// ================================================================
// ENGLISH RECEIPT — jsPDF 80mm thermal
// ================================================================
export function generateReceiptPDF(bill, lang = 'en') {
  if (lang === 'si') { printReceiptSinhala(bill); return null; }

  // Dynamic height: estimate based on items
  const itemCount  = (bill.items || []).length;
  const pageHeight = 80 + (itemCount * 7) + 60;

  const doc = new jsPDF({ unit:'mm', format:[80, pageHeight], orientation:'portrait' });
  const W = 80;
  let y = 0;

  // ── HEADER BLOCK (dark background) ──────────────────────────
  const headerH = 30;
  doc.setFillColor(26, 20, 16);
  doc.rect(0, 0, W, headerH, 'F');

  doc.setTextColor(245, 217, 139);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text(SHOP.name, W / 2, 10, { align: 'center' });

  doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 180, 130);
  doc.text(SHOP.address, W / 2, 16, { align: 'center' });

  doc.setTextColor(245, 217, 139);
  doc.text('Tel: ' + SHOP.phone, W / 2, 21, { align: 'center' });

  y = headerH; // y = 30 — below header

  // ── SALE TYPE BADGE (outside dark block, clearly below it) ──
  if (bill.sale_type) {
    const label = bill.sale_type === 'wholesale' ? 'WHOLESALE' : 'RETAIL';
    const badgeW = 24; const badgeH = 6; const bx = (W - badgeW) / 2;
    doc.setFillColor(bill.sale_type === 'wholesale' ? 139 : 59,
                     bill.sale_type === 'wholesale' ? 101 :  109,
                     bill.sale_type === 'wholesale' ?  17 :   17);
    doc.setFillColor(245, 240, 225);
    doc.roundedRect(bx, y + 2, badgeW, badgeH, 2, 2, 'F');
    doc.setDrawColor(184, 134, 11);
    doc.setLineWidth(0.3);
    doc.roundedRect(bx, y + 2, badgeW, badgeH, 2, 2, 'S');
    doc.setTextColor(120, 85, 0); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text(label, W / 2, y + 6.5, { align: 'center' });
    y += 11;
  } else {
    y += 4;
  }

  // ── RETURN BADGE ─────────────────────────────────────────────
  if (bill.is_return) {
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(180, 40, 40);
    doc.text('** RETURN RECEIPT **', W / 2, y + 4, { align: 'center' });
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 70);
    doc.text('Original Bill: ' + (bill.original_bill_number || '—'), W / 2, y + 9, { align: 'center' });
    y += 13;
  }

  // ── DIVIDER ──────────────────────────────────────────────────
  doc.setDrawColor(210, 200, 185); doc.setLineWidth(0.3);
  doc.line(5, y, W - 5, y); y += 5;

  // ── BILL INFO ROWS ───────────────────────────────────────────
  const dateStr = new Date(bill.created_at || Date.now())
    .toLocaleString('en-LK', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

  const infoRows = [
    ['Bill No:',  bill.bill_number],
    ['Date:',     dateStr],
    ['Cashier:',  bill.cashier_name || 'Staff'],
    ['Payment:',  (bill.payment_method || 'cash').toUpperCase()],
    ...(bill.customer_name ? [['Customer:', bill.customer_name]] : []),
  ];

  doc.setTextColor(50, 50, 45); doc.setFontSize(7);
  infoRows.forEach(([lbl, val]) => {
    doc.setFont('helvetica', 'bold');  doc.text(lbl, 5, y);
    doc.setFont('helvetica', 'normal'); doc.text(String(val), 28, y);
    y += 4.8;
  });

  // ── DIVIDER ──────────────────────────────────────────────────
  y += 1; doc.line(5, y, W - 5, y); y += 4;

  // ── ITEMS TABLE ───────────────────────────────────────────────
  const tableData = (bill.items || []).map(i => {
    const qty   = i.quantity || i.qty || 1;
    const price = i.unit_price || i.price || 0;
    const total = i.total || (price * qty);
    return [
      i.product_name || i.name,
      Number.isInteger(qty) ? String(qty) : qty.toFixed(2),
      Number(price).toLocaleString(),
      Number(total).toLocaleString(),
    ];
  });

  doc.autoTable({
    startY: y,
    head: [['Item', 'Qty', 'Price', 'Total']],
    body: tableData,
    theme: 'plain',
    styles:     { fontSize:6.8, cellPadding:1.8, valign:'middle', textColor:[35,35,30] },
    headStyles: { fontSize:7,   fontStyle:'bold', textColor:[35,35,30], fillColor:[240,235,225], halign:'center' },
    columnStyles: {
      0: { cellWidth:30, halign:'left'   },
      1: { cellWidth:8,  halign:'center' },
      2: { cellWidth:15, halign:'right'  },
      3: { cellWidth:17, halign:'right', fontStyle:'bold'  },
    },
    margin: { left:5, right:5 },
    tableWidth: 70,
  });

  y = doc.lastAutoTable.finalY + 3;

  // ── DIVIDER ──────────────────────────────────────────────────
  doc.line(5, y, W - 5, y); y += 4;

  // ── TOTALS ────────────────────────────────────────────────────
  doc.setFontSize(7.5);

  const drawTotalRow = (label, value, bold = false, color = [70,70,60]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(...color);
    doc.text(label, 5, y);
    doc.text(value, W - 5, y, { align:'right' });
    y += 5;
  };

  drawTotalRow('Subtotal:', 'LKR ' + Number(bill.subtotal || 0).toLocaleString());

  if ((bill.discount_amount || 0) > 0) {
    drawTotalRow(
      `Discount (${bill.discount_percent || 0}%):`,
      '-LKR ' + Number(bill.discount_amount).toLocaleString(),
      false, [160, 60, 60]
    );
  }

  // Grand total highlighted box
  doc.setFillColor(242, 237, 225);
  doc.rect(3, y - 1, W - 6, 9, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20, 15, 10);
  doc.text('TOTAL:', 6, y + 5);
  doc.text('LKR ' + Number(bill.total).toLocaleString(), W - 5, y + 5, { align:'right' });
  y += 13;

  // ── FOOTER ────────────────────────────────────────────────────
  doc.setDrawColor(180, 170, 150); doc.line(10, y, W - 10, y); y += 4;
  doc.setTextColor(120, 110, 95); doc.setFontSize(6.5); doc.setFont('helvetica', 'italic');
  doc.text('Thank you! Please visit us again!', W / 2, y, { align:'center' }); y += 4.5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8);
  doc.text('Exchange within 7 days with this receipt.', W / 2, y, { align:'center' }); y += 5;
  doc.line(18, y, W - 18, y); y += 3.5;
  doc.setFontSize(5.2); doc.setTextColor(160, 150, 135);
  doc.text(bill.bill_number, W / 2, y, { align:'center' });

  return doc;
}

export function printReceipt(bill, lang = 'en') {
  if (lang === 'si') { printReceiptSinhala(bill); return; }
  const doc = generateReceiptPDF(bill, 'en');
  if (!doc) return;
  doc.autoPrint();
  const blob = doc.output('bloburl');
  const win  = window.open(blob);
  if (!win) doc.save('receipt-' + bill.bill_number + '.pdf');
}

export function downloadReceipt(bill, lang = 'en') {
  if (lang === 'si') { printReceiptSinhala(bill); return; }
  const doc = generateReceiptPDF(bill, 'en');
  if (doc) doc.save('receipt-' + bill.bill_number + '.pdf');
}

// ================================================================
// SINHALA RECEIPT — HTML browser print (80mm @page)
// ================================================================
export function printReceiptSinhala(bill) {
  const date = new Date(bill.created_at || Date.now())
    .toLocaleString('en-LK', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });

  const discLine = (bill.discount_amount || 0) > 0
    ? `<tr class="disc-row"><td>වට්ටම් (${bill.discount_percent}%)</td><td class="right">-රු ${Number(bill.discount_amount).toLocaleString()}</td></tr>` : '';

  const itemRows = (bill.items || []).map(i => {
    const qty   = i.quantity || i.qty || 1;
    const price = i.unit_price || i.price || 0;
    const total = i.total || (price * qty);
    return `<tr>
      <td class="item-name">${i.product_name || i.name}</td>
      <td class="center">${Number.isInteger(qty) ? qty : qty.toFixed(2)}</td>
      <td class="right">${Number(price).toLocaleString()}</td>
      <td class="right bold">${Number(total).toLocaleString()}</td>
    </tr>`;
  }).join('');

  const saleTypeLine = bill.sale_type
    ? `<div class="sale-badge">${bill.sale_type === 'wholesale' ? 'තොග විකිණීම' : 'සිල්ලර විකිණීම'}</div>` : '';

  const returnBlock = bill.is_return
    ? `<div class="return-badge">** ආපසු රිසිට්පත **</div>
       <div class="info-row"><span>මුල් බිල්:</span><span>${bill.original_bill_number || '—'}</span></div>` : '';

  const customerLine = bill.customer_name
    ? `<div class="info-row"><span>ගනුදෙනුකරු:</span><span>${bill.customer_name}</span></div>` : '';

  const html = `<!DOCTYPE html>
<html lang="si">
<head>
<meta charset="UTF-8">
<title>රිසිට්පත — ${bill.bill_number}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Sinhala:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }

  body {
    font-family: 'Noto Sans Sinhala', 'Iskoola Pota', 'FM Abhaya', 'Arial Unicode MS', sans-serif;
    font-size: 11.5px;
    color: #111;
    background: #fff;
    width: 80mm;
    margin: 0 auto;
  }

  /* ── HEADER ── */
  .header {
    background: #1a1410;
    color: #F5D98B;
    text-align: center;
    padding: 10px 6px 9px;
  }
  .header h1 { font-size: 15px; font-weight: 700; margin-bottom: 2px; letter-spacing: 0.03em; }
  .header .addr { font-size: 8.5px; color: #C8A96E; margin-bottom: 1px; }
  .header .phone { font-size: 8.5px; color: #F5D98B; }

  /* ── SALE TYPE BADGE ── */
  .sale-badge {
    text-align: center;
    font-size: 9px;
    font-weight: 700;
    border: 0.5px solid #B8860B;
    color: #7a5800;
    background: #FDF5E0;
    padding: 3px 0;
    letter-spacing: 0.06em;
  }

  /* ── RETURN ── */
  .return-badge {
    text-align: center;
    font-size: 10px;
    font-weight: 700;
    color: #B00;
    padding: 5px 0 2px;
  }

  /* ── DIVIDER ── */
  .dashed { border:none; border-top:1px dashed #ccc; margin:5px 0; }
  .solid  { border:none; border-top:1px solid #ccc;  margin:5px 0; }

  /* ── INFO ROWS ── */
  .info-section { padding: 5px 7px; }
  .info-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 3px;
    font-size: 10.5px;
    line-height: 1.4;
  }
  .info-row span:first-child { font-weight: 700; color: #333; min-width: 55px; }
  .info-row span:last-child  { text-align: right; }

  /* ── ITEMS TABLE ── */
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  .tbl-head { background: #f0ebe0; }
  .tbl-head th {
    padding: 4px 3px;
    font-size: 10px;
    font-weight: 700;
    text-align: center;
    border-bottom: 1px solid #888;
  }
  .tbl-head th:first-child { text-align: left; padding-left: 6px; }
  tbody tr { border-bottom: 0.5px solid #e8e8e8; }
  tbody td { padding: 4px 3px; vertical-align: top; line-height: 1.35; }
  .item-name { padding-left: 6px; max-width: 30mm; word-break: break-word; white-space: normal; }
  .center { text-align: center; }
  .right  { text-align: right; padding-right: 4px; }
  .bold   { font-weight: 700; }

  /* ── TOTALS ── */
  .totals { padding: 4px 7px; }
  .total-row {
    display: flex;
    justify-content: space-between;
    font-size: 10.5px;
    padding: 2px 0;
  }
  .disc-row td { color: #900; font-size: 10.5px; padding: 2px 3px; }
  .grand-total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 14px;
    font-weight: 700;
    background: #f5f0e0;
    border: 0.5px solid #d4b97a;
    border-radius: 4px;
    padding: 6px 8px;
    margin: 5px 0 3px;
  }

  /* ── FOOTER ── */
  .footer {
    text-align: center;
    padding: 7px 6px 8px;
    font-size: 10.5px;
  }
  .footer .thanks   { font-weight: 700; color: #222; margin-bottom: 3px; font-size: 11px; }
  .footer .exchange { font-size: 9px; color: #666; }
  .bill-no-footer   { text-align:center; font-size:8px; color:#bbb; padding-bottom:6px; }

  /* ── 80mm PRINT ── */
  @media print {
    html, body { background: white; }
    @page {
      size: 80mm auto;
      margin: 0;
    }
    body { margin: 0; padding: 0; }
  }
</style>
</head>
<body>

<div class="header">
  <h1>${SHOP.name}</h1>
  <div class="addr">${SHOP.address}</div>
  <div class="phone">දු.ක: ${SHOP.phone}</div>
</div>

${saleTypeLine}

<div class="info-section">
  ${returnBlock}
  <div class="info-row"><span>බිල් අංකය:</span><span>${bill.bill_number}</span></div>
  <div class="info-row"><span>දිනය:</span><span>${date}</span></div>
  <div class="info-row"><span>අයකැමි:</span><span>${bill.cashier_name || 'Staff'}</span></div>
  <div class="info-row"><span>ගෙවීම:</span><span>${(bill.payment_method || 'cash').toUpperCase()}</span></div>
  ${customerLine}
</div>

<hr class="dashed">

<table>
  <thead class="tbl-head">
    <tr>
      <th style="text-align:left;padding-left:6px;">භාණ්ඩය</th>
      <th>ප්‍රමා.</th>
      <th style="text-align:right;padding-right:4px;">මිල</th>
      <th style="text-align:right;padding-right:4px;">එකතුව</th>
    </tr>
  </thead>
  <tbody>${itemRows}</tbody>
</table>

<hr class="dashed">

<div class="totals">
  <div class="total-row">
    <span>එකතුව</span>
    <span>රු ${Number(bill.subtotal || 0).toLocaleString()}</span>
  </div>
  ${discLine}
  <div class="grand-total">
    <span>මුළු</span>
    <span>රු ${Number(bill.total).toLocaleString()}</span>
  </div>
</div>

<hr class="dashed">

<div class="footer">
  <div class="thanks">ස්තූතියි! නැවත වාරයක් හමුවෙමු! 🙏</div>
  <div class="exchange">දින 7ක් ඇතුළත රිසිට්පත සමඟ හුවමාරු කළ හැකිය.</div>
</div>
<div class="bill-no-footer">${bill.bill_number}</div>

<script>
  window.onload = () => { setTimeout(() => window.print(), 600); };
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = url; a.download = 'receipt-' + bill.bill_number + '-si.html';
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ================================================================
// DAILY REPORT — A4 PDF
// ================================================================
export function generateDailyReportPDF(summary, bills, returns, date) {
  const doc = new jsPDF({ unit:'mm', format:'a4' });
  const dateStr = new Date(date).toLocaleDateString('en-LK', {year:'numeric',month:'long',day:'numeric'});

  doc.setFillColor(26,20,16); doc.rect(0,0,210,32,'F');
  doc.setTextColor(245,217,139); doc.setFontSize(20); doc.setFont('helvetica','bold');
  doc.text('DESHAN TEXTILE', 15, 15);
  doc.setFontSize(11); doc.setFont('helvetica','normal');
  doc.setTextColor(200,169,110); doc.text('Daily Sales Report', 15, 24);
  doc.setTextColor(160,140,110); doc.text(dateStr, 195, 24, {align:'right'});

  let y = 42;
  const totalReturns = (returns||[]).reduce((s,r)=>s+Number(r.total||0),0);
  const netRevenue   = Number(summary.total_revenue||0) - totalReturns;

  const cards = [
    ['Gross Revenue', 'LKR '+Number(summary.total_revenue||0).toLocaleString()],
    ['Returns',       'LKR '+totalReturns.toLocaleString()],
    ['Net Revenue',   'LKR '+netRevenue.toLocaleString()],
    ['Transactions',  String(summary.transaction_count||0)],
    ['Discounts',     'LKR '+Number(summary.total_discounts||0).toLocaleString()],
  ];
  const cW = 37;
  cards.forEach((item,i)=>{
    const x = 12+i*(cW+3);
    doc.setFillColor(248,244,238); doc.roundedRect(x,y,cW,24,3,3,'F');
    doc.setFontSize(7); doc.setTextColor(120,110,95); doc.setFont('helvetica','normal');
    doc.text(item[0],x+cW/2,y+8,{align:'center'});
    doc.setFontSize(item[1].length>12?9:11); doc.setFont('helvetica','bold'); doc.setTextColor(26,20,16);
    doc.text(item[1],x+cW/2,y+18,{align:'center'});
  });
  y += 32;

  doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(26,20,16);
  doc.text('Transaction Details', 15, y); y += 5;

  doc.autoTable({
    startY:y,
    head:[['Bill No','Time','Cashier','Type','Items','Discount','Total','Payment']],
    body:(bills||[]).map(b=>[
      b.bill_number,
      new Date(b.created_at).toLocaleTimeString('en-LK',{hour:'2-digit',minute:'2-digit'}),
      b.cashier_name||'—',(b.sale_type||'retail').toUpperCase(),
      String(b.items?.length||0),
      b.discount_amount>0?'LKR '+Number(b.discount_amount).toLocaleString():'—',
      'LKR '+Number(b.total).toLocaleString(),
      (b.payment_method||'cash').toUpperCase()
    ]),
    styles:{fontSize:7.5,cellPadding:2.5},
    headStyles:{fillColor:[26,20,16],textColor:[245,217,139],fontStyle:'bold'},
    alternateRowStyles:{fillColor:[250,247,242]},
    margin:{left:15,right:15}
  });

  if ((returns||[]).length>0) {
    y = doc.lastAutoTable.finalY+8;
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(180,40,40);
    doc.text('Returns',15,y); y+=5;
    doc.autoTable({
      startY:y,
      head:[['Return No','Time','Type','Reason','Orig. Bill','Total']],
      body:returns.map(r=>[
        r.return_number,
        new Date(r.created_at).toLocaleTimeString('en-LK',{hour:'2-digit',minute:'2-digit'}),
        (r.sale_type||'retail').toUpperCase(),r.reason||'—',
        r.original_bill_number||'—',
        'LKR '+Number(r.total||0).toLocaleString()
      ]),
      styles:{fontSize:7.5,cellPadding:2.5},
      headStyles:{fillColor:[180,60,60],textColor:[255,255,255],fontStyle:'bold'},
      alternateRowStyles:{fillColor:[255,248,248]},
      margin:{left:15,right:15}
    });
  }

  const pages = doc.internal.getNumberOfPages();
  for(let i=1;i<=pages;i++){
    doc.setPage(i);
    doc.setFontSize(7); doc.setTextColor(150,140,125);
    doc.text('Deshan Textile POS · '+new Date().toLocaleString('en-LK')+' · Page '+i+' of '+pages,105,287,{align:'center'});
  }
  return doc;
}

