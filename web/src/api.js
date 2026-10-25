export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'tc-lunch' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || '요청에 실패했어요.');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;
const WD = '일월화수목금토';
export const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
export function fmtDay(date) {
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}(${WD[weekdayOf(date)]})`;
}
export const PHASE_LABEL = { open: '신청 가능', confirmed: '인원 확정', today: '오늘', past: '지난 날' };
export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
