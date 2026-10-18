import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, CodeBlock, ConfirmDialog, ErrorAlert, LinkButton, PageHeader, Spinner, formatDate } from '../components/ui';
import { api } from '../lib/api';
import { INTEGRATION_LABELS } from '../lib/types';

/** Renders `inline code` spans in instruction text. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('`') && p.endsWith('`') ? (
          <code key={i} className="rounded bg-slate-100 px-1 py-0.5 text-xs">
            {p.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function AppDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const app = useQuery({ queryKey: ['app', id], queryFn: () => api.getApp(id!) });
  const instructions = useQuery({ queryKey: ['instructions', id, app.data?.updatedAt], queryFn: () => api.instructions(id!), enabled: Boolean(app.data) });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.deleteApp(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
      navigate('/apps');
    },
  });

  if (app.isLoading) return <Spinner />;
  if (app.error || !app.data) return <ErrorAlert error={app.error} />;
  const a = app.data;

  return (
    <>
      <PageHeader
        title={a.name}
        description={a.description}
        actions={
          <>
            <LinkButton variant="secondary" to={`/apps/${a.id}/edit`} disabled={!a.canEdit} disabledReason="Only the creator or a template editor can change this">
              Edit
            </LinkButton>
            <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={!a.canEdit} disabledReason="Only the creator or a template editor can delete this">
              Delete
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card title="Details">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Environment</dt>
                <dd><Badge>{a.environment}</Badge></dd>
              </div>
              <div>
                <dt className="text-slate-500">Applied through</dt>
                <dd className="text-slate-800">{INTEGRATION_LABELS[a.integrationType]}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Prompt template</dt>
                <dd>
                  <Link className="font-mono text-xs text-indigo-700 hover:underline" to={`/templates/${a.promptTemplateId}`}>
                    {a.promptTemplateId}
                  </Link>{' '}
                  <span className="text-xs text-slate-400">{a.location}</span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Response template</dt>
                <dd>
                  <Link className="font-mono text-xs text-indigo-700 hover:underline" to={`/templates/${a.responseTemplateId || a.promptTemplateId}`}>
                    {a.responseTemplateId || a.promptTemplateId}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Owner</dt>
                <dd className="text-slate-800">{a.owner}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Registered</dt>
                <dd className="text-slate-800">
                  {formatDate(a.createdAt)} by {a.createdBy}
                </dd>
              </div>
              {a.updatedAt !== a.createdAt && (
                <div>
                  <dt className="text-slate-500">Last changed</dt>
                  <dd className="text-slate-800">
                    {formatDate(a.updatedAt)} by {a.updatedBy}
                  </dd>
                </div>
              )}
            </dl>
            <div className="mt-4">
              <Link to={`/playground?template=${a.promptTemplateId}`} className="text-sm text-indigo-700 hover:underline">
                Test the prompt template
              </Link>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <ErrorAlert error={instructions.error} />
          {instructions.isLoading && <Spinner label="Preparing instructions" />}
          {instructions.data && (
            <Card title={instructions.data.title} description={instructions.data.summary}>
              <ol className="space-y-6">
                {instructions.data.steps.map((step, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
                      {step.body && (
                        <p className="mt-1 text-sm text-slate-600">
                          <RichText text={step.body} />
                        </p>
                      )}
                      {step.code && <CodeBlock language={step.code.language} code={step.code.content} />}
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-6 border-t border-slate-100 pt-4 text-sm">
                <span className="text-slate-500">Reference: </span>
                {instructions.data.docs.map((d, i) => (
                  <span key={d.url}>
                    {i > 0 && ' · '}
                    <a href={d.url} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline">
                      {d.label}
                    </a>
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Remove ${a.name}?`}
        body={
          <>
            <p>This removes the application from the registry only. Its templates and any integration already applied stay as they are.</p>
            {remove.error && (
              <div className="mt-3">
                <ErrorAlert error={remove.error} />
              </div>
            )}
          </>
        }
        confirmLabel="Remove"
        busy={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
