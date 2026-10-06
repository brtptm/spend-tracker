import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router';
import { auth, useMe } from './lib/api.js';
import { Spinner, ErrorNote } from './components/ui.jsx';
import Shell from './components/Shell.jsx';
import Landing from './pages/Landing.jsx';

const Auth = lazy(() => import('./pages/Auth.jsx'));
const Connect = lazy(() => import('./pages/Connect.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Category = lazy(() => import('./pages/Category.jsx'));
const Merchant = lazy(() => import('./pages/Merchant.jsx'));
const Trends = lazy(() => import('./pages/Trends.jsx'));
const Recommendations = lazy(() => import('./pages/Recommendations.jsx'));
const Offers = lazy(() => import('./pages/Offers.jsx'));
const Budget = lazy(() => import('./pages/Budget.jsx'));
const Transactions = lazy(() => import('./pages/Transactions.jsx'));
const Alerts = lazy(() => import('./pages/Alerts.jsx'));
const Partner = lazy(() => import('./pages/Partner.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

const S = (el) => <Suspense fallback={<Spinner />}>{el}</Suspense>;

function Gate() {
  const loc = useLocation();
  const { data, isLoading, error, refetch } = useMe();
  if (!auth.signedIn()) return <Navigate to="/signin" replace state={{ from: loc.pathname }} />;
  if (isLoading) return <Spinner label="Loading your money" />;
  if (error) return <div className="max-w-md mx-auto p-6"><ErrorNote error={error} onRetry={refetch} /></div>;
  if (!data.hasData && !['/connect', '/settings', '/partner'].includes(loc.pathname)) return <Navigate to="/connect" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/signin', element: S(<Auth mode="signin" />) },
  { path: '/signup', element: S(<Auth mode="signup" />) },
  {
    element: <Gate />,
    children: [
      { path: '/connect', element: S(<Connect />) },
      {
        element: <Shell />,
        children: [
          { path: '/dashboard', element: S(<Dashboard />) },
          { path: '/category/:id', element: S(<Category />) },
          { path: '/merchant/:id', element: S(<Merchant />) },
          { path: '/trends', element: S(<Trends />) },
          { path: '/recommendations', element: S(<Recommendations />) },
          { path: '/offers', element: S(<Offers />) },
          { path: '/budget', element: S(<Budget />) },
          { path: '/transactions', element: S(<Transactions />) },
          { path: '/alerts', element: S(<Alerts />) },
          { path: '/partner', element: S(<Partner />) },
          { path: '/settings', element: S(<Settings />) },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
