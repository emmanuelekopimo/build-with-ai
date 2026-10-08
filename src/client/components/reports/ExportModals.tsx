import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { isoDateWAT } from '../../../shared/format';
import { download, qs } from '../../lib/api';
import { useMeta } from '../../lib/hooks';
import { errorMessage } from '../../lib/query';
import type { AssetSummary } from '../../lib/types';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';
import { CheckCard, ChoiceCard, Field, Select, TextInput } from '../ui/Controls';
import { Modal } from '../ui/Overlay';
import { useToast } from '../ui/Toast';

export type Format = 'pdf' | 'xlsx' | 'csv';
export const FORMAT_LABEL: Record<Format, string> = { pdf: 'PDF', xlsx: 'Excel', csv: 'CSV' };

export const REPORT_LIST = [
  { id: 'asset-register', title: 'Asset register', description: 'Full registry: tag, make/model, serial, status, holder, project', noun: 'assets' },
  { id: 'issuance-history', title: 'Issuance history per staff', description: 'Every indemnity a person has signed, past and present', noun: 'records' },
  { id: 'overdue-returns', title: 'Overdue-return alerts', description: 'Items issued 90+ days that were meant to be temporary', noun: 'items' },
  { id: 'assets-by-project', title: 'Assets by project', description: 'Stock and value grouped by project and location', noun: 'groups' },
] as const;
export type ReportId = (typeof REPORT_LIST)[number]['id'];

function FormatPicker({ value, onChange, desc }: { value: Format; onChange: (f: Format) => void; desc: Record<Format, string> }) {
  return (
    <div>
      <div className="mb-2 text-md font-medium text-gray-700">Format</div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(['pdf', 'xlsx', 'csv'] as Format[]).map((f) => (
          <ChoiceCard key={f} name="format" checked={value === f} onSelect={() => onChange(f)} title={FORMAT_LABEL[f]} description={desc[f]} />
        ))}
      </div>
    </div>
  );
}

function FileName({ name }: { name: string }) {
  return (
    <div>
      <div className="mb-2 text-md font-medium text-gray-700">File name</div>
      <div className="rounded-md border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm font-semibold text-brand">{name}</div>
    </div>
  );
}

/** Export report (Reports Download Modal; custom filters for the asset register as in Background+Shadow-2). */
export function ExportModal({ report, initialFormat, open, onOpenChange }: { report: ReportId; initialFormat: Format; open: boolean; onOpenChange: (v: boolean) => void }) {
  const toast = useToast();
  const meta = useMeta();
  const def = REPORT_LIST.find((r) => r.id === report)!;
  const [format, setFormat] = useState<Format>(initialFormat);
  const [history, setHistory] = useState(true);
  const [f, setF] = useState({ project: '', status: '', location: '', from: '', to: '' });
  const [busy, setBusy] = useState(false);
  const isRegister = report === 'asset-register';
  const filters = isRegister ? f : { project: '', status: '', location: '', from: '', to: '' };
  const count = useQuery({
    queryKey: ['report-count', report, filters],
    queryFn: () => api<{ count: number }>(`/reports/${report}/count${qs(filters)}`),
    enabled: open,
  });
  const fileName = `ECEWS-ITAMS-${report}_${isoDateWAT()}.${format}`;
  const filtered = Object.values(filters).some(Boolean);
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Export report"
      subtitle={`${def.title} · ${count.data?.count ?? '…'} ${def.noun} · ${filtered ? 'filtered' : 'current state'}`}
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="lg"
            loading={busy}
            icon={<Download className="h-4 w-4" />}
            onClick={async () => {
              setBusy(true);
              try {
                await download(`/reports/${report}/export${qs({ format, history: isRegister && history ? '1' : undefined, ...filters })}`, fileName);
                toast.success(`${fileName} downloaded`);
                onOpenChange(false);
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Download {FORMAT_LABEL[format]}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <FormatPicker
          value={format}
          onChange={setFormat}
          desc={{
            pdf: 'Print / audit-ready layout with ECEWS header, exactly like the signed paper forms.',
            xlsx: 'Editable spreadsheet for pivot tables and further analysis.',
            csv: 'Plain comma-separated data for other systems.',
          }}
        />
        {isRegister ? (
          <>
            <div>
              <div className="mb-2 text-md font-medium text-gray-700">Scope</div>
              <CheckCard checked={history} onCheckedChange={setHistory} title="Include full lifecycle history" description="Adds intake, issuance, movement and return events per asset." />
            </div>
            <div>
              <div className="mb-2 text-md font-medium text-gray-700">Custom filters</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Project" htmlFor="x-project">
                  <Select id="x-project" value={f.project} placeholder="All projects" onChange={(e) => setF({ ...f, project: e.target.value })} options={meta.data?.projects.map((p) => ({ value: p.id, label: p.name })) ?? []} />
                </Field>
                <Field label="Status" htmlFor="x-status">
                  <Select
                    id="x-status"
                    value={f.status}
                    placeholder="All statuses"
                    onChange={(e) => setF({ ...f, status: e.target.value })}
                    options={[
                      { value: 'IN_STORE', label: 'In Store' },
                      { value: 'ISSUED', label: 'Issued' },
                      { value: 'DAMAGED', label: 'Damaged' },
                      { value: 'IN_REPAIR', label: 'Damaged · in repair' },
                      { value: 'RETIRED', label: 'Retired' },
                    ]}
                  />
                </Field>
                <Field label="Location" htmlFor="x-location">
                  <Select id="x-location" value={f.location} placeholder="All locations" onChange={(e) => setF({ ...f, location: e.target.value })} options={meta.data?.locations.map((l) => ({ value: l.id, label: l.name })) ?? []} />
                </Field>
                <Field label="Date from" htmlFor="x-from">
                  <TextInput id="x-from" type="date" value={f.from} max={f.to || undefined} onChange={(e) => setF({ ...f, from: e.target.value })} />
                </Field>
                <Field label="Date to" htmlFor="x-to">
                  <TextInput id="x-to" type="date" value={f.to} min={f.from || undefined} onChange={(e) => setF({ ...f, to: e.target.value })} />
                </Field>
              </div>
            </div>
          </>
        ) : null}
        <FileName name={fileName} />
      </div>
    </Modal>
  );
}

/** Generate report for a single asset (Background+Shadow.png). */
export function GenerateReportModal({ asset, open, onOpenChange }: { asset: AssetSummary; open: boolean; onOpenChange: (v: boolean) => void }) {
  const toast = useToast();
  const [format, setFormat] = useState<Format>('pdf');
  const [timeline, setTimeline] = useState(true);
  const [intake, setIntake] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileName = `ECEWS-ITAMS-${asset.tag}_full-history_${isoDateWAT()}.${format}`;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Generate report"
      subtitle={`${asset.tag} · ${asset.makeModel} · single-asset export`}
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="lg"
            loading={busy}
            icon={<Download className="h-4 w-4" />}
            onClick={async () => {
              setBusy(true);
              try {
                await download(`/assets/${asset.tag}/report${qs({ format, timeline: timeline ? '1' : '0', intake: intake ? '1' : '0' })}`, fileName);
                toast.success(`${fileName} downloaded`);
                onOpenChange(false);
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Download {FORMAT_LABEL[format]}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <FormatPicker
          value={format}
          onChange={setFormat}
          desc={{ pdf: 'Audit-ready layout with ECEWS header — matches the signed paper forms.', xlsx: 'Editable spreadsheet for analysis.', csv: 'Plain comma-separated data.' }}
        />
        <div>
          <div className="mb-2 text-md font-medium text-gray-700">Include</div>
          <div className="space-y-3">
            <CheckCard checked={timeline} onCheckedChange={setTimeline} title="Full chain-of-custody timeline" description="Intake, issuances, movements, repairs, returns with timestamps and signers." />
            <CheckCard checked={intake} onCheckedChange={setIntake} title="Intake snapshot" description="Supplier, PO, delivery location and OEM validation results." />
          </div>
        </div>
        <FileName name={fileName} />
      </div>
    </Modal>
  );
}
