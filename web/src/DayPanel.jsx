import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { deadlineParts, fmtDay, useT } from './i18n.js';
import MyDay from './MyDay.jsx';

// 신청자별 인원 (본인 포함 여부는 구분하지 않는다)
function people(d) {
  const map = new Map(d.roster.map((r) => [r.id, { id: r.id, name: r.name, count: 1, signedUp: true, entries: [] }]));
  for (const g of d.guestEntries) {
    // 관리자가 이름을 적어 넣은 인원은 그 이름으로 따로 보인다
    const key = g.name ? `n:${g.name}` : g.hostId;
    const p = map.get(key) || (g.name ? { id: null, name: g.name, named: true, count: 0, entries: [] }
      : { id: g.hostId, name: g.host, count: 0, signedUp: false, entries: [] });
    p.count += g.count;
    p.entries.push(g.id);
    map.set(key, p);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default function DayPanel({ date, user, summary, onClose, onChange }) {
  const t = useT();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api(`/days/${date}`).then(setD).catch((e) => setMsg({ ok: false, text: e.message })), [date]);
  useEffect(() => { load(); }, [load]);

  async function act(fn, okText) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await load();
      onChange();
      if (okText) setMsg({ ok: true, text: okText });
      return true;
    } catch (e) { setMsg({ ok: false, text: e.message }); return false; } finally { setBusy(false); }
  }

  const setCount = (p, n) => act(() => (p.named
    ? api(`/admin/days/${date}/named`, { method: 'PUT', body: { name: p.name, count: n } })
    : api(`/admin/days/${date}/people/${p.id}/count`, { method: 'PUT', body: { count: n } })));
  const day = fmtDay(date, t.lang);

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('dayLunch', { d: day })}>
        <div className="sheet-head">
          <h2>{t('dayLunch', { d: day })}</h2>
          <button className="x" onClick={onClose} aria-label={t('close')}>✕</button>
        </div>
        {!d ? <p className="muted">{t('loading')}</p> : !d.mealDay ? (
          <p className="muted">{t('noLunch')}{d.note ? ` (${d.note})` : ''}.</p>
        ) : (
          <>
            <div className="row gap wrap">
              <span className={`badge ${d.phase}`}>{t(`phase_${d.phase}`)}</span>
              {d.phase === 'open' && <span className="small muted">{t('closesAt', deadlineParts(d, t.lang, summary?.deadlineHour))}</span>}
            </div>
            <div className="stats one">
              <div><b>{d.total}</b><span>{t('total')}</span></div>
            </div>
            {(d.phase === 'open' || user.isAdmin) && (
              <div className="card"><MyDay simple={!user.isAdmin} date={date} count={(d.mine ? 1 : 0) + (d.myGuests || 0)} onDone={async () => { await load(); onChange(); }} /></div>
            )}
            {user.isMember && !user.isAdmin && d.phase === 'confirmed' && (
              <p className="small muted">{d.mine ? `${t('signedUpClosed')} ` : ''}{t('closedChange')}</p>
            )}
            {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}

            <h3>{t('byPerson')}</h3>
            <ul className="roster">
              {people(d).map((p) => (
                <li key={p.id || `n:${p.name}`}>
                  <span>{p.name}</span>
                  {user.isAdmin ? (
                    // 관리자: 마감·지난 날도 바로 −/+ (0이 되면 삭제)
                    <span className="stepper mini">
                      <button disabled={busy} aria-label={t('fewer')}
                        onClick={() => (p.count > 1 || window.confirm(t('confirmRemoveSignup', { name: p.name }))) && setCount(p, p.count - 1)}>−</button>
                      <b>{t('peopleLong', { n: p.count })}</b>
                      <button disabled={busy} aria-label={t('more')} onClick={() => setCount(p, p.count + 1)}>+</button>
                    </span>
                  ) : <b>{t('peopleLong', { n: p.count })}</b>}
                </li>
              ))}
              {!d.total && <li className="muted">{t('nobodyYet')}</li>}
            </ul>
            {user.isAdmin && <NamedAdd busy={busy} onAdd={(name, n) => act(() => api(`/admin/days/${date}/named`, { method: 'PUT', body: { name, count: n } }), t('namedAdded', { name, n }))} />}
          </>
        )}
      </div>
    </div>
  );
}

// 관리자: 이름을 적고 인원을 정해 추가 (앱에 들어온 적 없는 사람도 됨, 같은 이름이면 그 인원으로 바뀜)
function NamedAdd({ busy, onAdd }) {
  const t = useT();
  const [name, setName] = useState('');
  const [n, setN] = useState(1);
  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    if (await onAdd(name.trim(), n)) { setName(''); setN(1); }
  }
  return (
    <form className="card named-add" onSubmit={submit}>
      <b className="small">{t('namedAddTitle')}</b>
      <div className="row gap">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('namedPlaceholder')} maxLength={40} className="grow" />
        <span className="stepper mini">
          <button type="button" disabled={busy || n <= 1} onClick={() => setN(n - 1)} aria-label={t('fewer')}>−</button>
          <b>{t('peopleLong', { n })}</b>
          <button type="button" disabled={busy} onClick={() => setN(n + 1)} aria-label={t('more')}>+</button>
        </span>
      </div>
      <button className="primary full" disabled={busy || !name.trim()}>{t('namedAddBtn')}</button>
    </form>
  );
}
