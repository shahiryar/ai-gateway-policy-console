import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, ErrorAlert, Field, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { NO_PERMISSION, useSession } from '../lib/session';
import { ENVIRONMENTS, INTEGRATION_LABELS, INTEGRATION_TYPES, shortId, type ApplicationInput } from '../lib/types';

export function AppEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const { me, location, can } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const existing = useQuery({ queryKey: ['app', id], queryFn: () => api.getApp(id!), enabled: !isNew });
  const [form, setForm] = useState<ApplicationInput>({
    name: '',
    description: '',
    owner: me.email,
    environment: 'dev',
    integrationType: 'api',
    location,
    promptTemplateId: '',
    responseTemplateId: '',
    workloadServiceAccount: '',
    model: '',
  });
  const templates = useQuery({ queryKey: ['templates', form.location], queryFn: () => api.listTemplates(form.location) });
  const [formError, setFormError] = useState<string>();

  useEffect(() => {
    if (existing.data) {
      const { id: _id, createdAt: _a, createdBy: _b, updatedAt: _c, updatedBy: _d, canEdit: _e, ...input } = existing.data;
      setForm(input);
    }
  }, [existing.data]);

  useEffect(() => {
    const first = templates.data?.[0];
    if (first && !form.promptTemplateId) setForm((f) => ({ ...f, promptTemplateId: shortId(first.name) }));
  }, [templates.data, form.promptTemplateId]);

  const set = <K extends keyof ApplicationInput>(key: K, value: ApplicationInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: () => (isNew ? api.createApp(form) : api.updateApp(id!, form)),
    onSuccess: (app) => {
      queryClient.invalidateQueries({ queryKey: ['apps'] });
      queryClient.invalidateQueries({ queryKey: ['app', app.id] });
      navigate(`/apps/${app.id}`);
    },
  });

  if (!isNew && existing.isLoading) return <Spinner />;
  if (!isNew && existing.error) return <ErrorAlert error={existing.error} />;
  const disabled = isNew ? !can('templatesGet') : existing.data?.canEdit === false;

  function submit() {
    const problem = !form.name.trim() ? 'Give the application a name.' : !form.promptTemplateId ? 'Choose a template.' : !form.owner.trim() ? 'Name an owner.' : undefined;
    setFormError(problem);
    if (!problem) save.mutate();
  }

  const templateOptions = (templates.data ?? []).map((t) => shortId(t.name));
  const needsServiceAccount = form.integrationType === 'api' || form.integrationType === 'apigee';
  const needsModel = form.integrationType === 'vertex-ai' || form.integrationType === 'service-extension';

  return (
    <>
      <PageHeader title={isNew ? 'Register application' : `Edit ${existing.data?.name}`} />
      {disabled && <div className="mb-4"><Alert kind="info">Only the person who registered this application or a Model Armor template editor can change it.</Alert></div>}
      <div className="space-y-5">
        <Card title="Application">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input className="input" value={form.name} disabled={disabled} onChange={(e) => set('name', e.target.value)} placeholder="Customer support assistant" />
            </Field>
            <Field label="Owner" hint="A person or group email.">
              <input className="input" value={form.owner} disabled={disabled} onChange={(e) => set('owner', e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description">
                <input className="input" value={form.description} disabled={disabled} onChange={(e) => set('description', e.target.value)} />
              </Field>
            </div>
            <Field label="Environment">
              <select className="input" value={form.environment} disabled={disabled} onChange={(e) => set('environment', e.target.value as ApplicationInput['environment'])}>
                {ENVIRONMENTS.map((env) => (
                  <option key={env} value={env}>
                    {env}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Where the policy is applied">
              <select className="input" value={form.integrationType} disabled={disabled} onChange={(e) => set('integrationType', e.target.value as ApplicationInput['integrationType'])}>
                {INTEGRATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {INTEGRATION_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Policy" description="Prompts and responses can use different templates; leave the response template empty to use the same one.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Region">
              <select
                className="input"
                value={form.location}
                disabled={disabled}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value, promptTemplateId: '', responseTemplateId: '' }))}
              >
                {me.locations.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prompt template">
              <select className="input" value={form.promptTemplateId} disabled={disabled} onChange={(e) => set('promptTemplateId', e.target.value)}>
                {templateOptions.length === 0 && <option value="">No templates in this region</option>}
                {templateOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Response template">
              <select className="input" value={form.responseTemplateId} disabled={disabled} onChange={(e) => set('responseTemplateId', e.target.value)}>
                <option value="">Same as prompt</option>
                {templateOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        {(needsServiceAccount || needsModel) && (
          <Card title="Details for the instructions" description="Optional. Filled into the generated commands so they can be copied as they are.">
            <div className="grid gap-4 sm:grid-cols-2">
              {needsServiceAccount && (
                <Field label="Workload service account" hint="The identity the app or proxy runs as.">
                  <input className="input" value={form.workloadServiceAccount} disabled={disabled} onChange={(e) => set('workloadServiceAccount', e.target.value)} placeholder={`my-app@${me.projectId}.iam.gserviceaccount.com`} />
                </Field>
              )}
              {needsModel && (
                <Field label="Model">
                  <input className="input" value={form.model} disabled={disabled} onChange={(e) => set('model', e.target.value)} placeholder="gemini-2.5-flash" />
                </Field>
              )}
            </div>
          </Card>
        )}

        {formError && <Alert>{formError}</Alert>}
        <ErrorAlert error={save.error} />
        <div className="flex gap-2">
          <Button onClick={submit} disabled={disabled || save.isPending} disabledReason={NO_PERMISSION}>
            {save.isPending ? 'Saving…' : isNew ? 'Register application' : 'Save changes'}
          </Button>
          <Button variant="secondary" onClick={() => navigate(isNew ? '/apps' : `/apps/${id}`)}>
            Cancel
          </Button>
        </div>
      </div>
    </>
  );
}
