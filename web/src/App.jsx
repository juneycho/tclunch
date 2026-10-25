import React, { useCallback, useEffect, useState } from 'react';
import { api, won } from './api.js';
import Login from './Login.jsx';
import Calendar from './Calendar.jsx';
import My from './My.jsx';
import Cook from './Cook.jsx';
import Admin from './Admin.jsx';
import TabBar from './TabBar.jsx';
import { ChangePassword } from './My.jsx';

export default function App() {
  const [user, setUser] = useState(undefined);
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get('tab') || 'calendar');
  const [summary, setSummary] = useState(null);

  const refreshSummary = useCallback(() => api('/summary').then(setSummary).catch(() => {}), []);
  useEffect(() => { api('/me').then((r) => setUser(r.user)).catch(() => setUser(null)); }, []);
  useEffect(() => { if (user) refreshSummary(); }, [user, tab, refreshSummary]);
  // 푸시 함수가 자기 주소를 DB에 기억하게 한 번 깨워 둔다 (실패해도 앱 사용에는 지장 없음)
  useEffect(() => { if (user) api('/push/key').catch(() => {}); }, [user]);

  if (user === undefined) return <div className="center muted pad">불러오는 중…</div>;
  if (!user) return <Login onLogin={setUser} />;
  if (user.mustChangePw) {
    return (
      <div className="page narrow pad">
        <h1>비밀번호 변경</h1>
        <p className="muted">관리자가 만든 임시 비밀번호예요. 본인만 아는 비밀번호로 바꿔 주세요.</p>
        <ChangePassword onDone={() => setUser({ ...user, mustChangePw: false })} />
      </div>
    );
  }

  const tabs = [
    { key: 'calendar', label: '달력', icon: 'calendar' },
    { key: 'my', label: '내 기록', icon: 'me', badge: summary?.unread },
    ...(user.isCook || user.isAdmin ? [{ key: 'cook', label: '요리사', icon: 'cook' }] : []),
    ...(user.isAdmin ? [{ key: 'admin', label: '관리자', icon: 'admin' }] : []),
  ];
  const b = summary?.budget;

  return (
    <div className="page">
      <header className="hero-bar">
        <div>
          <p className="kicker">TC COMPANY LUNCH</p>
          <h1 className="title">TC <span>LUNCH</span></h1>
        </div>
        <div className="who">{user.name}님</div>
      </header>
      <div className="pad">
        {b ? (
          <div className="budget">
            <div><span className="label">총예산</span><b>{won(b.total)}</b></div>
            <div><span className="label">사용</span><b>{won(b.spent)}</b></div>
            <div><span className="label">남은 예산</span><b className={b.remaining < 0 ? 'neg' : 'pos'}>{won(b.remaining)}</b></div>
            <div className="bar"><i style={{ width: `${Math.min(100, (b.spent / Math.max(1, b.total)) * 100)}%` }} /></div>
            <div className="small muted">{b.startDate} ~ {b.endDate}{b.perMeal ? ` · 1인 1식 평균 ${won(b.perMeal)}` : ''}</div>
          </div>
        ) : null}
        <main>
          {tab === 'calendar' && <Calendar user={user} summary={summary} onChange={refreshSummary} />}
          {tab === 'my' && <My user={user} summary={summary} onLogout={() => setUser(null)} onRead={refreshSummary} />}
          {tab === 'cook' && <Cook user={user} onChange={refreshSummary} />}
          {tab === 'admin' && <Admin user={user} onChange={refreshSummary} />}
        </main>
      </div>
      <TabBar tabs={tabs} active={tab} onChange={setTab} />
    </div>
  );
}
