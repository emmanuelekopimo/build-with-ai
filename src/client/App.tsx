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
import { DashboardPage } from './pages/DashboardPage';
import { DocumentPage } from './pages/DocumentPage';
import { ReportsPage } from './pages/ReportsPage';
import { FormEditorPage } from './pages/FormEditorPage';
import { FormsRegistryPage } from './pages/FormsRegistryPage';
import { SignoffsPage } from './pages/SignoffsPage';
import { ApprovePage } from './pages/public/ApprovePage';
import { SignPage } from './pages/public/SignPage';

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
  { path: '/', element: guard('dashboard.view', <DashboardPage />) },
  { path: '/reports', element: guard('report.view', <ReportsPage />) },
  { path: '/assets', element: guard('asset.view', <AssetRegistryPage />) },
  { path: '/assets/:tag', element: guard('asset.view', <AssetDetailPage />) },
  { path: '/intake/:id?', element: guard('intake.manage', <IntakePage />) },
  { path: '/forms', element: guard('form.manage', <FormsRegistryPage />) },
  { path: '/forms/new/:kind', element: guard('form.manage', <FormEditorPage />) },
  { path: '/forms/:id/edit', element: guard('form.manage', <FormEditorPage />) },
  { path: '/signoffs', element: guard('signoff.view', <SignoffsPage />) },
  { path: '/documents/:reference', element: guard('signoff.view', <DocumentPage />) },
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
        { path: '/sign/:token', element: <SignPage /> },
        { path: '/approve/:token', element: <ApprovePage /> },
        { element: <AppShell />, children: appRoutes },
      ],
    },
  ],
  { future: { v7_relativeSplatPath: true } },
);
