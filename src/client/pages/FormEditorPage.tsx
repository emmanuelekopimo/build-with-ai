import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { isoDateWAT } from '../../shared/format';
import { IssuanceEditor } from '../components/forms/IssuanceEditor';
import { draftFromMovementData, MovementEditor } from '../components/forms/MovementEditor';
import { draftFromReturnData, ReturnEditor } from '../components/forms/ReturnEditor';
import { emptyStaff } from '../components/forms/PersonFields';
import { Tabs } from '../components/ui/Controls';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui/Layout';
import { api } from '../lib/api';
import { errorMessage } from '../lib/query';
import type { AssetDetail, AssetSummary } from '../lib/types';
import type { FormDetail } from '../lib/formTypes';

type Kind = 'issuance' | 'return' | 'movement';
const KIND_TYPE = { issuance: 'ISSUANCE', return: 'RETURN', movement: 'MOVEMENT' } as const;
const TYPE_KIND = { ISSUANCE: 'issuance', RETURN: 'return', MOVEMENT: 'movement' } as const;

const HEAD: Record<Kind, { title: string; subtitle: string }> = {
  issuance: { title: 'New Issuance', subtitle: 'Form 2 · IT fills the form, then emails the recipient a secure link to sign - no staff login' },
  return: { title: 'New Return', subtitle: 'Form 4 · IT records the return, assesses condition, then emails the recipient a confirmation to sign' },
  movement: {
    title: 'New Movement',
    subtitle: 'Form 3 · IT records a transfer between staff, departments, offices or a vendor; the CTO and Admin Officer approve by email',
  },
};

async function loadAssets(tags: string[]): Promise<AssetDetail[]> {
  return Promise.all(tags.map((t) => api<AssetDetail>(`/assets/${t}`)));
}

/** Latest damage notes, used to prefill the reason for Send for Repair. */
function damageNotes(d: AssetDetail): string {
  for (let i = d.timeline.length - 1; i >= 0; i--) {
    const e = d.timeline[i]!;
    const notes = (e.detail as { notes?: string }).notes;
    if (['DAMAGE_REPORTED', 'INTAKE_FAILED', 'RETURNED', 'REPAIR_FAILED'].includes(e.type) && notes) return notes;
  }
  return '';
}

export function FormEditorPage() {
  const { kind: kindParam, id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const returnTo = params.get('from') || '/forms';

  const draft = useQuery({ queryKey: ['form', id], queryFn: () => api<FormDetail>(`/forms/${id}`), enabled: !!id, staleTime: Infinity });
  const kind: Kind | null = id ? (draft.data ? (TYPE_KIND as Record<string, Kind>)[draft.data.type] ?? null : null) : (['issuance', 'return', 'movement'].includes(kindParam ?? '') ? (kindParam as Kind) : null);

  const tags = useMemo(() => {
    if (id) return draft.data?.assets.map((a) => a.tag) ?? [];
    return (params.get('assets') ?? '').split(',').filter((t) => /^ECEWS-IT-\d{4,}$/.test(t));
  }, [id, draft.data, params]);

  const assetsQ = useQuery({
    queryKey: ['editor-assets', tags.join(',')],
    queryFn: () => loadAssets(tags),
    enabled: tags.length > 0 && (!id || !!draft.data),
    staleTime: Infinity,
  });

  if (!kind && !draft.isLoading) {
    return <EmptyState title="Unknown form" description="Choose Issuance, Return or Movement." />;
  }
  const head = kind ? HEAD[kind] : { title: '', subtitle: '' };
  const title = draft.data ? `Edit draft ${draft.data.reference}` : head.title;
  const header = <PageHeader back={{ to: returnTo, label: returnTo.startsWith('/assets') ? 'Asset Registry' : returnTo.startsWith('/signoffs') ? 'Sign-offs' : 'Issuance & Returns' }} title={title} subtitle={head.subtitle} />;

  if ((id && draft.isLoading) || (tags.length > 0 && assetsQ.isLoading)) {
    return (
      <>
        {header}
        <div className="card space-y-3 p-6">
          <Skeleton className="h-6 w-60" />
          <Skeleton className="w-full" />
        </div>
      </>
    );
  }
  const err = draft.error ?? assetsQ.error;
  if (err) {
    return (
      <>
        {header}
        <ErrorState message={errorMessage(err)} />
      </>
    );
  }
  if (draft.data && draft.data.status !== 'DRAFT') {
    return (
      <>
        {header}
        <EmptyState title={`${draft.data.reference} has already been sent`} description="Sent forms can’t be edited. Open it from Sign-offs to resend or cancel it." />
      </>
    );
  }

  const details = assetsQ.data ?? [];
  const assets: AssetSummary[] = details.map((d) => d.asset);
  const saved = draft.data ? { id: draft.data.id, reference: draft.data.reference } : null;
  const data = (draft.data?.data ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const editorKey = `${kind}-${id ?? 'new'}-${tags.join(',')}`;

  return (
    <>
      {header}
      {!id ? (
        <Tabs
          size="lg"
          className="mb-5"
          value={kind!}
          onChange={(k) => navigate(`/forms/new/${k}?from=${encodeURIComponent(returnTo)}`)}
          items={[
            { value: 'issuance', label: 'Issuance' },
            { value: 'return', label: 'Return' },
            { value: 'movement', label: 'Movement' },
          ]}
        />
      ) : null}
      {kind === 'issuance' ? (
        <IssuanceEditor key={editorKey} initial={{ recipient: { ...emptyStaff(), ...(data.recipient ?? {}) }, temporary: data.temporary, expectedReturn: data.expectedReturn }} initialAssets={assets} saved={saved} returnTo={returnTo} />
      ) : kind === 'return' ? (
        <ReturnEditor
          key={editorKey}
          initial={id ? draftFromReturnData(data) : { returnerType: params.get('returner') === 'VENDOR' ? 'VENDOR' : 'STAFF', returnDate: isoDateWAT() }}
          initialAssets={assets}
          saved={saved}
          returnTo={returnTo}
        />
      ) : kind === 'movement' ? (
        <MovementEditor
          key={editorKey}
          initial={
            id
              ? draftFromMovementData(data)
              : {
                  toType: params.get('to') === 'VENDOR' ? 'VENDOR' : 'STAFF',
                  reinstate: params.get('reinstate') === '1',
                  reason: params.get('to') === 'VENDOR' ? details.map(damageNotes).filter(Boolean).join('; ') : '',
                }
          }
          initialAssets={assets}
          saved={saved}
          returnTo={returnTo}
        />
      ) : null}
    </>
  );
}

export const FORM_KIND_TYPE = KIND_TYPE;
