import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './style.css';

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);

// Service worker : « réseau d'abord »
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
// Retrait d'un éventuel badge Netlify
const retirerBadge = () => document.querySelectorAll('[data-netlify-deploy-id], #netlify-badge, .netlify-badge').forEach((e) => e.remove());
setTimeout(retirerBadge, 1500);
