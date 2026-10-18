import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert, Card, ErrorAlert, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { shortId } from '../lib/types';

function Stat({ label, value, to }: { label: string; value: number | string; to: string }) {
  return (
    <Link to={to} className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm hover:border-indigo-300">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-slate-900">{value}</div>
    </Link>
  );
}

export function OverviewPage() {
  const { location, me, can } = useSession();
  const templates = useQuery({ queryKey: ['templates', location], queryFn: () => api.listTemplates(location), enabled: can('templatesList') });
  const inspect = useQuery({ queryKey: ['dlp', location, 'inspect'], queryFn: () => api.listDlp(location, 'inspect'), enabled: can('inspectList') });
  const deid = useQuery({ queryKey: ['dlp', location, 'deidentify'], queryFn: () => api.listDlp(location, 'deidentify'), enabled: can('deidentifyList') });
  const apps = useQuery({ queryKey: ['apps'], queryFn: api.listApps, enabled: can('templatesList') });

  const count = (q: { data?: unknown[]; isLoading: boolean }, allowed: boolean) =>
    !allowed ? 'No access' : q.isLoading ? '…' : q.data?.length ?? 0;

  const templateIds = new Set((templates.data ?? []).map((t) => shortId(t.name)));
  const broken = (apps.data ?? []).filter(
    (a) =>
      a.location === location &&
      templates.data &&
      (!templateIds.has(a.promptTemplateId) || (a.responseTemplateId && !templateIds.has(a.responseTemplateId))),
  );

  return (
    <>
      <PageHeader
        title="Overview"
        description={`AI safety policies for project ${me.projectId} in ${location}. Every action uses your own Google Cloud permissions.`}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Model Armor templates" value={count(templates, can('templatesList'))} to="/templates" />
        <Stat label="DLP inspect templates" value={count(inspect, can('inspectList'))} to="/dlp?kind=inspect" />
        <Stat label="DLP de-identify templates" value={count(deid, can('deidentifyList'))} to="/dlp?kind=deidentify" />
        <Stat label="Registered applications" value={count(apps, can('templatesList'))} to="/apps" />
      </div>

      <div className="mt-6 space-y-4">
        <ErrorAlert error={templates.error ?? apps.error} />
        {broken.length > 0 && (
          <Alert kind="warning">
            {broken.length} application(s) point at a template that no longer exists:{' '}
            {broken.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ', '}
                <Link className="font-medium underline" to={`/apps/${a.id}`}>
                  {a.name}
                </Link>
              </span>
            ))}
            .
          </Alert>
        )}
        <Card title="Getting started" description="The usual path from a policy to a protected application.">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>
              Optionally define what counts as sensitive data in a <Link className="text-indigo-700 underline" to="/dlp">DLP inspect template</Link>, and how to mask it in a de-identify template.
            </li>
            <li>
              Create a <Link className="text-indigo-700 underline" to="/templates/new">Model Armor template</Link> that sets the safety, prompt injection, URL and sensitive data filters.
            </li>
            <li>
              Try it with real prompts in the <Link className="text-indigo-700 underline" to="/playground">policy playground</Link>.
            </li>
            <li>
              <Link className="text-indigo-700 underline" to="/apps/new">Register the application</Link>, assign the template, and follow the generated steps for Vertex AI, your code, GKE, Apigee or Gemini Enterprise.
            </li>
          </ol>
        </Card>
      </div>
    </>
  );
}
