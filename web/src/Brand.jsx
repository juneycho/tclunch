import React, { useContext } from 'react';
import { LangContext, LANGS, useT } from './i18n.js';

export function LangPicker({ compact = false }) {
  const t = useT();
  const { setLang } = useContext(LangContext);
  return (
    <select className="lang" value={t.lang} onChange={(e) => setLang(e.target.value)} aria-label={t('language')}>
      {LANGS.map(([k, label]) => <option key={k} value={k}>{compact ? k.toUpperCase() : label}</option>)}
    </select>
  );
}

export function Brand() {
  return (
    <div className="brand">
      <img src="/logo.png" alt="Thanh Cong" />
      <h1>Thanh Cong<br /><span>Lunch Request</span></h1>
    </div>
  );
}
