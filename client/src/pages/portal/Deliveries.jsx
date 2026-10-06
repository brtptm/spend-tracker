import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { portal } from '../../lib/portalApi.js';
import { Segmented, Skeleton, ErrorNote } from '../../components/ui.jsx';
import { PageTitle, DeliveriesTable, DeliveryDrawer, Kpi, n } from './common.jsx';

export default function Deliveries() {
  const [open, setOpen] = useState(null);
  const [kind, setKind] = useState('all');
  const q = useQuery({ queryKey: ['portal-logs'], queryFn: () => portal.logs(200), refetchInterval: 15_000 });
  const logs = q.data?.logs || [];
  const rows = kind === 'all' ? logs : logs.filter((l) => l.kind === kind);
  const tot = rows.reduce((a, r) => ({ received: a.received + r.received, accepted: a.accepted + r.accepted, filtered: a.filtered + r.filtered, rejected: a.rejected + r.rejected, duplicates: a.duplicates + r.duplicates }), { received: 0, accepted: 0, filtered: 0, rejected: 0, duplicates: 0 });
  return (
    <>
      <PageTitle title="Deliveries" sub="Every webhook event and batch you sent, with per-payment outcomes. Open one to see exactly why each payment was accepted, filtered or rejected."
        right={<Segmented label="Kind" value={kind} onChange={setKind} options={[['all', 'All'], ['event', 'Events'], ['batch', 'Batches'], ['test', 'Tests']]} />} />
      {q.isLoading ? <Skeleton h={360} className="!rounded-[22px]" /> : q.error ? <ErrorNote error={q.error} onRetry={q.refetch} /> : (
        <div className="grid grid-cols-1 gap-5 min-w-0">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Kpi label="Received" value={n(tot.received)} sub={`${rows.length} deliveries shown`} />
            <Kpi label="Accepted" value={n(tot.accepted)} tone={tot.accepted ? 'var(--positive)' : undefined} sub={tot.received ? `${Math.round((tot.accepted / tot.received) * 100)}% of received` : '—'} />
            <Kpi label="Duplicates" value={n(tot.duplicates)} sub="Safe retries" />
            <Kpi label="Filtered" value={n(tot.filtered)} tone={tot.filtered ? 'var(--warning)' : undefined} sub="Not spending" />
            <Kpi label="Rejected" value={n(tot.rejected)} tone={tot.rejected ? 'var(--negative)' : undefined} sub="Fix and resend" />
          </div>
          <section className="panel p-4 sm:p-6 min-w-0" aria-label="Delivery log"><DeliveriesTable rows={rows} onOpen={setOpen} /></section>
        </div>
      )}
      <DeliveryDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}
