import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Check, CloudOff, Loader2 } from 'lucide-react';
import { heure } from './format.js';

// ---------- Messages en haut de l'écran ----------
const FlashCtx = createContext(() => {});
export const useFlash = () => useContext(FlashCtx);
export function FlashProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const flash = useCallback((texte, type = 'succes') => {
    setMsg({ texte, type, id: Date.now() });
  }, []);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), msg.type === 'erreur' ? 6000 : 3000); return () => clearTimeout(t); }, [msg]);
  return (
    <FlashCtx.Provider value={flash}>
      {children}
      {msg && <div key={msg.id} className={`flash flash-${msg.type}`} role="status" onClick={() => setMsg(null)}>{msg.texte}</div>}
    </FlashCtx.Provider>
  );
}

// ---------- Fenêtre (plein écran depuis le bas sur téléphone) ----------
export function Modal({ titre, onClose, children, pied }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc); document.body.classList.add('modal-ouverte');
    return () => { document.removeEventListener('keydown', esc); document.body.classList.remove('modal-ouverte'); };
  }, [onClose]);
  return (
    <div className="modal-fond" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titre}>
        <div className="modal-tete">
          <h2>{titre}</h2>
          <button className="btn-icone" onClick={onClose} aria-label="Fermer"><X size={22} /></button>
        </div>
        <div className="modal-corps">{children}</div>
        {pied && <div className="modal-pied">{pied}</div>}
      </div>
    </div>
  );
}

export function Confirmer({ texte, action = 'Confirmer', danger, onOui, onNon }) {
  return (
    <Modal titre="Confirmation" onClose={onNon} pied={<>
      <button className="btn btn-second" onClick={onNon}>Annuler</button>
      <button className={`btn ${danger ? 'btn-danger' : 'btn-primaire'}`} onClick={onOui}>{action}</button>
    </>}>
      <p className="texte-confirm">{texte}</p>
    </Modal>
  );
}

// ---------- Indicateur de sauvegarde ----------
export function SaveBadge({ etat, quand }) {
  if (!etat) return null;
  if (etat === 'encours') return <span className="savebadge encours"><Loader2 size={14} className="tourne" /> Enregistrement…</span>;
  if (etat === 'local') return <span className="savebadge local"><CloudOff size={14} /> Gardé sur le téléphone</span>;
  if (etat === 'brouillon') return <span className="savebadge brouillon"><Check size={14} /> Brouillon gardé à {heure(quand)}</span>;
  return <span className="savebadge ok"><Check size={14} /> Enregistré à {heure(quand)}</span>;
}

// ---------- Onglets ----------
export function Tabs({ valeur, onChange, options }) {
  return (
    <div className="tabs" role="tablist">
      {options.map(([v, l]) => (
        <button key={v} role="tab" aria-selected={valeur === v} className={valeur === v ? 'actif' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export function Progress({ parts }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.valeur), 0);
  return (
    <div className="progress">
      {total > 0 && parts.map((p, i) => p.valeur > 0 && <span key={i} style={{ width: `${(p.valeur / total) * 100}%`, background: p.couleur }} />)}
    </div>
  );
}

// ---------- Navigation de période ----------
export function NavPeriode({ label, onPrec, onSuiv }) {
  return (
    <div className="navperiode">
      <button className="btn-icone" onClick={onPrec} aria-label="Période précédente"><ChevronLeft size={22} /></button>
      <strong>{label}</strong>
      <button className="btn-icone" onClick={onSuiv} aria-label="Période suivante"><ChevronRight size={22} /></button>
    </div>
  );
}

// ---------- Choix de personnes ----------
export function ChoixPersonnes({ membres, valeur, onChange, multiple }) {
  const sel = multiple ? valeur || [] : [valeur];
  const basculer = (id) => {
    if (!multiple) return onChange(id);
    onChange(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  };
  return (
    <div className="choixpers">
      {membres.map((m) => (
        <button type="button" key={m.id} className={sel.includes(m.id) ? 'actif' : ''} onClick={() => basculer(m.id)} aria-pressed={sel.includes(m.id)}>
          {m.prenom}
        </button>
      ))}
    </div>
  );
}

export function Vide({ children }) { return <div className="vide">{children}</div>; }

export function Tuile({ label, valeur, ton, sous }) {
  return (
    <div className={`tuile ${ton ? 'ton-' + ton : ''}`}>
      <span className="tuile-label">{label}</span>
      <span className="tuile-valeur">{valeur}</span>
      {sous && <span className="tuile-sous">{sous}</span>}
    </div>
  );
}

export function Pastille({ ton = 'info', children }) { return <span className={`pastille ton-${ton}`}>{children}</span>; }

// groupe : pour des boutons (un <label> autour de boutons déclencherait le premier au toucher)
export function Champ({ label, children, aide, groupe }) {
  const Tag = groupe ? 'div' : 'label';
  return (
    <Tag className="champ" {...(groupe ? { role: 'group', 'aria-label': label } : {})}>
      <span className="champ-label">{label}</span>
      {children}
      {aide && <span className="champ-aide">{aide}</span>}
    </Tag>
  );
}
