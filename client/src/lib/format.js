import { formatDistanceToNowStrict, format } from 'date-fns';

export const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
export function inrShort(n) {
  const v = Math.round(Number(n) || 0), a = Math.abs(v);
  if (a >= 1e7) return `₹${+(v / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `₹${+(v / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `₹${+(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return `₹${v}`;
}
export const pct = (n) => `${n > 0 ? '+' : ''}${Math.round(n)}%`;
export const ago = (d) => formatDistanceToNowStrict(new Date(d), { addSuffix: true });
export const dt = (d, f = 'd MMM, h:mm a') => format(new Date(d), f);
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const PERIODS = [['30d', '30 days'], ['month', 'This month'], ['last_month', 'Last month'], ['3m', '3 months'], ['6m', '6 months'], ['12m', '12 months']];
