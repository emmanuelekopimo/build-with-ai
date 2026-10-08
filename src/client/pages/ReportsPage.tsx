import { useQuery } from '@tanstack/react-query';
import { Box, Building2, Clock, Send } from 'lucide-react';
import { useState } from 'react';
import { ExportModal, FORMAT_LABEL, REPORT_LIST, type Format, type ReportId } from '../components/reports/ExportModals';
import { Button } from '../components/ui/Button';
import { SearchInput } from '../components/ui/Controls';
import { Card, CardHeader, EmptyState, KpiCard, PageHeader } from '../components/ui/Layout';
import { Tooltip } from '../components/ui/Overlay';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

const DENIED = 'Only IT Admin can download bulk exports.';

export function ReportsPage() {
  const { can } = useAuth();
  const allowed = can('report.exportBulk');
  const s = useQuery({ queryKey: ['reports-summary'], queryFn: () => api<{ register: number; overdue: number; issuanceRecords: number; projectsAndLocations: number }>('/reports/summary') });
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ report: ReportId; format: Format } | null>(null);
  const rows = REPORT_LIST.filter((r) => `${r.title} ${r.description}`.toLowerCase().includes(search.toLowerCase()));
  const guard = (el: React.ReactNode) => (allowed ? el : <Tooltip content={DENIED}>{el}</Tooltip>);
  return (
    <>
      <PageHeader
        title="Reports & Exports"
        subtitle="Exportable registers and alerts - PDF, Excel or CSV"
        actions={guard(
          <Button size="lg" className="min-w-[160px]" disabled={!allowed} onClick={() => setModal({ report: 'asset-register', format: 'pdf' })}>
            Export report
          </Button>,
        )}
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Asset register" value={s.data?.register ?? 0} loading={s.isLoading} sub="all assets, current state" icon={Box} tone="green" />
        <KpiCard label="Overdue returns" value={s.data?.overdue ?? 0} loading={s.isLoading} sub="issued 90+ days, meant temporary" icon={Clock} tone="amber" />
        <KpiCard label="Issuance records" value={s.data?.issuanceRecords ?? 0} loading={s.isLoading} sub="per-staff history" icon={Send} tone="blue" />
        <KpiCard label="By project" value={s.data?.projectsAndLocations ?? 0} loading={s.isLoading} sub="locations & projects" icon={Building2} tone="gray" />
      </div>
      <Card className="overflow-hidden">
        <CardHeader
          title="Available exports"
          actions={<SearchInput containerClassName="w-full sm:w-[218px]" placeholder="Search reports..." label="Search reports" value={search} onChange={(e) => setSearch(e.target.value)} />}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <caption className="sr-only">Available exports</caption>
            <thead className="border-y-2 border-gray-200 bg-gray-50">
              <tr>
                <th scope="col" className="th w-[22%] pl-14">Report</th>
                <th scope="col" className="th">Description</th>
                <th scope="col" className="th w-[220px] text-center">Format</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b-2 border-gray-100 last:border-b-0">
                  <td className="td">{r.title}</td>
                  <td className="td">{r.description}</td>
                  <td className="td">
                    <span className="flex justify-end gap-1.5">
                      {(['pdf', 'xlsx', 'csv'] as Format[]).map((f) => (
                        <span key={f}>
                          {guard(
                            <Button variant="secondary" size="xs" className="min-w-[60px]" disabled={!allowed} aria-label={`${r.title} as ${FORMAT_LABEL[f]}`} onClick={() => setModal({ report: r.id, format: f })}>
                              {FORMAT_LABEL[f]}
                            </Button>,
                          )}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <EmptyState className="m-5" title="No reports match" description="Try “asset”, “issuance”, “overdue” or “project”." /> : null}
        </div>
      </Card>
      {!allowed ? <p className="mt-3 text-sm text-gray-500">{DENIED} Single-asset reports are available from each asset’s page.</p> : null}
      {modal ? <ExportModal key={`${modal.report}-${modal.format}`} report={modal.report} initialFormat={modal.format} open onOpenChange={(o) => !o && setModal(null)} /> : null}
    </>
  );
}
