import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { fmtDay, renderNotification, useT } from './i18n.js';

export default function My({ user, summary, onLogout, onRead }) {
  const t = useT();
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
          <div><b>{ns.signups}</b><span>{t('pastSignups')}</span></div>
          <div><b className={ns.total ? 'neg' : ''}>{ns.total}</b><span>{t('noShowTotal')}</span></div>
          <div><b className={ns.last90 >= summary.noShowThreshold ? 'neg' : ''}>{ns.last90}</b><span>{t('noShow90')}</span></div>
        </div>
      )}
      <PushToggle />
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
      {user.isMember && (
        <section className="card">
          <h3>{t('myHistory')}</h3>
          <ul className="list">
            {hist.map((h) => (
              <li key={h.date} className="row between">
                <span>{fmtDay(h.date, t.lang)}</span>
                <span className={h.attended ? 'ok' : h.closed ? 'err' : 'muted'}>
                  {h.attended ? t('attended') : h.closed ? t('noShow') : h.phase === 'today' ? t('phase_today') : t('upcoming')}
                </span>
              </li>
            ))}
            {!hist.length && <li className="muted">{t('neverSigned')}</li>}
          </ul>
        </section>
      )}
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

function urlB64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function PushToggle() {
  const t = useT();
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
      setMsg(t('pushDone'));
    } catch (e) { setMsg(t('pushFail', { e: e.message })); }
  }

  if (state === 'unsupported') {
    return (
      <div className="notice small">
        {isIos && !standalone
          ? t('pushIos')
          : t('pushUnsupported')}
      </div>
    );
  }
  return (
    <div className="notice small row between">
      <span>{state === 'granted' ? (msg || t('pushOn')) : t('pushPrompt')}</span>
      {state === 'granted' ? <button className="link" onClick={enable}>{t('pushReconnect')}</button> : <button className="primary" onClick={enable}>{t('pushEnable')}</button>}
    </div>
  );
}
