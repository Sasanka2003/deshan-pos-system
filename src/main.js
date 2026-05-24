import './styles/main.css';
import { renderLogin } from './pages/login.js';
import { renderPOS }   from './pages/pos.js';

const app = document.getElementById('app');

export function navigate(page, data = {}) {
  app.innerHTML = '';
  if (page === 'pos') renderPOS(app, data);
  else renderLogin(app);
}

navigate('login');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
