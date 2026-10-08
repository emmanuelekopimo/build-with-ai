// Component gallery (development only) for comparison with design/components.png.
import { Calendar, ClipboardList, Eye, Laptop, Plus, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import type { CheckAnswer } from '../../shared/constants';
import { Badge, FormStatusBadge, StatusBadge, TagChip, WorkflowChip } from '../components/ui/Badge';
import { Button, IconButton } from '../components/ui/Button';
import { ChipSelect, FilterChip, FilterSelect, SearchInput, Stepper, Tabs, TextInput, YesNoNa } from '../components/ui/Controls';
import { Barcode, Pagination, SignatureBlock, Timeline } from '../components/ui/Data';
import { EmptyState, InfoNote, ItemCard, KpiCard, PageHeader, PersonChip } from '../components/ui/Layout';
import { ToastView } from '../components/ui/Toast';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-gray-200 py-6">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.08em] text-gray-700">{title}</h2>
      {children}
    </section>
  );
}

export function DevComponentsPage() {
  const [tab, setTab] = useState<'all' | 'iss' | 'mvt' | 'rtr'>('all');
  const [n, setN] = useState(2);
  const [ans, setAns] = useState<CheckAnswer | null>('YES');
  const [cond, setCond] = useState<'FAIR' | 'POOR' | 'DAMAGED'>('DAMAGED');
  const [cat, setCat] = useState('');
  return (
    <div>
      <PageHeader title="Components" subtitle="Development gallery — compare with design/components.png" />
      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>New Intake</Button>
          <Button size="lg">Validate &amp; create assets</Button>
          <Button variant="secondary">Export</Button>
          <Button variant="secondary" size="lg">
            Secondary
          </Button>
          <Button variant="outline" size="sm">
            Filter
          </Button>
          <Button variant="outline" size="sm">
            Ghost
          </Button>
          <Button variant="danger">Reject</Button>
          <IconButton label="Preview">
            <Eye className="h-4 w-4" />
          </IconButton>
          <Button size="xs">Approve</Button>
          <Button variant="danger" size="xs">
            Reject
          </Button>
          <Button variant="secondary" size="xs">
            View
          </Button>
          <Button variant="warning">Report damage</Button>
          <Button loading>Saving</Button>
        </div>
      </Section>
      <Section title="Workflow chips (the four forms)">
        <div className="flex flex-wrap gap-3">
          <WorkflowChip type="INTAKE" />
          <WorkflowChip type="ISSUANCE" />
          <WorkflowChip type="MOVEMENT" />
          <WorkflowChip type="RETURN" />
          <WorkflowChip type="INDEMNITY" />
        </div>
      </Section>
      <Section title="Tabs · chips · filter controls · stepper">
        <Tabs
          className="inline-flex"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'all', label: 'All', count: 6 },
            { value: 'iss', label: 'Issuance', count: 3 },
            { value: 'mvt', label: 'Movement', count: 2 },
            { value: 'rtr', label: 'Return', count: 1 },
          ]}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <FilterChip label="Laptops" onRemove={() => undefined} />
          <FilterChip label="Project: ACE-5" onRemove={() => undefined} />
          <FilterChip label="HQ Uyo" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <FilterSelect label="This month" icon={Calendar} options={[]} value="" onChange={() => undefined} accent allLabel="Any" />
          <FilterSelect
            label="Category"
            icon={SlidersHorizontal}
            options={[{ value: 'l', label: 'Laptop' }]}
            value={cat}
            onChange={setCat}
          />
          <SearchInput placeholder="Search tag, serial, holder..." containerClassName="ml-auto w-[240px]" />
        </div>
        <div className="mt-4">
          <Stepper value={n} onChange={setN} label="Quantity" />
        </div>
      </Section>
      <Section title="Checklist radio group (Form 1) & remark">
        <div className="flex flex-wrap items-center gap-3">
          <YesNoNa value={ans} onChange={setAns} name="demo" label="Demo check" />
          <TextInput className="max-w-[340px]" defaultValue="Two units show minor screen marks - noted for intake" aria-label="Remark" />
        </div>
        <div className="mt-4">
          <ChipSelect
            label="Condition"
            value={cond}
            onChange={setCond}
            options={[
              { value: 'FAIR', label: 'Fair' },
              { value: 'POOR', label: 'Poor' },
              { value: 'DAMAGED', label: 'Damaged' },
            ]}
          />
        </div>
      </Section>
      <Section title="Signature block">
        <div className="max-w-[720px]">
          <SignatureBlock caption="E-signature · handed over by" name="Samuel Etuk" sub="Typed name · ✓ terms agreed" signedLabel="Signed 14 Aug 2026 · 09:12" />
        </div>
      </Section>
      <Section title="Chain-of-custody timeline">
        <div className="max-w-[560px]">
          <Timeline
            entries={[
              {
                id: '1',
                tone: 'green',
                title: 'Intake validated',
                when: '12 Jun 2026',
                detail: (
                  <>
                    <b className="text-gray-800">Supplier:</b> Dell EMC NG · <b className="text-gray-800">PO:</b> PO-1042 ·{' '}
                    <StatusBadge status="IN_STORE" />
                  </>
                ),
              },
              { id: '2', tone: 'blue', title: 'Issued to Samuel Etuk', when: '28 Jun 2026', detail: <>HR · Indemnity <b>ISS-0142</b> · <StatusBadge status="ISSUED" /></> },
              { id: '3', tone: 'amber', title: 'Moved', when: '14 Jul 2026', detail: <>Uyo HQ → Ikot Ekpene office · Reason: Field assignment</> },
              { id: '4', tone: 'green', title: 'Returned', when: '02 Aug 2026', detail: <>Condition: Good · <StatusBadge status="IN_STORE" /></> },
            ]}
          />
        </div>
      </Section>
      <Section title="Asset lifecycle mapping (badge bg / text)">
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="IN_STORE" />
          <StatusBadge status="ISSUED" />
          <StatusBadge status="DAMAGED" inRepair />
          <StatusBadge status="RETIRED" />
          <StatusBadge status="DAMAGED" />
          <StatusBadge status="DAMAGED" variant="table" />
          <Badge tone="green">Approved</Badge>
          <Badge tone="red">Rejected</Badge>
          <FormStatusBadge status="AWAITING" />
          <FormStatusBadge status="PARTIAL" />
          <FormStatusBadge status="EXPIRED" />
          <TagChip tag="ECEWS-IT-0001" />
        </div>
      </Section>
      <Section title="Typography - Inter (400 / 500 / 600 / 700 / 800)">
        <div className="space-y-2">
          <div className="text-2xl font-extrabold">Asset Registry</div>
          <div className="text-kpi font-extrabold">128</div>
          <div className="text-lg font-semibold">Pending Approvals</div>
          <div className="text-[15px] font-medium">Asset Registry</div>
          <div className="text-md">Lenovo ThinkPad T14 Gen 3</div>
          <div className="field-label">Serial number</div>
          <div className="text-xs font-semibold">In Store</div>
          <div className="font-tag text-sm font-semibold">ECEWS-IT-0001</div>
        </div>
      </Section>
      <Section title="Radii & shadows">
        <div className="flex flex-wrap items-center gap-4">
          {['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-pill'].map((r) => (
            <div key={r} className={`flex h-12 min-w-12 items-center justify-center bg-brand px-4 text-xs font-bold text-white ${r}`}>
              {r.replace('rounded-', '')}
            </div>
          ))}
          {['shadow-1', 'shadow-2', 'shadow-3', 'shadow-4 bg-brand'].map((s) => (
            <div key={s} className={`h-14 w-24 rounded-sm bg-white ${s}`} />
          ))}
        </div>
      </Section>
      <Section title="Modal, toast & empty state">
        <div className="flex flex-wrap gap-3">
          <ToastView kind="success" message="2 assets created · status In Store" />
          <ToastView kind="error" message="Quantity mismatch - recorded on IN-009 for follow-up" />
          <ToastView kind="info" message="Issuance request awaiting approval" />
        </div>
        <EmptyState
          className="mt-5"
          title="No assets assigned"
          description="Equipment you receive will appear here after IT approves an issuance request."
        />
      </Section>
      <Section title="Composite pieces">
        <div className="grid gap-4 md:grid-cols-2">
          <KpiCard label="In Store" value={128} sub="↑ 12 added this month" subTone="green" icon={ClipboardList} tone="green" />
          <ItemCard icon={Laptop} title="Lenovo ThinkPad T14 Gen 3" sub="ECEWS-IT-0001 · SN PF-3K2Q1R" right={<StatusBadge status="IN_STORE" />} />
          <PersonChip name="Samuel Etuk" sub="samuel.etuk@ecews.org" />
          <InfoNote>The recipient signs without an account. The link is single-use and expires after 7 days.</InfoNote>
          <Barcode text="ECEWS-IT-0001" />
          <Button variant="outline" icon={<Plus className="h-4 w-4" />}>
            Add line item
          </Button>
        </div>
        <div className="card mt-4">
          <Pagination page={1} pageSize={5} total={382} onPage={() => undefined} />
        </div>
      </Section>
    </div>
  );
}
