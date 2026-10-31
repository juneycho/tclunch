import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { renderNotification, useT } from './i18n.js';
import { isIos, isStandalone, pushSupported, subscribePush } from './push.js';

export default function My({ user, onLogout, onRead }) {
  const t = useT();
  const [notes, setNotes] = useState([]);

  const load = useCallback(() => api('/notifications').then((r) => {
    setNotes(r.notifications);
    if (r.notifications.some((n) => !n.read)) api('/notifications/read', { method: 'POST' }).then(onRead);
  }), [onRead]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="stack">
      <PushToggle onTest={load} />
      <section className="card">
        <h3>{t('notifications')}</h3>
        <ul className="list">
          {notes.map((n) => {
            const { title, body } = renderNotification(n, t.lang);
            return (
              <li key={n.id} className={n.read ? '' : 'unread'}>
                <b>{title}</b>{body && <p className="small">{body}</p>}
                <span className="small muted">{n.createdAt.slice(0, 16)}</span>
              </li>
            );
          })}
          {!notes.length && <li className="muted">{t('noNotifications')}</li>}
        </ul>
      </section>
      {user.isAdmin && (
        <details className="card">
          <summary>{t('changeAdminPw')}</summary>
          <ChangePassword />
        </details>
      )}
      <button className="link" onClick={() => api('/auth/logout', { method: 'POST' }).then(onLogout)}>{t('logout', { name: user.name })}</button>
    </div>
  );
}

export function ChangePassword({ onDone, first = false }) {
  const t = useT();
  const [f, setF] = useState({ current: '', next: '', next2: '' });
  const [msg, setMsg] = useState(null);
  async function submit(e) {
    e.preventDefault();
    try {
      if (f.next !== f.next2) throw new Error(t('pwMismatch'));
      await api('/me/password', { method: 'POST', body: f });
      setMsg({ ok: true, text: t('changed') });
      setF({ current: '', next: '', next2: '' });
      onDone?.();
    } catch (err) { setMsg({ ok: false, text: err.message }); }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="form" onSubmit={submit}>
      <label>{first ? t('currentPwFirst') : t('currentPw')}<input type="password" value={f.current} onChange={set('current')} required={!first} autoComplete="current-password" /></label>
      <label>{t('newPw')}<input type="password" value={f.next} onChange={set('next')} required minLength={4} autoComplete="new-password" /></label>
      <label>{t('newPw2')}<input type="password" value={f.next2} onChange={set('next2')} required autoComplete="new-password" /></label>
      {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
      <button className="primary">{t('change')}</button>
    </form>
  );
}

// 휴대폰 알림 켜기. 안드로이드는 크롬에서 바로, 아이폰은 홈 화면에 추가한 앱에서만(iOS 16.4 이상) 된다.
function PushToggle({ onTest }) {
  const t = useT();
  const [perm, setPerm] = useState(pushSupported() ? Notification.permission : 'unsupported');
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => { api('/push/status').then(setStatus).catch(() => {}); }, []);

  async function enable() {
    setMsg(null);
    try {
      const p = await subscribePush();
      setPerm(p);
      if (p !== 'granted') return;
      setStatus(await api('/push/status'));
      setMsg(t('pushDone'));
    } catch (e) { setMsg(e.message === 'server-not-ready' ? t('pushServerNotReady') : t('pushFail', { e: e.message })); }
  }
  async function test() {
    setMsg(null);
    try {
      await api('/push/test', { method: 'POST' });
      setMsg(t('pushTestSent'));
      onTest?.();
    } catch (e) { setMsg(e.message); }
  }

  if (perm === 'unsupported') {
    return <div className="notice small">{isIos() && !isStandalone() ? t('pushIos') : t('pushUnsupported')}</div>;
  }
  const on = perm === 'granted' && status?.myDevices > 0;
  return (
    <div className="notice small stack-s">
      {status && !status.serverReady && <p className="err">{t('pushServerNotReady')}</p>}
      <div className="row between gap">
        <span>{perm === 'denied' ? t('pushDenied') : on ? t('pushOn') : t('pushPrompt')}</span>
        {perm !== 'denied' && (on
          ? <button className="link" onClick={enable}>{t('pushReconnect')}</button>
          : <button className="primary" onClick={enable}>{t('pushEnable')}</button>)}
      </div>
      {on && <button onClick={test}>{t('pushTest')}</button>}
      {msg && <p>{msg}</p>}
    </div>
  );
}
