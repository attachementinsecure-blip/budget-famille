import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './style.css';

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);

// Service worker : « réseau d'abord »
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// Retrait du badge « Powered by Netlify » : tout ce qui est ajouté hors de l'application
const GARDES = new Set(['SCRIPT', 'STYLE', 'LINK', 'NOSCRIPT', 'TEMPLATE']);
function retirerBadge() {
  for (const el of [...document.body.children]) {
    if (el.id === 'root' || GARDES.has(el.tagName)) continue;
    el.remove();
  }
}
retirerBadge();
new MutationObserver(retirerBadge).observe(document.body, { childList: true });
