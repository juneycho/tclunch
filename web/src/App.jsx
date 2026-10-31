import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, setApiLang } from './api.js';
import { detectLang, LangContext, money, saveLang, translate, useT } from './i18n.js';
import { Brand, LangPicker } from './Brand.jsx';
import Login from './Login.jsx';
import Calendar from './Calendar.jsx';
import Sheet from './Sheet.jsx';
import Summary from './Summary.jsx';
import My, { ChangePassword } from './My.jsx';
import Admin from './Admin.jsx';
import TabBar from './TabBar.jsx';

export default function App() {
  const [lang, setLangState] = useState(detectLang);
  setApiLang(lang);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const ctx = useMemo(() => ({ lang, setLang: (l) => { saveLang(l); setLangState(l); } }), [lang]);
  return <LangContext.Provider value={ctx}><Main /></LangContext.Provider>;
}

function Main() {
  const t = useT();
  const [user, setUser] = useState(undefined);
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get('tab') || 'calendar');
  const [summary, setSummary] = useState(null);

  const refreshSummary = useCallback(() => api('/summary').then(setSummary).catch(() => {}), []);
  useEffect(() => { api('/me').then((r) => setUser(r.user)).catch(() => setUser(null)); }, []);
  useEffect(() => { if (user) refreshSummary(); }, [user, tab, refreshSummary]);
  // 푸시 함수가 자기 주소를 DB에 기억하게 한 번 깨워 둔다 (실패해도 앱 사용에는 지장 없음)
  useEffect(() => { if (user) api('/push/key').catch(() => {}); }, [user]);
  useEffect(() => { document.title = translate(t.lang, 'appTitle'); }, [t.lang]);

  if (user === undefined) return <div className="center muted pad">{t('loading')}</div>;
  if (!user) return <Login onLogin={setUser} />;
  if (user.mustChangePw) {
    return (
      <div className="page narrow pad">
        <Brand />
        <h2>{t('changePwTitle')}</h2>
        <p className="muted">{t('changePwHint')}</p>
        <ChangePassword first onDone={() => setUser({ ...user, mustChangePw: false })} />
      </div>
    );
  }

  const tabs = [
    { key: 'calendar', label: t('tabCalendar'), icon: 'calendar' },
    { key: 'sheet', label: t('tabSheet'), icon: 'cook' },
    { key: 'summary', label: t('tabSummary'), icon: 'table' },
    { key: 'my', label: t('tabMy'), icon: 'me', badge: summary?.unread },
    ...(user.isAdmin ? [{ key: 'admin', label: t('tabAdmin'), icon: 'admin' }] : []),
  ];
  const b = summary?.budget;

  return (
    <div className={`page${tab === 'summary' || tab === 'sheet' ? ' wide' : ''}`}>
      <header className="topbar">
        <img src="/logo.png" alt="Thanh Cong" className="logo" />
        <div className="grow">
          <h1 className="title">Thanh Cong Lunch Request</h1>
          <div className="who">{t('hello', { name: user.name })}</div>
        </div>
        <LangPicker />
      </header>
      <div className="stripe"><i /><i /><i /><i /></div>
      <div className="pad">
        {b && (tab === 'calendar' || tab === 'sheet') ? (
          <div className="budget">
            <div><span className="label">{t('budgetTotal')}</span><b>{money(b.total)}</b></div>
            <div><span className="label">{t('budgetSpent')}</span><b>{money(b.spent)}</b></div>
            <div><span className="label">{t('budgetLeft')}</span><b className={b.remaining < 0 ? 'neg' : 'pos'}>{money(b.remaining)}</b></div>
            <div className="bar"><i style={{ width: `${Math.min(100, (b.spent / Math.max(1, b.total)) * 100)}%` }} /></div>
            <div className="small muted">{b.startDate} ~ {b.endDate}{b.perMeal ? ` · ${t('perMealAvg', { v: money(b.perMeal) })}` : ''}</div>
          </div>
        ) : null}
        <main>
          {tab === 'calendar' && <Calendar user={user} summary={summary} onChange={refreshSummary} />}
          {tab === 'sheet' && <Sheet user={user} summary={summary} onChange={refreshSummary} />}
          {tab === 'summary' && <Summary user={user} />}
          {tab === 'my' && <My user={user} summary={summary} onLogout={() => setUser(null)} onRead={refreshSummary} />}
          {tab === 'admin' && <Admin user={user} onChange={refreshSummary} />}
        </main>
      </div>
      <TabBar tabs={tabs} active={tab} onChange={setTab} />
    </div>
  );
}
