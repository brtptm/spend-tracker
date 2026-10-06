import { useQuery } from '@tanstack/react-query';
import { PiInfoLight } from 'react-icons/pi';
import { portal } from '../../lib/portalApi.js';
import { Skeleton, ErrorNote } from '../../components/ui.jsx';
import BrandLogo from '../../components/BrandLogo.jsx';
import { inr } from '../../lib/format.js';
import { PageTitle, Kpi, Chip, n } from './common.jsx';

// Campaign → advertiser logo (mirrors the server's offer catalog).
const LOGO = { 'swiggy-300': 'swiggy', 'swiggy-one': 'swiggy', 'zomato-gold': 'zomato', 'blinkit-150': 'blinkit', 'bigbasket-1000': 'bigbasket', eatfit: 'eatfit', 'starbucks-bogo': 'starbucks',
  'myntra-20': 'myntra', 'ajio-500': 'ajio', 'nykaa-15': 'nykaa', 'amazon-card': 'amazon', 'croma-emi': 'croma', 'uber-pass': 'uber', 'rapido-50': 'rapido', 'metro-card': 'paytm',
  'mmt-hotel': 'makemytrip', 'travel-insurance': 'paytm', 'stream-bundle': 'paytm', 'netflix-family': 'netflix', 'bms-150': 'bookmyshow', 'budget-gym': 'fitpass',
  'bill-autopay': 'paytm', 'jio-annual': 'jio', 'health-plan': 'paytm', 'sip-start': 'paytmmoney' };
const pctf = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const MODELS = [['cpm', 'CPM · impressions', 'var(--cat-entertainment)'], ['cpc', 'CPC · clicks', 'var(--cat-food)'], ['cpa', 'CPA · conversions', 'var(--cat-transport)']];

export default function Revenue() {
  const q = useQuery({ queryKey: ['portal-ads'], queryFn: portal.ads });
  return (
    <>
      <PageTitle title="Ad revenue" sub="Spend-based offers shown in the Spend Tracker app and through your integration. Revenue is split by pricing model so CPM, CPC and CPA are never mixed." />
      {q.isLoading ? <Skeleton h={360} className="!rounded-[22px]" /> : q.error ? <ErrorNote error={q.error} onRetry={q.refetch} /> : (() => {
        const { totals: t, ads, includesSimulated } = q.data;
        const lift = t.industryCtrBaseline ? t.ctr / t.industryCtrBaseline : 0;
        const rev = t.revenue || 1;
        return (
          <div className="grid grid-cols-1 gap-5 min-w-0">
            {includesSimulated && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-line px-4 py-3 text-[13px] text-ink-2"><PiInfoLight size={18} className="shrink-0 mt-px text-ink-3" />Includes 30 days of simulated impression history for the demo users, alongside any real events you report via <span className="font-mono">POST /v1/offers/events</span>.</div>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Kpi label="Revenue" value={inr(t.revenue)} sub={`Across ${ads.length} campaigns · CPM, CPC and CPA`} />
              <Kpi label="Click-through rate" value={pctf(t.ctr)} tone="var(--positive)" sub={`${lift >= 1 ? `${lift.toFixed(1)}×` : pctf(lift, 0)} the ${pctf(t.industryCtrBaseline)} industry baseline`} />
              <Kpi label="Conversions" value={n(t.conversions)} sub={`${pctf(t.conversionRate)} of clicks`} />
              <Kpi label="Impressions" value={n(t.views)} sub={`${n(t.clicks)} clicks · ${n(t.dismissals)} dismissed`} />
            </div>

            <section className="panel p-6 sm:p-7 min-w-0" aria-label="Revenue by model">
              <h2 className="text-lg">Revenue by pricing model</h2>
              <div className="mt-5 flex h-3 rounded-full overflow-hidden bg-surface-3" role="img" aria-label={MODELS.map(([k, l]) => `${l} ${inr(t.revenueByModel[k])}`).join(', ')}>
                {MODELS.map(([k, , c]) => <span key={k} style={{ width: `${(t.revenueByModel[k] / rev) * 100}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${c} 60%, transparent), ${c})` }} />)}
              </div>
              <ul className="mt-5 grid sm:grid-cols-3 gap-4">
                {MODELS.map(([k, l, c]) => (
                  <li key={k} className="rounded-2xl border border-line p-4">
                    <div className="flex items-center gap-2 text-[12.5px] text-ink-2"><span className="w-2 h-2 rounded-full" style={{ background: c }} />{l}</div>
                    <div className="num text-[1.5rem] mt-1.5">{inr(t.revenueByModel[k])}</div>
                    <div className="text-[12px] text-ink-3 mt-1">{Math.round((t.revenueByModel[k] / rev) * 100)}% of revenue</div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel p-2 sm:p-3 min-w-0" aria-label="Campaigns">
              <h2 className="text-lg px-3 sm:px-4 pt-3">Campaigns</h2>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-[13px] min-w-[760px]">
                  <thead><tr className="text-left text-[11.5px] text-ink-3 border-b border-line">
                    <th className="font-medium py-2.5 px-3 sm:px-4">Offer</th><th className="font-medium py-2.5 px-2 text-right">Impressions</th><th className="font-medium py-2.5 px-2 text-right">Clicks</th>
                    <th className="font-medium py-2.5 px-2 text-right">CTR</th><th className="font-medium py-2.5 px-2 text-right">Conversions</th><th className="font-medium py-2.5 px-2">Revenue mix</th><th className="font-medium py-2.5 px-3 sm:px-4 text-right">Revenue</th>
                  </tr></thead>
                  <tbody>
                    {ads.map((a) => (
                      <tr key={a.adId} className="border-b border-line last:border-0">
                        <td className="py-3 px-3 sm:px-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <BrandLogo id={LOGO[a.adId]} name={a.advertiser} size={30} color="#55555c" />
                            <div className="min-w-0"><div className="font-medium truncate max-w-[280px]">{a.advertiser}</div><div className="text-[12px] text-ink-3 truncate max-w-[280px]">{a.title}</div></div>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-right num">{n(a.views)}</td>
                        <td className="py-3 px-2 text-right num">{n(a.clicks)}</td>
                        <td className="py-3 px-2 text-right"><Chip dot={false} color={a.ctr >= t.industryCtrBaseline ? 'var(--positive)' : 'var(--ink-2)'}>{pctf(a.ctr)}</Chip></td>
                        <td className="py-3 px-2 text-right num">{n(a.conversions)}</td>
                        <td className="py-3 px-2">
                          <div className="flex h-1.5 w-24 rounded-full overflow-hidden bg-surface-3" role="img" aria-label={MODELS.map(([k, l]) => `${l} ${inr(a.byModel?.[k])}`).join(', ')}>
                            {MODELS.map(([k, , c]) => <span key={k} style={{ width: `${a.revenue ? ((a.byModel?.[k] || 0) / a.revenue) * 100 : 0}%`, background: c }} />)}
                          </div>
                        </td>
                        <td className="py-3 px-3 sm:px-4 text-right num">{inr(a.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        );
      })()}
    </>
  );
}
