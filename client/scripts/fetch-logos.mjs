// Downloads merchant/advertiser logos once into public/logos/<id>.png so the
// app never calls third-party image services at runtime. Brand marks belong to
// their owners; used here only to identify merchants (as banking apps do).
// Run: node scripts/fetch-logos.mjs
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '..', 'public', 'logos');
const DOMAINS = {
  swiggy: 'swiggy.com', zomato: 'zomato.com', eatsure: 'eatsure.com', dineout: 'dineout.co.in', barbeque: 'barbequenation.com', haldirams: 'haldirams.com',
  bigbasket: 'bigbasket.com', blinkit: 'blinkit.com', zepto: 'zeptonow.com', dmart: 'dmart.in', chaipoint: 'chaipoint.com', starbucks: 'starbucks.in', ccd: 'cafecoffeeday.com',
  amazon: 'amazon.in', flipkart: 'flipkart.com', croma: 'croma.com', reliancedigital: 'reliancedigital.in', myntra: 'myntra.com', ajio: 'ajio.com', hm: 'hm.com',
  nykaa: 'nykaa.com', ikea: 'ikea.com', pepperfry: 'pepperfry.com', uber: 'uber.com', ola: 'olacabs.com', rapido: 'rapido.bike', metro: 'english.bmrc.co.in',
  indigo: 'goindigo.in', makemytrip: 'makemytrip.com', irctc: 'irctc.co.in', redbus: 'redbus.in', hpcl: 'hindustanpetroleum.com', netflix: 'netflix.com',
  hotstar: 'hotstar.com', prime: 'primevideo.com', sonyliv: 'sonyliv.com', spotify: 'spotify.com', youtube: 'youtube.com', adobe: 'adobe.com', cultfit: 'cult.fit',
  goldsgym: 'goldsgym.com', bookmyshow: 'bookmyshow.com', pvr: 'pvrcinemas.com', steam: 'store.steampowered.com', dream11: 'dream11.com', bescom: 'bescom.co.in',
  airtelfiber: 'airtel.in', jio: 'jio.com', airtel: 'airtel.in', lic: 'licindia.in', policybazaar: 'policybazaar.com', indane: 'indane.co.in', nobroker: 'nobroker.in',
  apollo: 'apollopharmacy.in', practo: 'practo.com', bajajemi: 'bajajfinserv.in', groww: 'groww.in', giveindia: 'giveindia.org', byjus: 'unacademy.com',
  paytm: 'paytm.com', paytmmoney: 'paytmmoney.com', fitpass: 'fitpass.co.in', eatfit: 'eatfit.in',
};

function dims(buf) {
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return buf.readUInt32BE(16);
  if (buf[0] === 0xff && buf[1] === 0xd8) { // JPEG: scan for SOF
    let i = 2; while (i < buf.length) { if (buf[i] !== 0xff) { i++; continue; } const m = buf[i + 1]; if (m >= 0xc0 && m <= 0xc3) return buf.readUInt16BE(i + 7); i += 2 + buf.readUInt16BE(i + 2); }
  }
  return 0;
}
async function get(url) {
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(9000), headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari/605.1.15' } });
    if (!r.ok || !/image\/(png|jpeg|jpg)/.test(r.headers.get('content-type') || '')) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const w = dims(buf);
    return w ? { buf, w, url } : null;
  } catch { return null; }
}

const results = [];
await Promise.all(Object.entries(DOMAINS).map(async ([id, d]) => {
  const tries = await Promise.all([
    get(`https://${d}/apple-touch-icon.png`), get(`https://www.${d.replace(/^www\./, '')}/apple-touch-icon.png`),
    get(`https://www.google.com/s2/favicons?domain=${d}&sz=256`),
  ]);
  const best = tries.filter(Boolean).sort((a, b) => b.w - a.w)[0];
  if (best && best.w >= 32) { fs.writeFileSync(path.join(OUT, `${id}.png`), best.buf); results.push(`${id}:${best.w}`); }
  else results.push(`${id}:MISSING`);
}));
console.log(results.sort().join('  '));
