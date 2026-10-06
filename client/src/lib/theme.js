import { useEffect, useState } from 'react';
const KEY = 'st-theme';
const read = () => { try { return localStorage.getItem(KEY) || 'dark'; } catch { return 'dark'; } };
export function applyTheme(pref) {
  const sys = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = pref === 'system' ? sys : pref;
}
export function useTheme() {
  const [pref, setPref] = useState(read);
  useEffect(() => { applyTheme(pref); try { localStorage.setItem(KEY, pref); } catch {} }, [pref]);
  return [pref, setPref];
}
