import React, { useState } from 'react';
import { useT } from './i18n.js';
import { dismissPushPrompt, pushPromptKind, subscribePush } from './push.js';

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
