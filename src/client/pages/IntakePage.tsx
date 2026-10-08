import { useQuery } from '@tanstack/react-query';
import { Check, CheckCircle2, CircleCheck, History, Info, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { INTAKE_CHECK_QUESTIONS, scoreChecks, type CheckAnswer } from '../../shared/constants';
import { fmtDate, fmtRelative, isoDateWAT } from '../../shared/format';
import { LineItemModal, type LineItem } from '../components/intake/LineItemModal';
import { Badge, TagChip } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Field, Select, TextInput, YesNoNa } from '../components/ui/Controls';
import { EmptyState, ErrorState, InfoNote, ItemCard, PageHeader, SectionHeader, Skeleton } from '../components/ui/Layout';
import { Modal } from '../components/ui/Overlay';
import { useToast } from '../components/ui/Toast';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/cn';
import { useMeta, useUnsavedChangesPrompt } from '../lib/hooks';
import { categoryIcon } from '../lib/icons';
import { errorMessage, queryClient } from '../lib/query';

interface IntakeForm {
  supplier: string;
  poReference: string;
  projectId: string | null;
  deliveryLocation: string;
  deliveryDate: string | null;
  validatedByName: string;
  validatedByTitle: string;
  validatedDate: string | null;
  lineItems: LineItem[];
  checks: Array<{ answer: CheckAnswer | null; remark: string | null }>;
}

interface IntakeRecord extends IntakeForm {
  id: string;
  reference: string;
  status: 'DRAFT' | 'VALIDATED';
  updatedAt: string;
  validatedAt: string | null;
  project: string | null;
  lineItems: Array<LineItem & { assetTag: string | null; category: string; categoryIcon: string }>;
}

interface ValidationResult {
  reference: string;
  created: Array<{ tag: string; result: 'PASSED' | 'FAILED' }>;
  passed: number;
  failed: number;
  quantityMismatch: boolean;
}

const blank = (name: string, title: string): IntakeForm => ({
  supplier: '',
  poReference: '',
  projectId: null,
  deliveryLocation: '',
  deliveryDate: isoDateWAT(),
  validatedByName: name,
  validatedByTitle: title,
  validatedDate: isoDateWAT(),
  lineItems: [],
  checks: INTAKE_CHECK_QUESTIONS.map(() => ({ answer: null, remark: null })),
});

const pick = (r: IntakeRecord): IntakeForm => ({
  supplier: r.supplier,
  poReference: r.poReference,
  projectId: r.projectId,
  deliveryLocation: r.deliveryLocation,
  deliveryDate: r.deliveryDate,
  validatedByName: r.validatedByName,
  validatedByTitle: r.validatedByTitle,
  validatedDate: r.validatedDate,
  lineItems: r.lineItems.map(({ categoryId, makeModel, serial, notes, result, unitCost }) => ({ categoryId, makeModel, serial, notes, result, unitCost })),
  checks: r.checks.map((c) => ({ answer: c.answer, remark: c.remark })),
});

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function IntakePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const meta = useMeta();
  const [form, setForm] = useState<IntakeForm>(() => blank(user?.name ?? '', user?.title ?? ''));
  const [record, setRecord] = useState<{ id: string; reference: string; updatedAt: string } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lineModal, setLineModal] = useState<{ open: boolean; index: number | null }>({ open: false, index: null });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [validating, setValidating] = useState(false);
  const formRef = useRef(form);
  formRef.current = form;
  const recordRef = useRef(record);
  recordRef.current = record;
  const savingRef = useRef<Promise<unknown> | null>(null);
  const dirtyRef = useRef(false);

  const loaded = useQuery({
    queryKey: ['intake', id],
    queryFn: () => api<IntakeRecord>(`/intakes/${id}`),
    enabled: Boolean(id),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (loaded.data && loaded.data.status === 'DRAFT' && recordRef.current?.id !== loaded.data.id) {
      setForm(pick(loaded.data));
      setRecord({ id: loaded.data.id, reference: loaded.data.reference, updatedAt: loaded.data.updatedAt });
      setSaveState('saved');
    }
  }, [loaded.data]);
  useEffect(() => {
    if (!id) {
      setRecord(null);
      setForm(blank(user?.name ?? '', user?.title ?? ''));
      setSaveState('idle');
    }
  }, [id, user]);

  const save = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) await savingRef.current.catch(() => undefined);
    if (!dirtyRef.current && recordRef.current) return true;
    dirtyRef.current = false;
    setSaveState('saving');
    const body = formRef.current;
    const p = (async () => {
      const r = recordRef.current
        ? await api<IntakeRecord>(`/intakes/${recordRef.current.id}`, { method: 'PATCH', body })
        : await api<IntakeRecord>('/intakes', { body });
      const fresh = { id: r.id, reference: r.reference, updatedAt: r.updatedAt };
      if (!recordRef.current) {
        recordRef.current = fresh;
        navigate(`/intake/${r.id}`, { replace: true });
      }
      setRecord(fresh);
      queryClient.setQueryData(['intake', r.id], r);
    })();
    savingRef.current = p;
    try {
      await p;
      setSaveState(dirtyRef.current ? 'pending' : 'saved');
      return true;
    } catch (e) {
      dirtyRef.current = true;
      setSaveState('error');
      toast.error(`Auto-save failed: ${errorMessage(e)}`);
      return false;
    } finally {
      savingRef.current = null;
    }
  }, [navigate, toast]);

  // Debounced auto-save.
  useEffect(() => {
    if (saveState !== 'pending') return;
    const t = setTimeout(() => void save(), 1200);
    return () => clearTimeout(t);
  }, [form, saveState, save]);

  useUnsavedChangesPrompt(saveState === 'pending' || saveState === 'saving' || saveState === 'error', 'This intake has changes that are not saved yet. Leave anyway?');

  const update = (patch: Partial<IntakeForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    dirtyRef.current = true;
    setSaveState('pending');
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[k];
      return next;
    });
  };

  const tagPreview = useQuery({
    queryKey: ['tag-preview', form.lineItems.length],
    queryFn: () => api<{ tags: string[] }>(`/intakes/tag-preview?count=${form.lineItems.length}`),
    enabled: form.lineItems.length > 0,
  });

  const score = scoreChecks(form.checks.map((c) => c.answer));
  const categories = useMemo(() => meta.data?.categories ?? [], [meta.data]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const project = meta.data?.projects.find((p) => p.id === form.projectId);
  const passed = form.lineItems.filter((l) => l.result === 'PASSED').length;
  const failed = form.lineItems.length - passed;

  const clientErrors = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!form.supplier.trim()) e.supplier = 'Enter the supplier / vendor.';
    if (!form.poReference.trim()) e.poReference = 'Enter the PO reference.';
    if (!form.projectId) e.projectId = 'Choose the project.';
    if (!form.deliveryLocation) e.deliveryLocation = 'Choose the delivery location.';
    if (!form.deliveryDate) e.deliveryDate = 'Enter the delivery date.';
    if (form.lineItems.length === 0) e.lineItems = 'Add at least one line item.';
    form.checks.forEach((c, i) => !c.answer && (e[`checks.${i}`] = `Answer: ${INTAKE_CHECK_QUESTIONS[i]}`));
    if (!form.validatedByName.trim()) e.validatedByName = 'Enter the validator’s full name.';
    if (!form.validatedByTitle.trim()) e.validatedByTitle = 'Enter the validator’s title.';
    if (!form.validatedDate) e.validatedDate = 'Enter the validation date.';
    return e;
  };

  const showErrors = (e: Record<string, string>) => {
    setErrors(e);
    const first = Object.keys(e)[0];
    toast.error(`${Object.keys(e).length} field${Object.keys(e).length === 1 ? '' : 's'} need attention: ${Object.values(e)[0]}`);
    if (first) {
      const el = document.getElementById(`f-${first.split('.').slice(0, 2).join('-')}`) ?? document.getElementById(`f-${first.split('.')[0]}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el?.querySelector('input,select,button') as HTMLElement | null)?.focus({ preventScroll: true });
    }
  };

  const startValidate = () => {
    const e = clientErrors();
    if (Object.keys(e).length) return showErrors(e);
    setConfirmOpen(true);
  };

  const doValidate = async () => {
    setValidating(true);
    try {
      dirtyRef.current = true;
      if (!(await save())) return;
      const r = await api<ValidationResult>(`/intakes/${recordRef.current!.id}/validate`, { body: {} });
      setConfirmOpen(false);
      dirtyRef.current = false;
      setSaveState('idle');
      const tags = r.created.map((c) => c.tag);
      if (r.passed) toast.success(`${r.passed} asset${r.passed === 1 ? '' : 's'} created · status In Store`, { label: 'View', to: `/assets?sort=tag&dir=desc&highlight=${tags.join(',')}` });
      if (r.failed) toast.error(`${r.failed} item${r.failed === 1 ? '' : 's'} failed intake · flagged Damaged`);
      if (r.quantityMismatch) toast.error(`Quantity mismatch - recorded on ${r.reference} for follow-up`);
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      navigate(`/assets?sort=tag&dir=desc&highlight=${tags.join(',')}`);
    } catch (e) {
      setConfirmOpen(false);
      if (e instanceof ApiError && Object.keys(e.fields).length) showErrors(e.fields);
      else toast.error(errorMessage(e));
    } finally {
      setValidating(false);
    }
  };

  const doDiscard = async () => {
    try {
      if (recordRef.current) await api(`/intakes/${recordRef.current.id}`, { method: 'DELETE', body: {} });
      dirtyRef.current = false;
      setSaveState('idle');
      setDiscardOpen(false);
      toast.info(`Draft ${recordRef.current?.reference ?? ''} discarded`);
      navigate('/assets');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const back = { to: '/assets', label: 'Asset Registry' };
  const header = (
    <PageHeader
      back={back}
      title="Intake - Validation Checklist"
      subtitle="Form 1 · IT only · passes create assets In Store, failures are flagged Damaged"
    />
  );

  if (id && loaded.isLoading) {
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
  if (id && loaded.error) {
    return (
      <>
        {header}
        <ErrorState message={errorMessage(loaded.error)} onRetry={() => void loaded.refetch()} />
      </>
    );
  }
  if (loaded.data?.status === 'VALIDATED') {
    const v = loaded.data;
    return (
      <>
        {header}
        <EmptyState
          icon={CircleCheck}
          title={`${v.reference} was validated on ${fmtDate(v.validatedAt)}`}
          description={
            <span className="flex flex-wrap justify-center gap-1.5">
              {v.lineItems.map((l) => (l.assetTag ? <TagChip key={l.assetTag} tag={l.assetTag} link /> : null))}
            </span>
          }
          action={
            <Button onClick={() => navigate('/intake')} icon={<Plus className="h-4 w-4" />}>
              Start a new intake
            </Button>
          }
        />
      </>
    );
  }

  const savedText =
    saveState === 'saving'
      ? 'saving…'
      : saveState === 'pending'
        ? 'unsaved changes'
        : saveState === 'error'
          ? 'not saved - retrying on next change'
          : record
            ? `auto-saved ${fmtRelative(record.updatedAt)}`
            : 'not saved yet';

  return (
    <>
      {header}
      <div
        className="mb-5 flex flex-wrap items-center gap-3 rounded-[10px] bg-gray-800 px-5 py-3 text-md font-medium text-white shadow-2"
        role="status"
        aria-live="polite"
      >
        <History className="h-4 w-4" aria-hidden />
        <span>
          {record ? `Draft ${record.reference}` : 'New draft'} {savedText} · {form.lineItems.length} line item{form.lineItems.length === 1 ? '' : 's'} ·{' '}
          {score.passed} of {score.scorable} checks passed
        </span>
      </div>

      <div className="card overflow-hidden rounded-md border-2 shadow-2">
        {/* 1 Delivery details */}
        <section className="border-b-2 border-gray-100 px-6 py-6">
          <SectionHeader n={1} title="Delivery details" />
          <div className="grid gap-x-4 gap-y-4 md:grid-cols-3">
            <Field label="Supplier / vendor" htmlFor="f-supplier" error={errors.supplier}>
              <TextInput id="f-supplier" value={form.supplier} invalid={!!errors.supplier} onChange={(e) => update({ supplier: e.target.value })} onBlur={() => !form.supplier.trim() && setErrors((x) => ({ ...x, supplier: 'Enter the supplier / vendor.' }))} />
            </Field>
            <Field label="PO reference" htmlFor="f-poReference" error={errors.poReference}>
              <TextInput id="f-poReference" value={form.poReference} invalid={!!errors.poReference} onChange={(e) => update({ poReference: e.target.value })} onBlur={() => !form.poReference.trim() && setErrors((x) => ({ ...x, poReference: 'Enter the PO reference.' }))} />
            </Field>
            <Field label="Project" htmlFor="f-projectId" error={errors.projectId}>
              <Select
                id="f-projectId"
                value={form.projectId ?? ''}
                invalid={!!errors.projectId}
                placeholder="Choose a project"
                onChange={(e) => update({ projectId: e.target.value || null })}
                options={meta.data?.projects.map((p) => ({ value: p.id, label: p.name })) ?? []}
              />
            </Field>
            <Field label="Delivery location" htmlFor="f-deliveryLocation" error={errors.deliveryLocation}>
              <Select
                id="f-deliveryLocation"
                value={form.deliveryLocation}
                invalid={!!errors.deliveryLocation}
                placeholder="Choose a location"
                onChange={(e) => update({ deliveryLocation: e.target.value })}
                options={meta.data?.locations.map((l) => ({ value: l.name, label: l.name })) ?? []}
              />
            </Field>
            <Field label="Delivery date" htmlFor="f-deliveryDate" error={errors.deliveryDate}>
              <TextInput id="f-deliveryDate" type="date" max={isoDateWAT()} value={form.deliveryDate ?? ''} invalid={!!errors.deliveryDate} onChange={(e) => update({ deliveryDate: e.target.value || null })} />
            </Field>
          </div>
        </section>

        {/* 2 Line items */}
        <section className="border-b-2 border-gray-100 px-6 py-6" id="f-lineItems">
          <SectionHeader n={2} title="Line items - each row becomes an asset record" />
          <div className="space-y-4">
            {form.lineItems.map((l, i) => {
              const c = catById.get(l.categoryId);
              const Icon = categoryIcon(c?.icon);
              const tag = tagPreview.data?.tags[i];
              return (
                <div key={i} id={`f-lineItems-${i}`}>
                  <ItemCard
                    icon={Icon}
                    title={
                      <button type="button" className="text-left hover:underline" onClick={() => setLineModal({ open: true, index: i })}>
                        {l.makeModel} · {c?.description || c?.name}
                      </button>
                    }
                    sub={`${l.serial ? `SN ${l.serial}` : 'No serial'} · will be tagged ${tag ?? '…'}${l.notes ? ` · ${l.notes}` : ''}`}
                    right={
                      <>
                        {l.result === 'PASSED' ? <Badge tone="green">Passed</Badge> : <Badge tone="red">Failed</Badge>}
                        <button
                          type="button"
                          aria-label={`Remove line ${i + 1}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          onClick={() => update({ lineItems: form.lineItems.filter((_, j) => j !== i) })}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    }
                    className={cn(errors[`lineItems.${i}.serial`] && 'border-red')}
                  />
                  {errors[`lineItems.${i}.serial`] ? <p className="mt-1 text-sm text-red">{errors[`lineItems.${i}.serial`]}</p> : null}
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setLineModal({ open: true, index: null })}
              className={cn(
                'flex h-9 w-full items-center justify-center gap-2 rounded-sm border-2 border-dashed text-sm font-semibold text-brand hover:bg-green-bg',
                errors.lineItems ? 'border-red' : 'border-brand',
              )}
            >
              <Plus className="h-4 w-4" aria-hidden /> Add line item
            </button>
            {errors.lineItems ? <p className="text-sm text-red">{errors.lineItems}</p> : null}
            {form.lineItems.length > 0 ? (
              <p className="text-xs text-gray-400">Tags shown are a preview — they are assigned only when the intake is validated.</p>
            ) : null}
          </div>
        </section>

        {/* 3 Checklist */}
        <section className="border-b-2 border-gray-100 px-6 py-6">
          <SectionHeader n={3} title="Validation checklist" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <caption className="sr-only">Validation checklist</caption>
              <thead className="border-b-2 border-gray-200 bg-gray-50">
                <tr>
                  <th scope="col" className="th w-[40%]">Check item</th>
                  <th scope="col" className="th">Result</th>
                  <th scope="col" className="th w-[32%]">Remark (optional)</th>
                </tr>
              </thead>
              <tbody>
                {INTAKE_CHECK_QUESTIONS.map((q, i) => (
                  <tr key={q} id={`f-checks-${i}`} className="border-b-2 border-gray-100">
                    <td className="td py-3.5 text-gray-700">
                      {q}
                      {errors[`checks.${i}`] ? <p className="mt-1 text-sm text-red">Choose Yes, No or N/A.</p> : null}
                    </td>
                    <td className="td">
                      <YesNoNa
                        name={`check-${i}`}
                        label={q}
                        value={form.checks[i]?.answer ?? null}
                        onChange={(v) => {
                          update({ checks: form.checks.map((c, j) => (j === i ? { ...c, answer: v } : c)) });
                          setErrors((e) => {
                            const n = { ...e };
                            delete n[`checks.${i}`];
                            return n;
                          });
                        }}
                      />
                    </td>
                    <td className="td">
                      <TextInput
                        aria-label={`Remark for: ${q}`}
                        className="h-8 text-sm"
                        placeholder="Add remark..."
                        value={form.checks[i]?.remark ?? ''}
                        onChange={(e) => update({ checks: form.checks.map((c, j) => (j === i ? { ...c, remark: e.target.value } : c)) })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 4 Validated by */}
        <section className="px-6 py-6">
          <SectionHeader n={4} title="Validated by" />
          <div className="grid gap-x-0 gap-y-4 md:max-w-[646px] md:grid-cols-3">
            <Field label="Full name" htmlFor="f-validatedByName" error={errors.validatedByName}>
              <TextInput id="f-validatedByName" className="md:rounded-r-none" value={form.validatedByName} invalid={!!errors.validatedByName} onChange={(e) => update({ validatedByName: e.target.value })} />
            </Field>
            <Field label="Title / position" htmlFor="f-validatedByTitle" error={errors.validatedByTitle}>
              <TextInput id="f-validatedByTitle" className="md:rounded-none" value={form.validatedByTitle} invalid={!!errors.validatedByTitle} onChange={(e) => update({ validatedByTitle: e.target.value })} />
            </Field>
            <Field label="Date" htmlFor="f-validatedDate" error={errors.validatedDate}>
              <TextInput id="f-validatedDate" type="date" className="md:rounded-l-none" value={form.validatedDate ?? ''} invalid={!!errors.validatedDate} onChange={(e) => update({ validatedDate: e.target.value || null })} />
            </Field>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-end gap-3">
            {record ? (
              <Button variant="ghost" size="sm" className="mr-auto text-red hover:bg-red-light hover:text-red" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDiscardOpen(true)}>
                Discard draft
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              icon={<Check className="h-4 w-4" />}
              loading={saveState === 'saving'}
              onClick={async () => {
                dirtyRef.current = true;
                if (await save()) toast.success(`Draft ${recordRef.current?.reference ?? ''} saved`, { label: 'Resume later from Sign-offs', to: '/signoffs?tab=DRAFT' });
              }}
            >
              Save draft
            </Button>
            <Button size="lg" icon={<CheckCircle2 className="h-4 w-4" />} onClick={startValidate}>
              Validate &amp; create assets
            </Button>
          </div>
        </section>
      </div>

      <LineItemModal
        open={lineModal.open}
        onOpenChange={(o) => setLineModal((m) => ({ ...m, open: o }))}
        categories={categories}
        editing={lineModal.index !== null ? form.lineItems[lineModal.index] : null}
        onAdd={(items) => {
          if (lineModal.index !== null) update({ lineItems: form.lineItems.map((l, j) => (j === lineModal.index ? items[0]! : l)) });
          else update({ lineItems: [...form.lineItems, ...items] });
        }}
      />

      <Modal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Validate & create assets?"
        subtitle={`${form.poReference} · ${form.supplier} · ${form.lineItems.length} line item${form.lineItems.length === 1 ? '' : 's'} · project ${project?.name ?? ''}`}
        footer={
          <>
            <Button variant="outline" size="lg" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button size="lg" loading={validating} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => void doValidate()}>
              Validate &amp; create assets
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {passed > 0 ? (
            <div className="flex gap-3 rounded-md border-2 border-gray-200 bg-gray-50 px-4 py-3.5">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-green-100 text-brand" aria-hidden>
                <Check className="h-4 w-4" />
              </span>
              <div className="text-md text-gray-700">
                <b className="text-gray-900">{passed} item{passed === 1 ? '' : 's'} passed</b> all checks — created <b className="text-gray-900">In Store</b> with auto tags
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {form.lineItems.map((l, i) => (l.result === 'PASSED' ? <TagChip key={i} tag={tagPreview.data?.tags[i] ?? '…'} /> : null))}
                </div>
              </div>
            </div>
          ) : null}
          {failed > 0 ? (
            <div className="flex gap-3 rounded-md border-2 border-red/30 bg-red-light px-4 py-3.5">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-white text-red" aria-hidden>
                <X className="h-4 w-4" />
              </span>
              <div className="text-md text-gray-700">
                <b className="text-gray-900">{failed} item{failed === 1 ? '' : 's'} failed</b> — created <b className="text-red">Damaged</b> with a Failed intake flag
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {form.lineItems.map((l, i) => (l.result === 'FAILED' ? <TagChip key={i} tag={tagPreview.data?.tags[i] ?? '…'} className="bg-white text-red" /> : null))}
                </div>
              </div>
            </div>
          ) : null}
          <InfoNote icon={CircleCheck}>
            Tags are generated automatically — no manual entry. Failed items stay in Needs Attention until they are sent for
            repair or retired. Bad stock never silently enters inventory.
          </InfoNote>
        </div>
      </Modal>

      <Modal
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard this draft?"
        subtitle={record ? `Draft ${record.reference} · auto-saved ${fmtRelative(record.updatedAt)}` : undefined}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setDiscardOpen(false)}>
              Keep editing
            </Button>
            <Button variant="danger" size="lg" icon={<Trash2 className="h-4 w-4" />} onClick={() => void doDiscard()}>
              Discard draft
            </Button>
          </>
        }
      >
        <InfoNote icon={Info}>
          Discarding removes this draft and its <b>{form.lineItems.length} line item{form.lineItems.length === 1 ? '' : 's'}</b>. No asset records exist yet, so nothing in the
          registry is affected.
        </InfoNote>
      </Modal>
      <p className="mt-4 text-center text-xs text-gray-400">
        Drafts can be resumed from <Link className="underline" to="/signoffs?tab=DRAFT">Sign-offs → Draft</Link>.
      </p>
    </>
  );
}
