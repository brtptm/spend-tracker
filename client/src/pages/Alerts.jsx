import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FiTrash2, FiCheck } from 'react-icons/fi';
import { api } from '../lib/api.js';
import { ago } from '../lib/format.js';
import { Spinner, ErrorNote, PageHead, SEVERITY, Empty } from '../components/ui.jsx';

const TYPES = { unusual: 'Unusual spending', budget: 'Budget', subscription: 'Subscriptions', deal: 'Deals for you', summary: 'Summary' };

export default function Alerts() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['alerts'], queryFn: api.alerts });
  if (isLoading) return <Spinner />;
  if (error) return <ErrorNote error={error} onRetry={refetch} />;
  const refresh = () => qc.invalidateQueries({ queryKey: ['alerts'] });
  return (
    <div className="grid gap-5">
      <PageHead title="Alerts" sub={data.unread ? `${data.unread} unread` : 'You’re all caught up.'} right={data.unread > 0 && <button className="btn btn-ghost btn-sm" onClick={async () => { await api.alertRead('all'); refresh(); }}><FiCheck /> Mark all read</button>} />
      {data.alerts.length ? (
        <ul className="panel divide-y divide-line">
          {data.alerts.map((a) => { const s = SEVERITY[a.severity] || SEVERITY.info; return (
            <li key={a.alertId} className={`px-5 py-4 flex gap-4 ${a.read ? 'opacity-70' : ''}`}>
              <span className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: a.read ? 'var(--ink-3)' : s.color, boxShadow: a.read ? 'none' : `0 0 10px ${s.color}` }} />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-ink-3">{TYPES[a.type] || a.type} · {ago(a.createdAt + 'Z')}</div>
                <Link to={a.link || '/dashboard'} onClick={() => !a.read && api.alertRead(a.alertId).then(refresh)} className="font-semibold hover:underline">{a.title}</Link>
                {a.body && <p className="text-sm text-ink-2 mt-0.5">{a.body}</p>}
              </div>
              <div className="flex shrink-0">
                {!a.read && <button className="w-8 h-8 grid place-items-center rounded-full hover:bg-surface-2" aria-label="Mark read" onClick={async () => { await api.alertRead(a.alertId); refresh(); }}><FiCheck size={14} /></button>}
                <button className="w-8 h-8 grid place-items-center rounded-full hover:bg-surface-2 hover:text-coral" aria-label="Delete alert" onClick={async () => { await api.alertDelete(a.alertId); refresh(); }}><FiTrash2 size={14} /></button>
              </div>
            </li>
          ); })}
        </ul>
      ) : <Empty title="No alerts" body="We’ll tell you about unusual payments, budget pace and offers that fit." />}
      <p className="text-sm text-ink-3">Choose which alerts you get in <Link to="/settings" className="text-link font-medium">Settings</Link>.</p>
    </div>
  );
}
