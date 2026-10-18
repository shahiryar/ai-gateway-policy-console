import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge, EmptyState, ErrorAlert, LinkButton, PageHeader, Spinner, formatDate } from '../components/ui';
import { api } from '../lib/api';
import { NO_PERMISSION, useSession } from '../lib/session';
import { summarize } from '../lib/templateForm';
import { shortId } from '../lib/types';

export function TemplatesPage() {
  const { location, can } = useSession();
  const templates = useQuery({ queryKey: ['templates', location], queryFn: () => api.listTemplates(location) });

  return (
    <>
      <PageHeader
        title="Model Armor templates"
        description="A template sets which filters screen prompts and responses, and how strict each one is."
        actions={
          <LinkButton to="/templates/new" disabled={!can('templatesCreate')} disabledReason={NO_PERMISSION}>
            New template
          </LinkButton>
        }
      />
      <ErrorAlert error={templates.error} />
      {templates.isLoading && <Spinner />}
      {templates.data && templates.data.length === 0 && (
        <EmptyState title={`No templates in ${location} yet`}>Create one to start screening prompts and responses.</EmptyState>
      )}
      {templates.data && templates.data.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">Filters</th>
                <th className="px-4 py-3">Enforcement</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {templates.data.map((t) => {
                const id = shortId(t.name);
                return (
                  <tr key={t.name} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link to={`/templates/${id}`} className="hover:text-indigo-700">
                        {id}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {summarize(t).map((s) => (
                          <Badge key={s} color="indigo">
                            {s}
                          </Badge>
                        ))}
                        {summarize(t).length === 0 && <Badge>No filters</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {t.templateMetadata?.enforcementType === 'INSPECT_ONLY' ? 'Inspect only' : t.templateMetadata?.enforcementType === 'INSPECT_AND_BLOCK' ? 'Inspect and block' : 'Default'}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(t.updateTime)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/playground?template=${id}`} className="text-indigo-700 hover:underline">
                        Test
                      </Link>
                    </td>
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
