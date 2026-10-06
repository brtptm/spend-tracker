import { useEffect, useState } from 'react';

// One shared theme preference ('dark' | 'light' | 'system'); every toggle stays in sync.
const KEY = 'st-theme';
const EVT = 'st-theme-change';
const read = () => { try { return localStorage.getItem(KEY) || 'dark'; } catch { return 'dark'; } };
const resolve = (pref) => (pref === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : pref);

export function applyTheme(pref) {
  const root = document.documentElement;
  root.classList.add('theme-switching');
  root.dataset.theme = resolve(pref);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', root.dataset.theme === 'light' ? '#f4f4f1' : '#000000');
  setTimeout(() => root.classList.remove('theme-switching'), 350);
}

export function setThemePref(pref) {
  try { localStorage.setItem(KEY, pref); } catch {}
  applyTheme(pref);
  window.dispatchEvent(new CustomEvent(EVT, { detail: pref }));
}

export function useTheme() {
  const [pref, setPref] = useState(read);
  useEffect(() => {
    const on = (e) => setPref(e.detail);
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const sys = () => { if (read() === 'system') applyTheme('system'); };
    window.addEventListener(EVT, on); mq.addEventListener('change', sys);
    return () => { window.removeEventListener(EVT, on); mq.removeEventListener('change', sys); };
  }, []);
  return [pref, setThemePref, resolve(pref)];
}
