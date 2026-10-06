// Runs before first paint (external file, allowed by the CSP) so the saved theme never flashes.
try {
  var p = localStorage.getItem('st-theme') || 'dark';
  var t = p === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : p;
  document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
} catch (e) {}
