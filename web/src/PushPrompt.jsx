import React, { useState } from 'react';
import { useT } from './i18n.js';
import { dismissPushPrompt, isIos, isStandalone, pushPromptKind, pushSupported, subscribePush } from './push.js';

// 처음 들어왔을 때 한 번: 알림 켜기 안내 창 (아이폰 Safari에서는 홈 화면 추가 안내)
export default function PushPrompt() {
  const t = useT();
  const [kind, setKind] = useState(pushPromptKind);
  const [msg, setMsg] = useState(null);
  if (!kind) return null;
  const close = () => { dismissPushPrompt(); setKind(null); };
  async function enable() {
    try {
      await subscribePush();
      close();
    } catch (e) {
      setMsg(e.message === 'server-not-ready' ? t('pushServerNotReady') : t('pushFail', { e: e.message }));
      dismissPushPrompt();
    }
  }
  return (
    <div className="sheet-bg" onClick={close}>
      <div className="sheet prompt" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t(kind === 'ios' ? 'promptIosTitle' : 'promptTitle')}>
        <div className="bell">🔔</div>
        <h2>{t(kind === 'ios' ? 'promptIosTitle' : 'promptTitle')}</h2>
        <p className="pre">{t(kind === 'ios' ? 'promptIosBody' : 'promptBody')}</p>
        {msg && <p className="err">{msg}</p>}
        {kind === 'ask' && !msg ? (
          <>
            <button className="primary big" onClick={enable}>{t('pushEnable')}</button>
            <button className="link" onClick={close}>{t('later')}</button>
          </>
        ) : <button className="primary big" onClick={close}>{t('ok')}</button>}
      </div>
    </div>
  );
}

// 알림이 아직 꺼져 있으면 화면 위에 작게 '알림 켜기' 줄을 계속 보여 준다
export function PushBanner() {
  const t = useT();
  const [perm, setPerm] = useState(() => (pushSupported() ? Notification.permission : null));
  const [msg, setMsg] = useState(null);
  if (perm === 'granted') return null;
  if (!pushSupported()) {
    return isIos() && !isStandalone() ? <div className="pushbar"><span>{t('pushBarIos')}</span></div> : null;
  }
  if (perm === 'denied') return <div className="pushbar"><span>{t('pushBarDenied')}</span></div>;
  async function enable() {
    setMsg(null);
    try { setPerm(await subscribePush()); } catch (e) { setMsg(e.message === 'server-not-ready' ? t('pushServerNotReady') : t('pushFail', { e: e.message })); }
  }
  return (
    <div className="pushbar">
      <span>{t('pushBarText')}</span>
      <button className="accent small" onClick={enable}>{t('pushEnable')}</button>
      {msg && <p className="err small">{msg}</p>}
    </div>
  );
}
