import React, { useEffect, useState } from 'react';
import { api, fmtDay } from './api.js';

export default function My({ user, summary, onLogout, onRead }) {
  const [notes, setNotes] = useState([]);
  const [hist, setHist] = useState([]);

  useEffect(() => {
    api('/notifications').then((r) => {
      setNotes(r.notifications);
      if (r.notifications.some((n) => !n.read)) api('/notifications/read', { method: 'POST' }).then(onRead);
    });
    api('/my/history').then((r) => setHist(r.history));
  }, [onRead]);

  const ns = summary?.noShows;
  return (
    <div className="stack">
      {user.isMember && ns && (
        <div className="stats">
          <div><b>{ns.signups}</b><span>지난 신청</span></div>
          <div><b className={ns.total ? 'neg' : ''}>{ns.total}</b><span>노쇼 (전체)</span></div>
          <div><b className={ns.last90 >= summary.noShowThreshold ? 'neg' : ''}>{ns.last90}</b><span>노쇼 (90일)</span></div>
        </div>
      )}
      <PushToggle />
      <section className="card">
        <h3>알림</h3>
        <ul className="list">
          {notes.map((n) => (
            <li key={n.id} className={n.read ? '' : 'unread'}>
              <b>{n.title}</b>{n.body && <p className="small">{n.body}</p>}
              <span className="small muted">{n.createdAt.slice(0, 16)}</span>
            </li>
          ))}
          {!notes.length && <li className="muted">알림이 없어요.</li>}
        </ul>
      </section>
      {user.isMember && (
        <section className="card">
          <h3>내 신청 기록</h3>
          <ul className="list">
            {hist.map((h) => (
              <li key={h.date} className="row between">
                <span>{fmtDay(h.date)}{h.guests ? ` +손님 ${h.guests}` : ''}</span>
                <span className={h.attended ? 'ok' : h.closed ? 'err' : 'muted'}>
                  {h.attended ? '출석' : h.closed ? '노쇼' : h.phase === 'today' ? '오늘' : '예정'}
                </span>
              </li>
            ))}
            {!hist.length && <li className="muted">아직 신청한 적이 없어요.</li>}
          </ul>
        </section>
      )}
      {user.isAdmin && (
        <details className="card">
          <summary>관리자 비밀번호 변경</summary>
          <ChangePassword />
        </details>
      )}
      <button className="link" onClick={() => api('/auth/logout', { method: 'POST' }).then(onLogout)}>로그아웃 ({user.name})</button>
    </div>
  );
}

export function ChangePassword({ onDone }) {
  const [f, setF] = useState({ current: '', next: '', next2: '' });
  const [msg, setMsg] = useState(null);
  async function submit(e) {
    e.preventDefault();
    try {
      if (f.next !== f.next2) throw new Error('새 비밀번호 확인이 달라요.');
      await api('/me/password', { method: 'POST', body: f });
      setMsg({ ok: true, text: '바꿨어요.' });
      setF({ current: '', next: '', next2: '' });
      onDone?.();
    } catch (err) { setMsg({ ok: false, text: err.message }); }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="form" onSubmit={submit}>
      <label>현재 비밀번호<input type="password" value={f.current} onChange={set('current')} required autoComplete="current-password" /></label>
      <label>새 비밀번호 (숫자 4자리 이상)<input type="password" value={f.next} onChange={set('next')} required minLength={4} inputMode="numeric" autoComplete="new-password" /></label>
      <label>새 비밀번호 확인<input type="password" value={f.next2} onChange={set('next2')} required autoComplete="new-password" /></label>
      {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
      <button className="primary">변경</button>
    </form>
  );
}

function urlB64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function PushToggle() {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const [state, setState] = useState(supported ? Notification.permission : 'unsupported');
  const [msg, setMsg] = useState(null);
  const isIos = /iphone|ipad/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;

  async function enable() {
    try {
      const perm = await Notification.requestPermission();
      setState(perm);
      if (perm !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      const { key } = await api('/push/key');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) });
      await api('/push/subscribe', { method: 'POST', body: sub.toJSON() });
      setMsg('이 기기에서 알림을 받아요.');
    } catch (e) { setMsg(`알림 설정 실패: ${e.message}`); }
  }

  if (state === 'unsupported') {
    return (
      <div className="notice small">
        {isIos && !standalone
          ? '아이폰은 Safari 공유 버튼 → "홈 화면에 추가"로 앱을 설치하면 휴대폰 알림을 받을 수 있어요.'
          : '이 브라우저는 휴대폰 알림을 지원하지 않아요. 알림은 이 화면에서 확인할 수 있어요.'}
      </div>
    );
  }
  return (
    <div className="notice small row between">
      <span>{state === 'granted' ? (msg || '휴대폰 알림이 켜져 있어요.') : '마감 리마인드, 메뉴, 노쇼 알림을 휴대폰으로 받아보세요.'}</span>
      {state === 'granted' ? <button className="link" onClick={enable}>다시 연결</button> : <button className="primary" onClick={enable}>알림 켜기</button>}
    </div>
  );
}
