// DESHAN TEXTILE POS v3 — Login Page
import { verifyPin } from '../lib/supabase.js';
import { navigate } from '../main.js';

export function renderLogin(container) {
  container.innerHTML = `
  <div class="login-screen">
    <div style="text-align:center;margin-bottom:2rem;">
      <div style="width:72px;height:72px;background:var(--dt-gold);border-radius:18px;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;font-size:36px;">🧵</div>
      <h1 style="font-size:1.5rem;font-weight:600;color:var(--dt-gold-light);letter-spacing:0.05em;">Deshan Textile</h1>
      <p style="font-size:0.72rem;color:#8B7355;letter-spacing:0.15em;margin-top:4px;">POINT OF SALE · Nadugala, Matara</p>
    </div>

    <div style="background:rgba(255,255,255,0.05);border:0.5px solid rgba(184,134,11,0.3);border-radius:14px;padding:2rem;width:100%;max-width:340px;">
      <p style="text-align:center;font-size:0.88rem;color:var(--dt-gold-light);margin-bottom:1.5rem;font-weight:500;">ලොගින් වන්න / Select Role &amp; PIN</p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:1.5rem;">
        <button id="btnManager" class="role-btn active" onclick="selectRole('manager')">
          <span style="font-size:28px;display:block;margin-bottom:6px;">👔</span>
          <span style="font-size:0.82rem;font-weight:500;">Manager</span>
          <span style="display:block;font-size:0.62rem;color:#8B7355;margin-top:2px;">කළමනාකරු</span>
        </button>
        <button id="btnCashier" class="role-btn" onclick="selectRole('cashier')">
          <span style="font-size:28px;display:block;margin-bottom:6px;">🧾</span>
          <span style="font-size:0.82rem;font-weight:500;">Cashier</span>
          <span style="display:block;font-size:0.62rem;color:#8B7355;margin-top:2px;">අයකැමි</span>
        </button>
      </div>

      <div id="pinDots" style="display:flex;justify-content:center;gap:12px;margin-bottom:1.5rem;">
        ${[0,1,2,3].map(i=>`<div id="dot${i}" style="width:14px;height:14px;border-radius:50%;border:1.5px solid rgba(184,134,11,0.4);background:transparent;transition:background 0.2s;"></div>`).join('')}
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
        ${[1,2,3,4,5,6,7,8,9].map(n=>`<button class="num-btn" onclick="enterPin('${n}')">${n}</button>`).join('')}
        <button class="num-btn" onclick="delPin()" style="font-size:1.1rem;">⌫</button>
        <button class="num-btn" onclick="enterPin('0')">0</button>
        <button class="num-btn enter-btn" onclick="doLogin()">Enter</button>
      </div>

      <p id="loginError" style="text-align:center;color:#E24B4A;font-size:0.75rem;margin-top:12px;min-height:16px;"></p>
      <p style="text-align:center;font-size:0.65rem;color:#3a2e1f;margin-top:4px;">Default: Manager 1234 | Cashier 0000</p>
    </div>
  </div>`;

  initLoginLogic();
}

function initLoginLogic() {
  let role = 'manager', pin = '';

  window.selectRole = (r) => {
    role = r; pin = ''; updateDots();
    document.getElementById('btnManager').classList.toggle('active', r==='manager');
    document.getElementById('btnCashier').classList.toggle('active', r==='cashier');
    document.getElementById('loginError').textContent = '';
  };
  window.enterPin = (d) => {
    if (pin.length >= 4) return;
    pin += d; updateDots();
    if (pin.length === 4) setTimeout(window.doLogin, 300);
  };
  window.delPin = () => { pin = pin.slice(0,-1); updateDots(); };
  window.doLogin = async () => {
    if (pin.length !== 4) return;
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';
    const demoPins = { manager:'1234', cashier:'0000' };
    let user = null;
    if (demoPins[role] === pin) {
      user = { id:'demo-'+role, name: role==='manager'?'Manager':'Cashier 1', role };
    } else {
      try { user = await verifyPin(role, pin); } catch {}
    }
    if (user) {
      navigate('pos', { user });
    } else {
      pin = ''; updateDots();
      errEl.textContent = 'Wrong PIN. Try again. / PIN වැරදිය.';
      const card = document.querySelector('[style*="rgba(255,255,255,0.05)"]');
      if (card) { card.style.borderColor='rgba(226,75,74,0.7)'; setTimeout(()=>card.style.borderColor='rgba(184,134,11,0.3)',800); }
    }
  };

  function updateDots() {
    for (let i=0;i<4;i++) {
      const dot = document.getElementById('dot'+i);
      if (dot) { dot.style.background = i<pin.length?'var(--dt-gold)':'transparent'; dot.style.borderColor = i<pin.length?'var(--dt-gold)':'rgba(184,134,11,0.4)'; }
    }
  }
}
