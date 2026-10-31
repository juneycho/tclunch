import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, setApiLang } from './api.js';
import { detectLang, LangContext, saveLang, translate, useT } from './i18n.js';
import { Brand, LangPicker } from './Brand.jsx';
import Login from './Login.jsx';
import Calendar from './Calendar.jsx';
import History from './History.jsx';
import My, { ChangePassword } from './My.jsx';
import Admin from './Admin.jsx';
import TabBar from './TabBar.jsx';
import PushPrompt, { PushBanner } from './PushPrompt.jsx';
import { refreshPush } from './push.js';

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
  useEffect(() => { if (user) api('/push/key').then(refreshPush).catch(() => {}); }, [user]);
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

  // 아래 탭은 2개만. 알림·관리자 화면은 위쪽 아이콘으로 연다.
  const tabs = [
    { key: 'calendar', label: t('tabCalendar'), icon: 'calendar' },
    { key: 'summary', label: t('tabSummary'), icon: 'table' },
  ];

  return (
    <div className={`page${tab === 'summary' ? ' wide' : ''}`}>
      <header className="topbar">
        <img src="/logo.png" alt="Thanh Cong" className="logo" />
        <div className="grow">
          <h1 className="title">{t('appTitle')}</h1>
          <div className="who">{t('hello', { name: user.name })} · <button className="link logout" onClick={() => api('/auth/logout', { method: 'POST' }).then(() => setUser(null))}>{t('logoutShort')}</button></div>
        </div>
        <LangPicker compact />
        <button className={`iconbtn${tab === 'my' ? ' on' : ''}`} onClick={() => setTab('my')} aria-label={t('tabMy')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" />
          </svg>
          <small>{t('bellLabel')}</small>
          {summary?.unread ? <i className="dot">{summary.unread}</i> : null}
        </button>
        {user.isAdmin && (
          <button className={`iconbtn${tab === 'admin' ? ' on' : ''}`} onClick={() => setTab('admin')} aria-label={t('tabAdmin')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
            </svg>
          </button>
        )}
      </header>
      <div className="stripe"><i /><i /><i /><i /></div>
      <div className="pad">
        <main>
          {tab === 'calendar' && <PushBanner />}
          {tab === 'calendar' && <Calendar user={user} summary={summary} onChange={refreshSummary} />}
          {tab === 'summary' && <History user={user} />}
          {tab === 'my' && <My user={user} onLogout={() => setUser(null)} onRead={refreshSummary} />}
          {tab === 'admin' && <Admin user={user} onChange={refreshSummary} />}
        </main>
      </div>
      <TabBar tabs={tabs} active={tab} onChange={setTab} />
      <PushPrompt />
    </div>
  );
}
