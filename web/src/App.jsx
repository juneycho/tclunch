import React, { useCallback, useEffect, useState } from 'react';
import { api, won } from './api.js';
import Login from './Login.jsx';
import Calendar from './Calendar.jsx';
import My from './My.jsx';
import Cook from './Cook.jsx';
import Admin from './Admin.jsx';
import { ChangePassword } from './My.jsx';

export default function App() {
  const [user, setUser] = useState(undefined);
  const [tab, setTab] = useState('calendar');
  const [summary, setSummary] = useState(null);

  const refreshSummary = useCallback(() => api('/summary').then(setSummary).catch(() => {}), []);
  useEffect(() => { api('/me').then((r) => setUser(r.user)).catch(() => setUser(null)); }, []);
  useEffect(() => { if (user) refreshSummary(); }, [user, tab, refreshSummary]);

  if (user === undefined) return <div className="center muted">불러오는 중…</div>;
  if (!user) return <Login onLogin={setUser} />;
  if (user.mustChangePw) {
    return (
      <div className="page narrow">
        <h1>비밀번호 변경</h1>
        <p className="muted">관리자가 만든 임시 비밀번호예요. 본인만 아는 비밀번호로 바꿔 주세요.</p>
        <ChangePassword onDone={() => setUser({ ...user, mustChangePw: false })} />
      </div>
    );
  }

  const tabs = [
    ['calendar', '달력'],
    ['my', `내 기록${summary?.unread ? ` (${summary.unread})` : ''}`],
    ...(user.isCook || user.isAdmin ? [['cook', '요리사']] : []),
    ...(user.isAdmin ? [['admin', '관리자']] : []),
  ];
  const b = summary?.budget;

  return (
    <div className="page">
      <header className="top">
        <div className="brand">TC 점심</div>
        <div className="who">{user.name}님</div>
      </header>
      {b ? (
        <div className="budget">
          <div><span className="label">총예산</span><b>{won(b.total)}</b></div>
          <div><span className="label">사용</span><b>{won(b.spent)}</b></div>
          <div><span className="label">남은 예산</span><b className={b.remaining < 0 ? 'neg' : 'pos'}>{won(b.remaining)}</b></div>
          <div className="bar"><i style={{ width: `${Math.min(100, (b.spent / Math.max(1, b.total)) * 100)}%` }} /></div>
          <div className="small muted">{b.startDate} ~ {b.endDate}{b.perMeal ? ` · 1인 1식 평균 ${won(b.perMeal)}` : ''}</div>
        </div>
      ) : null}
      <nav className="tabs">
        {tabs.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>
      <main>
        {tab === 'calendar' && <Calendar user={user} summary={summary} onChange={refreshSummary} />}
        {tab === 'my' && <My user={user} summary={summary} onLogout={() => setUser(null)} onRead={refreshSummary} />}
        {tab === 'cook' && <Cook user={user} onChange={refreshSummary} />}
        {tab === 'admin' && <Admin user={user} onChange={refreshSummary} />}
      </main>
    </div>
  );
}
