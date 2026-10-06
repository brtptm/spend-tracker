import { Component, Suspense } from 'react';
import { ErrorNote, Skeleton } from './ui.jsx';

/** Shown while a page's code chunk loads — page-shaped, never an empty screen. */
export function PageSkeleton() {
  return (
    <div className="grid gap-5" aria-busy="true" aria-label="Loading">
      <Skeleton h={14} className="w-40" />
      <Skeleton h={40} className="w-80 max-w-full" />
      <Skeleton h={320} className="!rounded-[22px]" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={110} className="!rounded-[22px]" />)}</div>
    </div>
  );
}

/** Catches render errors in a page so a crash shows a message, not a blank area. */
class Catch extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[page]', error, info?.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    const chunk = /dynamically imported module|Loading chunk|Failed to fetch/i.test(String(this.state.error?.message));
    return (
      <div className="max-w-md mx-auto py-16">
        <ErrorNote error={{ message: chunk ? 'A newer version is available. Reload to continue.' : 'This page hit a problem.' }}
          onRetry={() => (chunk ? window.location.reload() : this.setState({ error: null }))} />
      </div>
    );
  }
}

/** Error boundary + suspense for one page. Keyed by path so each navigation starts clean. */
export default function PageBoundary({ children }) {
  return <Catch><Suspense fallback={<PageSkeleton />}>{children}</Suspense></Catch>;
}
