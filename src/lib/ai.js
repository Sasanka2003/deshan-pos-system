// src/lib/ai.js
// ============================================================
// DESHAN TEXTILE POS — AI Business Assistant
// Using free Gemini API (no credit card required)
// Get your free key at: https://aistudio.google.com
// ============================================================

// Use Gemini 1.5 Flash (free tier)
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export async function askBusinessAssistant(userMessage, businessContext) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  // Check for API key
  if (!apiKey || apiKey === 'your-gemini-key-here' || apiKey === 'YOUR_GEMINI_API_KEY') {
    return '⚠️ AI Assistant needs setup.\n\n1. Go to https://aistudio.google.com\n2. Click "Get API Key"\n3. Copy your key\n4. Add to .env file as:\n   VITE_GEMINI_API_KEY=AIza...your-key\n\nThen restart the app.';
  }

  const fullPrompt = buildSystemPrompt(businessContext) + '\n\nUser question: ' + userMessage;

  try {
    const response = await fetch(`${GEMINI_API}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
          topP: 0.9,
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data.error?.message || 'Gemini API error';
      
      if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key not valid')) {
        throw new Error('❌ Invalid API key. Get a free key from aistudio.google.com');
      }
      if (errMsg.includes('quota') || errMsg.includes('QUOTA')) {
        throw new Error('⚠️ Daily free limit reached (1500 requests/day). Try again tomorrow.');
      }
      if (errMsg.includes('model') || errMsg.includes('not found')) {
        throw new Error('⚠️ Model error. Using fallback response mode.');
      }
      throw new Error('AI error: ' + errMsg);
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) {
      return getFallbackResponse(userMessage, businessContext);
    }
    
    return reply;
  } catch (err) {
    console.error('AI Error:', err);
    if (err.message.includes('fetch') || err.message.includes('network')) {
      return '📡 No internet connection. Check your WiFi and try again.';
    }
    // Return fallback response instead of error
    return getFallbackResponse(userMessage, businessContext);
  }
}

// Fallback responses when API fails
function getFallbackResponse(question, ctx) {
  const q = question.toLowerCase();
  
  if (q.includes('low stock') || q.includes('reorder')) {
    const low = ctx.lowStock || [];
    if (low.length === 0) {
      return '✅ All items are well stocked. No urgent reorders needed.';
    }
    return `⚠️ Low stock items: ${low.slice(0,5).map(i => i.name).join(', ')}. Consider reordering ${low[0]?.name} first.`;
  }
  
  if (q.includes('sales') || q.includes('revenue') || q.includes('today')) {
    return `📊 Today's performance: LKR ${(ctx.todaySales || 0).toLocaleString()} from ${ctx.transactionCount || 0} sales. ${ctx.itemsSold || 0} items sold. Keep up the good work!`;
  }
  
  if (q.includes('best seller') || q.includes('top product')) {
    return '🏆 Your best-selling products are showing good movement. Check the Dashboard tab for detailed analytics.';
  }
  
  if (q.includes('avurudu') || q.includes('new year')) {
    return '🎉 For Avurudu season, stock up on traditional fabrics like Batik, Silk sarees, and Cotton. Consider bundle discounts and festive packaging.';
  }
  
  if (q.includes('pricing') || q.includes('price')) {
    return '💰 For the Sri Lankan textile market, ensure your prices are competitive with local competitors. Consider small margins on fast-moving items.';
  }
  
  return `💡 I'm here to help with your textile business! Try asking about:
• "Low stock alerts"
• "Today's sales summary" 
• "Best selling products"
• "Avurudu season preparation"
• "Pricing advice for cotton fabrics"`;
}

function buildSystemPrompt(ctx) {
  return `You are a friendly AI business assistant for Deshan Textile, a fabric and textile shop in Matara, Sri Lanka.

BUSINESS CONTEXT:
- Shop: Deshan Textile, Nadugala Wella, Nadugala, Matara
- Country: Sri Lanka | Currency: LKR (Sri Lankan Rupee)
- Business type: Retail textile / fabric shop

TODAY'S DATA:
- Total sales today: LKR ${(ctx.todaySales || 0).toLocaleString()}
- Transactions today: ${ctx.transactionCount || 0}
- Items sold today: ${ctx.itemsSold || 0}

INVENTORY STATUS (showing first 15 items):
${(ctx.products || []).slice(0,15).map(p => `- ${p.emoji || '🧵'} ${p.name}: LKR ${p.price}/unit, Stock: ${p.stock} (${p.stock <= p.min_stock ? '⚠️ LOW' : 'OK'})`).join('\n')}

LOW STOCK ITEMS: ${ctx.lowStock?.length > 0 ? ctx.lowStock.map(i => i.name).join(', ') : 'None currently'}

MONTHLY REVENUE: LKR ${(ctx.monthlyRevenue || 0).toLocaleString()}

YOUR ROLE:
- Provide helpful business insights
- Suggest which items to reorder
- Advise on pricing and promotions
- Help plan for Avurudu, Vesak, school seasons
- Speak in simple, friendly English
- Keep responses short (2-4 sentences)
- Always use LKR for prices`;
}

export const AI_QUICK_ACTIONS = [
  { label: '📊 Today\'s sales', prompt: 'Give me a summary of today\'s sales performance.' },
  { label: '⚠️ Low stock alert', prompt: 'Which items are critically low on stock and need urgent reordering?' },
  { label: '🏆 Best sellers', prompt: 'What are my best-selling products?' },
  { label: '📦 Reorder suggestions', prompt: 'Based on current stock, what should I reorder this week?' },
  { label: '💰 Pricing advice', prompt: 'Are my current prices competitive for the Sri Lankan textile market?' },
  { label: '🎉 Avurudu prep', prompt: 'How should I prepare my inventory for the upcoming Sinhala & Tamil New Year season?' },
  { label: '📈 Profit analysis', prompt: 'Can you estimate my profit margins?' },
  { label: '🐌 Slow items', prompt: 'Which items are moving slowly and what promotions should I run?' },
];

export async function generateDailyInsight(businessContext) {
  return askBusinessAssistant(
    'Give me a brief morning business briefing with 2 action items.',
    businessContext
  );
}