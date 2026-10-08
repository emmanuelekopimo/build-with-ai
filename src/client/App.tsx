import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Outlet, type RouteObject } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { TooltipProvider } from './components/ui/Overlay';
import { ToastProvider } from './components/ui/Toast';
import { AssetDetailPage } from './pages/AssetDetailPage';
import { AssetRegistryPage } from './pages/AssetRegistryPage';
import { IntakePage } from './pages/IntakePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { RequirePermission } from './components/layout/RequirePermission';

const DevComponentsPage = lazy(() => import('./pages/DevComponentsPage').then((m) => ({ default: m.DevComponentsPage })));

function Root() {
  return (
    <TooltipProvider>
      <ToastProvider>
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </ToastProvider>
    </TooltipProvider>
  );
}

const guard = (perm: Parameters<typeof RequirePermission>[0]['perm'], el: ReactNode) => (
  <RequirePermission perm={perm}>{el}</RequirePermission>
);

const appRoutes: RouteObject[] = [
  { path: '/assets', element: guard('asset.view', <AssetRegistryPage />) },
  { path: '/assets/:tag', element: guard('asset.view', <AssetDetailPage />) },
  { path: '/intake/:id?', element: guard('intake.manage', <IntakePage />) },
  ...(import.meta.env.DEV ? [{ path: '/dev/components', element: <DevComponentsPage /> }] : []),
  { path: '*', element: <NotFoundPage /> },
];

export const router = createBrowserRouter(
  [
    {
      element: <Root />,
      children: [
        { path: '/login', element: <LoginPage /> },
        { path: '/reset-password/:token', element: <ResetPasswordPage /> },
        { element: <AppShell />, children: appRoutes },
      ],
    },
  ],
  { future: { v7_relativeSplatPath: true } },
);
