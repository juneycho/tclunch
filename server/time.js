// 모든 날짜는 한국 시간(KST, UTC+9, 서머타임 없음) 기준 'YYYY-MM-DD' 문자열로 다룬다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function kstParts(now = new Date()) {
  const d = new Date(now.getTime() + KST_OFFSET_MS);
  return {
    date: d.toISOString().slice(0, 10),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

export const kstToday = (now) => kstParts(now).date;

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=일 ... 6=토

export const isValidDate = (s) =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) &&
  new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export function monthDays(month) {
  const first = `${month}-01`;
  const out = [];
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) out.push(d);
  return out;
}
