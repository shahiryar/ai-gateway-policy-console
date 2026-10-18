import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, EmptyState, ErrorAlert, LinkButton, PageHeader, Spinner, formatDate } from '../components/ui';
import { api } from '../lib/api';
import { NO_PERMISSION, useSession } from '../lib/session';
import { shortId, type DlpKind, type DlpTemplate } from '../lib/types';

const TABS: { kind: DlpKind; label: string; description: string }[] = [
  { kind: 'inspect', label: 'Inspect templates', description: 'What counts as sensitive: built-in infoTypes, custom patterns and word lists.' },
  { kind: 'deidentify', label: 'De-identify templates', description: 'How findings are masked, replaced or removed.' },
];

function detail(kind: DlpKind, t: DlpTemplate): string[] {
  if (kind === 'inspect') {
    const c = t.inspectConfig ?? {};
    return [...(c.infoTypes ?? []).map((i) => i.name), ...(c.customInfoTypes ?? []).map((i) => `${i.infoType.name} (custom)`)];
  }
  const tr = (t.deidentifyConfig as { infoTypeTransformations?: { transformations?: { primitiveTransformation?: object }[] } } | undefined)
    ?.infoTypeTransformations?.transformations;
  return (tr ?? []).map((x) => Object.keys(x.primitiveTransformation ?? {})[0] ?? 'custom');
}

export function DlpPage() {
  const { location, can } = useSession();
  const [params, setParams] = useSearchParams();
  const kind: DlpKind = params.get('kind') === 'deidentify' ? 'deidentify' : 'inspect';
  const tab = TABS.find((t) => t.kind === kind)!;
  const templates = useQuery({ queryKey: ['dlp', location, kind], queryFn: () => api.listDlp(location, kind) });
  const canCreate = can(kind === 'inspect' ? 'inspectCreate' : 'deidentifyCreate');

  return (
    <>
      <PageHeader
        title="Sensitive Data Protection templates"
        description="Model Armor templates in Advanced mode use these to decide what is sensitive and how to mask it."
        actions={
          <LinkButton to={`/dlp/${kind}/new`} disabled={!canCreate} disabledReason={NO_PERMISSION}>
            New {kind === 'inspect' ? 'inspect' : 'de-identify'} template
          </LinkButton>
        }
      />
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.kind}
            type="button"
            onClick={() => setParams({ kind: t.kind })}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              t.kind === kind ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mb-4 text-sm text-slate-600">{tab.description}</p>
      <ErrorAlert error={templates.error} />
      {templates.isLoading && <Spinner />}
      {templates.data?.length === 0 && <EmptyState title={`No ${tab.label.toLowerCase()} in ${location}`} />}
      {templates.data && templates.data.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">{kind === 'inspect' ? 'Detects' : 'Transformation'}</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {templates.data.map((t) => {
                const items = detail(kind, t);
                return (
                  <tr key={t.name} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link to={`/dlp/${kind}/${shortId(t.name)}`} className="font-medium text-slate-900 hover:text-indigo-700">
                        {t.displayName || shortId(t.name)}
                      </Link>
                      <div className="text-xs text-slate-500">{shortId(t.name)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {items.slice(0, 5).map((i) => (
                          <Badge key={i}>{i}</Badge>
                        ))}
                        {items.length > 5 && <Badge>+{items.length - 5} more</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(t.updateTime)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
