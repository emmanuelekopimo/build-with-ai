import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calendar,
  Info,
  Lock,
  Send,
  Tag as TagIcon,
  Trash2,
  Undo2,
  User,
  Wrench,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ACTION_LABEL, type AssetAction } from '../../shared/statusMachine';
import { FORM_STATUS_LABEL } from '../../shared/constants';
import { fmtDate } from '../../shared/format';
import { AssetStatusCell } from '../components/assets/AssetBits';
import { DeleteModal, RepairModal, ReportDamageModal, RetireModal } from '../components/assets/AssetModals';
import { toTimelineEntry } from '../components/assets/timeline';
import { Badge, TagChip } from '../components/ui/Badge';
import { Button, type ButtonVariant } from '../components/ui/Button';
import { Barcode, Timeline } from '../components/ui/Data';
import { Card, CardHeader, EmptyState, ErrorState, InfoNote, KeyValueBox, PageHeader, Skeleton } from '../components/ui/Layout';
import { Tooltip } from '../components/ui/Overlay';
import { api, ApiError } from '../lib/api';
import { categoryIcon } from '../lib/icons';
import { errorMessage } from '../lib/query';
import type { AssetDetail } from '../lib/types';
import { REGISTRY_RETURN_KEY } from './AssetRegistryPage';

const ACTION_ICON: Record<AssetAction, ReactNode> = {
  ISSUE: <Send className="h-4 w-4" />,
  RETURN: <Undo2 className="h-4 w-4" />,
  REPORT_DAMAGE: <AlertTriangle className="h-4 w-4" />,
  SEND_FOR_REPAIR: <Undo2 className="h-4 w-4" />,
  RECEIVE_BACK: <Undo2 className="h-4 w-4" />,
  RETIRE: <AlertTriangle className="h-4 w-4" />,
  REPAIR: <Wrench className="h-4 w-4" />,
  DELETE: <Trash2 className="h-4 w-4" />,
};

function variantFor(action: AssetAction, primary: boolean): ButtonVariant {
  if (action === 'DELETE') return 'danger';
  if (action === 'REPORT_DAMAGE' || action === 'RETIRE') return 'warning';
  return primary ? 'secondary' : 'outline';
}

function registryBack() {
  try {
    const q = sessionStorage.getItem(REGISTRY_RETURN_KEY);
    return q ? `/assets?${q}` : '/assets';
  } catch {
    return '/assets';
  }
}

export function AssetDetailPage() {
  const { tag = '' } = useParams();
  const navigate = useNavigate();
  const [modal, setModal] = useState<null | 'damage' | 'retire' | 'repair' | 'delete'>(null);
  const query = useQuery({ queryKey: ['asset', tag], queryFn: () => api<AssetDetail>(`/assets/${tag}`) });
  const back = { to: registryBack(), label: 'Asset Registry' };

  if (query.isLoading) {
    return (
      <>
        <PageHeader title="" back={back} />
        <Card className="space-y-3 p-6">
          <Skeleton className="h-6 w-72" />
          <Skeleton className="w-96" />
          <Skeleton className="w-64" />
        </Card>
      </>
    );
  }
  if (query.error) {
    const nf = query.error instanceof ApiError && query.error.status === 404;
    return (
      <>
        <PageHeader title={nf ? 'Asset not found' : 'Asset'} back={back} />
        {nf ? (
          <EmptyState title={`${tag} was not found`} description="Check the tag, or search the registry." icon={TagIcon} />
        ) : (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        )}
      </>
    );
  }
  const d = query.data!;
  const a = d.asset;
  const Icon = categoryIcon(a.category.icon);
  const here = `/assets/${a.tag}`;

  const run = (action: AssetAction) => {
    switch (action) {
      case 'ISSUE':
        return navigate(`/forms/new/issuance?assets=${a.tag}&from=${here}`);
      case 'RETURN':
        return navigate(`/forms/new/return?assets=${a.tag}&from=${here}`);
      case 'SEND_FOR_REPAIR':
        return navigate(`/forms/new/movement?assets=${a.tag}&to=VENDOR&from=${here}`);
      case 'RECEIVE_BACK':
        return navigate(`/forms/new/return?assets=${a.tag}&returner=VENDOR&from=${here}`);
      case 'REPORT_DAMAGE':
        return setModal('damage');
      case 'RETIRE':
        return setModal('retire');
      case 'REPAIR':
        return setModal('repair');
      case 'DELETE':
        return setModal('delete');
    }
  };

  return (
    <>
      <PageHeader title="" back={back} />
      {a.deletedAt ? (
        <InfoNote icon={Trash2} tone="red" className="mb-4">
          This asset was deleted on {fmtDate(a.deletedAt)}. It is hidden from the registry, counts and exports; its custody
          history and signed documents are kept.
        </InfoNote>
      ) : null}
      <Card className="mb-5 px-6 py-6">
        <div className="flex flex-wrap items-start gap-5">
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-green-100 text-brand" aria-hidden>
            <Icon className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-gray-900">{a.makeModel}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <TagChip tag={a.tag} />
              <AssetStatusCell asset={a} variant="dot" />
              {d.currentForm ? (
                <Link to={`/documents/${d.currentForm.reference}`}>
                  <Badge tone="blue" dot={false} icon={<Send className="h-3.5 w-3.5" />}>
                    Indemnity {d.currentForm.reference}
                  </Badge>
                </Link>
              ) : null}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-md text-gray-600">
              <span className="inline-flex items-center gap-1.5">
                <TagIcon className="h-4 w-4 text-gray-400" aria-hidden />
                SN {a.serial ?? '-'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <TagIcon className="h-4 w-4 text-gray-400" aria-hidden />
                Project {a.project.name}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-gray-400" aria-hidden />
                Added {fmtDate(a.createdAt)}
              </span>
            </div>
            <div className="mt-2.5 inline-flex items-center gap-1.5 text-md text-gray-600">
              <User className="h-4 w-4 text-gray-400" aria-hidden />
              Holder: {a.holder ? `${a.holder.name}${a.holder.type === 'VENDOR' && a.holder.company ? ` (${a.holder.company})` : ''}` : 'None — ' + a.location.name}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 self-center">
            {d.actions.map((act) => {
              const btn = (
                <Button
                  key={act.action}
                  variant={variantFor(act.action, act.primary)}
                  size="md"
                  className={act.action === 'DELETE' ? 'ml-3' : undefined}
                  disabled={!act.enabled}
                  icon={ACTION_ICON[act.action]}
                  onClick={() => run(act.action)}
                >
                  {ACTION_LABEL[act.action]}
                </Button>
              );
              return act.enabled ? btn : <Tooltip key={act.action} content={act.reason}>{btn}</Tooltip>;
            })}
          </div>
        </div>
        {d.activeForm ? (
          <InfoNote icon={Lock} className="mt-5">
            On <Link className="font-semibold text-brand underline" to={`/signoffs?ref=${d.activeForm.reference}`}>{d.activeForm.reference}</Link>{' '}
            ({d.activeForm.status === 'PENDING_APPROVAL' ? 'awaiting approval' : FORM_STATUS_LABEL[d.activeForm.status].toLowerCase()}). Actions are paused until
            that form is signed or cancelled.
          </InfoNote>
        ) : null}
        {d.repair ? (
          <InfoNote icon={Wrench} className="mt-5" tone="amber">
            At {d.repair.vendor ?? 'the vendor'} for repair under{' '}
            <Link className="font-semibold underline" to={`/documents/${d.repair.reference}`}>
              {d.repair.reference}
            </Link>
            {d.repair.expectedReturn ? `, expected back ${fmtDate(d.repair.expectedReturn)}` : ''}. Use Receive back when it returns.
          </InfoNote>
        ) : null}
        {a.status === 'DAMAGED' && a.damageOrigin === 'INTAKE_FAILURE' && !a.inRepair ? (
          <InfoNote icon={Info} className="mt-5">
            This item failed the Form 1 checks{d.intake ? ` on ${d.intake.reference}` : ''}. Send it for repair, or retire it
            (reason “Rejected at intake”) if it goes back to the supplier.
          </InfoNote>
        ) : null}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="px-5 pb-6">
          <CardHeader title="Chain of custody" className="px-0" />
          {d.timeline.length ? <Timeline entries={d.timeline.map(toTimelineEntry)} /> : <EmptyState title="No custody events yet" />}
        </Card>
        <div className="space-y-5">
          <Card className="px-5 pb-5">
            <CardHeader title="Intake snapshot" className="px-0" />
            {d.intake ? (
              <KeyValueBox
                rows={[
                  ['Supplier / vendor', d.intake.supplier],
                  ['PO reference', d.intake.poReference],
                  ['Delivery location', d.intake.deliveryLocation],
                  ['Delivery date', fmtDate(d.intake.deliveryDate)],
                  [
                    'OEM support',
                    d.intake.oemSupport ? <Badge tone="green">Active</Badge> : <Badge tone="gray">None</Badge>,
                  ],
                ]}
              />
            ) : (
              <p className="text-md text-gray-500">No intake record (asset pre-dates Form 1).</p>
            )}
          </Card>
          <Card className="px-5 pb-5">
            <CardHeader title="Lifecycle totals" className="px-0" />
            <dl className="grid grid-cols-4 divide-x-2 divide-gray-200">
              {(
                [
                  ['Intake', d.totals.intake],
                  ['Issuances', d.totals.issuances],
                  ['Movements', d.totals.movements],
                  ['Returns', d.totals.returns],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="px-3 first:pl-0">
                  <dd className="text-kpi font-extrabold text-gray-900">{v}</dd>
                  <dt className="text-sm text-gray-600">{k}</dt>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="px-5 pb-5">
            <CardHeader title="Physical tag (Phase 4)" className="px-0" />
            <div className="flex flex-col items-center">
              <Barcode text={a.tag} className="h-9 max-w-[140px]" />
              <span className="font-tag mt-1 text-2xs tracking-[0.15em] text-gray-500">{a.tag}</span>
              <p className="mt-3 text-center text-sm text-gray-500">Scan the printed tag with the IT console to open this record instantly.</p>
            </div>
          </Card>
        </div>
      </div>

      <ReportDamageModal asset={a} open={modal === 'damage'} onOpenChange={(o) => setModal(o ? 'damage' : null)} />
      {modal === 'retire' ? <RetireModal asset={a} open onOpenChange={(o) => setModal(o ? 'retire' : null)} /> : null}
      <RepairModal asset={a} open={modal === 'repair'} onOpenChange={(o) => setModal(o ? 'repair' : null)} />
      {modal === 'delete' ? <DeleteModal asset={a} open onOpenChange={(o) => setModal(o ? 'delete' : null)} /> : null}
    </>
  );
}
