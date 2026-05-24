// DESHAN TEXTILE POS v3 — WhatsApp
const SHOP_NAME = 'Deshan Textile';

function waLink(phone, message) {
  const p = phone.replace(/[^0-9]/g,'');
  const intl = p.startsWith('0') ? '94'+p.slice(1) : p;
  window.open(`https://wa.me/${intl}?text=${encodeURIComponent(message)}`, '_blank');
}

export function sendReceiptViaWhatsApp(bill, customerPhone, lang = 'en') {
  waLink(customerPhone, lang === 'si' ? formatSinhala(bill) : formatEnglish(bill));
}

function formatEnglish(bill) {
  const date = new Date(bill.created_at||Date.now()).toLocaleString('en-LK');
  const lines = (bill.items||[]).map(i=>`  • ${i.product_name||i.name} x${i.quantity||i.qty} — LKR ${Number(i.total||(i.price*i.qty)).toLocaleString()}`).join('\n');
  const disc = (bill.discount_amount||0)>0 ? `\nDiscount (${bill.discount_percent}%): -LKR ${Number(bill.discount_amount).toLocaleString()}` : '';
  return `🧵 *${SHOP_NAME}*\nNadugala Wella, Matara | Tel: 078-4461570\n\n📋 *Receipt — ${bill.bill_number}*\n📅 ${date}\n💳 Payment: ${(bill.payment_method||'cash').toUpperCase()}\n\n*Items:*\n${lines}\n\n─────────────────\nSubtotal: LKR ${Number(bill.subtotal).toLocaleString()}${disc}\n*TOTAL: LKR ${Number(bill.total).toLocaleString()}*\n─────────────────\n\nThank you for shopping at ${SHOP_NAME}! 🙏\nExchange within 7 days with receipt.`;
}

function formatSinhala(bill) {
  const date = new Date(bill.created_at||Date.now()).toLocaleString('en-LK');
  const lines = (bill.items||[]).map(i=>`  • ${i.product_name||i.name} x${i.quantity||i.qty} — රු ${Number(i.total||(i.price*i.qty)).toLocaleString()}`).join('\n');
  const disc = (bill.discount_amount||0)>0 ? `\nවට්ටම් (${bill.discount_percent}%): -රු ${Number(bill.discount_amount).toLocaleString()}` : '';
  return `🧵 *${SHOP_NAME}*\nනාදුගල වෙල්ල, මාතර | දු.ක: 078-4461570\n\n📋 *බිල්පත — ${bill.bill_number}*\n📅 ${date}\n💳 ගෙවීම: ${(bill.payment_method||'cash').toUpperCase()}\n\n*භාණ්ඩ:*\n${lines}\n\n─────────────────\nඑකතුව: රු ${Number(bill.subtotal).toLocaleString()}${disc}\n*මුළු: රු ${Number(bill.total).toLocaleString()}*\n─────────────────\n\n${SHOP_NAME} හිදී සාප්පු සවාරි යාමට ස්තූතියි! 🙏\nදින 7ක් ඇතුළත රිසිට්පත සමඟ හුවමාරු කළ හැකිය.`;
}

export function sendLowStockAlert(lowItems, managerPhone) {
  const list = lowItems.map(i=>`  ⚠️ ${i.emoji||''} ${i.name}: ${i.stock} left (min: ${i.min_stock})`).join('\n');
  waLink(managerPhone, `🚨 *${SHOP_NAME} — Low Stock Alert*\n\n${list}\n\nPlease arrange purchase orders. 📦`);
}

export function sendDailySummary(summary, managerPhone) {
  const msg = `📊 *${SHOP_NAME} — Daily Summary*\n📅 ${new Date().toLocaleDateString('en-LK')}\n\n💰 Revenue: LKR ${Number(summary.revenue||0).toLocaleString()}\n🧾 Transactions: ${summary.transactions||0}\n📦 Items Sold: ${summary.items||0}\n💸 Expenses: LKR ${Number(summary.expenses||0).toLocaleString()}\n📈 *Net Profit: LKR ${Number((summary.revenue||0)-(summary.expenses||0)).toLocaleString()}*\n\nGreat work today! 🙏`;
  waLink(managerPhone, msg);
}
