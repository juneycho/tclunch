import { api } from './api.js';

// 휴대폰 알림. 안드로이드 크롬은 바로 되고, 아이폰은 Safari에서 "홈 화면에 추가"한 앱으로 열었을 때만(iOS 16.4 이상) 된다.
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

function urlB64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// 이 기기를 알림 받는 기기로 등록한다. 권한이 아직 없으면 물어본다 (버튼을 누른 순간에 불러야 한다).
export async function subscribePush() {
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') return perm;
  const reg = await navigator.serviceWorker.ready;
  const { key } = await api('/push/key');
  if (!key) throw new Error('server-not-ready');
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) });
  await api('/push/subscribe', { method: 'POST', body: sub.toJSON() });
  return 'granted';
}

// 이미 허락한 기기는 들어올 때마다 조용히 다시 등록해 둔다 (구독이 바뀌거나 지워졌을 때 대비)
export async function refreshPush() {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  try { await subscribePush(); } catch { /* 서버 설정 전이면 무시 */ }
}

// 처음 들어왔을 때 알림 안내 창을 띄울지: 'ask'(켜기 버튼) · 'ios'(홈 화면 추가 안내) · null
export function pushPromptKind() {
  let seen = false;
  try { seen = localStorage.getItem('tclunch.pushPrompt') === '1'; } catch { /* 무시 */ }
  if (seen) return null;
  if (pushSupported()) return Notification.permission === 'default' ? 'ask' : null;
  return isIos() && !isStandalone() ? 'ios' : null;
}
export function dismissPushPrompt() {
  try { localStorage.setItem('tclunch.pushPrompt', '1'); } catch { /* 무시 */ }
}
