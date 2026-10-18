import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge, EmptyState, ErrorAlert, LinkButton, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { NO_PERMISSION, useSession } from '../lib/session';
import { INTEGRATION_LABELS } from '../lib/types';

const ENV_COLOR = { prod: 'red', staging: 'amber', dev: 'gray' } as const;

export function AppsPage() {
  const { can } = useSession();
  const apps = useQuery({ queryKey: ['apps'], queryFn: api.listApps });

  return (
    <>
      <PageHeader
        title="Applications"
        description="AI applications and the Model Armor templates that protect them. Open one to get the steps for applying its policy."
        actions={
          <LinkButton to="/apps/new" disabled={!can('templatesGet')} disabledReason={NO_PERMISSION}>
            Register application
          </LinkButton>
        }
      />
      <ErrorAlert error={apps.error} />
      {apps.isLoading && <Spinner />}
      {apps.data?.length === 0 && (
        <EmptyState title="No applications registered yet">Register an application to assign it a template and get integration steps.</EmptyState>
      )}
      {apps.data && apps.data.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Application</th>
                <th className="px-4 py-3">Environment</th>
                <th className="px-4 py-3">Runs on</th>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {apps.data.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link to={`/apps/${a.id}`} className="font-medium text-slate-900 hover:text-indigo-700">
                      {a.name}
                    </Link>
                    {a.description && <div className="max-w-xs truncate text-xs text-slate-500">{a.description}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={ENV_COLOR[a.environment]}>{a.environment}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{INTEGRATION_LABELS[a.integrationType]}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className="font-mono text-xs">{a.promptTemplateId}</span>
                    {a.responseTemplateId && a.responseTemplateId !== a.promptTemplateId && (
                      <span className="font-mono text-xs"> / {a.responseTemplateId}</span>
                    )}
                    <div className="text-xs text-slate-400">{a.location}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{a.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
