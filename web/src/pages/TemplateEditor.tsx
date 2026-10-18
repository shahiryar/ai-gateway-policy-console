import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, ConfirmDialog, ErrorAlert, Field, LinkButton, PageHeader, Spinner, Toggle, formatDate } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { NO_PERMISSION, useSession } from '../lib/session';
import { LEVELS, RAI_FILTERS, emptyForm, fromTemplate, toTemplate, validateForm, type Level, type TemplateForm } from '../lib/templateForm';
import { shortId } from '../lib/types';

function LevelSelect({ value, onChange, disabled, id }: { value: Level; onChange: (v: Level) => void; disabled?: boolean; id?: string }) {
  return (
    <select id={id} className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as Level)}>
      {LEVELS.map((l) => (
        <option key={l.value} value={l.value}>
          {l.label}
        </option>
      ))}
    </select>
  );
}

export function TemplateEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const { location, can, me } = useSession();
  const [search] = useSearchParams();
  const copyFrom = isNew ? search.get('from') ?? undefined : undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const existing = useQuery({ queryKey: ['template', location, id], queryFn: () => api.getTemplate(location, id!), enabled: !isNew });
  const source = useQuery({ queryKey: ['template', location, copyFrom], queryFn: () => api.getTemplate(location, copyFrom!), enabled: Boolean(copyFrom) });
  const inspect = useQuery({ queryKey: ['dlp', location, 'inspect'], queryFn: () => api.listDlp(location, 'inspect'), enabled: can('inspectList') });
  const deid = useQuery({ queryKey: ['dlp', location, 'deidentify'], queryFn: () => api.listDlp(location, 'deidentify'), enabled: can('deidentifyList') });

  const [templateId, setTemplateId] = useState('');
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [formError, setFormError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBlockers, setDeleteBlockers] = useState<string[]>();

  useEffect(() => {
    if (existing.data) setForm(fromTemplate(existing.data));
  }, [existing.data]);

  useEffect(() => {
    if (source.data) {
      setForm(fromTemplate(source.data));
      setTemplateId(`${copyFrom}-copy`);
    }
  }, [source.data, copyFrom]);

  const canSave = isNew ? can('templatesCreate') : can('templatesUpdate');
  const set = <K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const body = toTemplate(form, existing.data ?? source.data);
      return isNew ? api.createTemplate(location, templateId, body) : api.updateTemplate(location, id!, body);
    },
    onSuccess: (t) => {
      queryClient.invalidateQueries({ queryKey: ['templates', location] });
      queryClient.setQueryData(['template', location, shortId(t.name)], t);
      navigate(`/templates/${shortId(t.name)}`);
    },
  });

  const remove = useMutation({
    mutationFn: (force: boolean) => api.deleteTemplate(location, id!, force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', location] });
      navigate('/templates');
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        const apps = (err.body?.applications as { name: string }[] | undefined) ?? [];
        setDeleteBlockers(apps.map((a) => a.name));
      }
    },
  });

  function submit() {
    const problem = validateForm(form) ?? (isNew && !/^[a-zA-Z0-9_-]{1,63}$/.test(templateId) ? 'Template ID must be 1-63 letters, numbers, hyphens or underscores.' : undefined);
    setFormError(problem);
    if (!problem) save.mutate();
  }

  if (!isNew && existing.isLoading) return <Spinner />;
  if (!isNew && existing.error) return <ErrorAlert error={existing.error} />;

  const disabled = !canSave;
  const fullName = `projects/${me.projectId}/locations/${location}/templates/${isNew ? templateId || '…' : id}`;

  return (
    <>
      <PageHeader
        title={isNew ? (copyFrom ? `Copy of ${copyFrom}` : 'New Model Armor template') : id!}
        description={
          isNew ? (
            `Created in ${location}. Applications in other regions need their own template.`
          ) : (
            <span>
              <code className="text-xs">{fullName}</code>
              {existing.data?.updateTime && <span className="ml-2 text-slate-400">Updated {formatDate(existing.data.updateTime)}</span>}
            </span>
          )
        }
        actions={
          !isNew && (
            <>
              <Link to={`/playground?template=${id}`} className="self-center text-sm text-indigo-700 hover:underline">
                Test in playground
              </Link>
              <LinkButton variant="secondary" to={`/templates/new?from=${id}`} disabled={!can('templatesCreate')} disabledReason={NO_PERMISSION}>
                Duplicate
              </LinkButton>
              <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={!can('templatesDelete')} disabledReason={NO_PERMISSION}>
                Delete
              </Button>
            </>
          )
        }
      />

      {disabled && <div className="mb-4"><Alert kind="info">You can view this template, but your IAM roles do not allow changing it.</Alert></div>}

      <div className="space-y-5">
        {isNew && (
          <Card title="Template ID">
            <Field label="ID" hint="Letters, numbers, hyphens and underscores. It cannot be changed later." htmlFor="template-id">
              <input id="template-id" className="input max-w-sm" value={templateId} onChange={(e) => setTemplateId(e.target.value.trim())} placeholder="support-bot-strict" />
            </Field>
          </Card>
        )}

        <Card title="Responsible AI" description="Blocks content by category. A lower threshold catches more, including borderline content.">
          <div className="grid gap-4 sm:grid-cols-2">
            {RAI_FILTERS.map((f) => (
              <Field key={f.type} label={f.label} htmlFor={`rai-${f.type}`}>
                <LevelSelect id={`rai-${f.type}`} value={form.rai[f.type]} disabled={disabled} onChange={(v) => set('rai', { ...form.rai, [f.type]: v })} />
              </Field>
            ))}
          </div>
          <p className="hint mt-3">Child sexual abuse material is always screened and cannot be turned off.</p>
        </Card>

        <Card title="Prompt injection and jailbreak" description="Detects attempts to override the model's instructions or safety rules.">
          <div className="max-w-sm">
            <LevelSelect value={form.piJailbreak} disabled={disabled} onChange={(v) => set('piJailbreak', v)} />
          </div>
        </Card>

        <Card title="Malicious URLs" description="Flags links to known malware, phishing and unwanted software sites.">
          <Toggle label="Screen URLs" checked={form.maliciousUri} disabled={disabled} onChange={(v) => set('maliciousUri', v)} />
        </Card>

        <Card title="Sensitive Data Protection" description="Finds sensitive data such as card numbers, credentials and personal details.">
          <div className="space-y-3">
            {(
              [
                ['off', 'Off', 'Sensitive data is not screened.'],
                ['basic', 'Basic', 'A fixed set of common sensitive infoTypes, with no setup.'],
                ['advanced', 'Advanced', 'Your own DLP inspect template, plus an optional de-identify template to mask findings.'],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className="flex items-start gap-3">
                <input type="radio" className="mt-1" name="sdp" checked={form.sdpMode === value} disabled={disabled} onChange={() => set('sdpMode', value)} />
                <span>
                  <span className="block text-sm font-medium text-slate-800">{label}</span>
                  <span className="block text-xs text-slate-500">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          {form.sdpMode === 'advanced' && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Inspect template" hint={<Link className="underline" to="/dlp/inspect/new">Create an inspect template</Link>}>
                <select className="input" value={form.inspectTemplate} disabled={disabled} onChange={(e) => set('inspectTemplate', e.target.value)}>
                  <option value="">Choose…</option>
                  {(inspect.data ?? []).map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.displayName || shortId(t.name)}
                    </option>
                  ))}
                  {form.inspectTemplate && !inspect.data?.some((t) => t.name === form.inspectTemplate) && (
                    <option value={form.inspectTemplate}>{form.inspectTemplate}</option>
                  )}
                </select>
              </Field>
              <Field label="De-identify template (optional)" hint="Returns a masked copy of the text alongside the findings.">
                <select className="input" value={form.deidentifyTemplate} disabled={disabled} onChange={(e) => set('deidentifyTemplate', e.target.value)}>
                  <option value="">None</option>
                  {(deid.data ?? []).map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.displayName || shortId(t.name)}
                    </option>
                  ))}
                  {form.deidentifyTemplate && !deid.data?.some((t) => t.name === form.deidentifyTemplate) && (
                    <option value={form.deidentifyTemplate}>{form.deidentifyTemplate}</option>
                  )}
                </select>
              </Field>
              <p className="hint sm:col-span-2">DLP templates must be in the same region as this template ({location}).</p>
            </div>
          )}
        </Card>

        <Card title="Behavior and logging">
          <div className="space-y-4">
            <Field label="Enforcement" hint="Used by integrations such as Vertex AI and service extensions. Inspect only logs violations without blocking.">
              <select className="input max-w-sm" value={form.enforcementType} disabled={disabled} onChange={(e) => set('enforcementType', e.target.value as TemplateForm['enforcementType'])}>
                <option value="INSPECT_AND_BLOCK">Inspect and block</option>
                <option value="INSPECT_ONLY">Inspect only</option>
                <option value="">Service default</option>
              </select>
            </Field>
            <Toggle label="Log sanitize operations" description="Writes each screening result to Cloud Logging." checked={form.logSanitizeOperations} disabled={disabled} onChange={(v) => set('logSanitizeOperations', v)} />
            <Toggle label="Log template operations" description="Writes template changes to Cloud Logging." checked={form.logTemplateOperations} disabled={disabled} onChange={(v) => set('logTemplateOperations', v)} />
            <Toggle label="Multi-language detection" description="Screens prompts and responses in languages other than English." checked={form.multiLanguage} disabled={disabled} onChange={(v) => set('multiLanguage', v)} />
          </div>
        </Card>

        {formError && <Alert>{formError}</Alert>}
        <ErrorAlert error={save.error} />

        <div className="flex gap-2">
          <Button onClick={submit} disabled={disabled || save.isPending} disabledReason={NO_PERMISSION}>
            {save.isPending ? 'Saving…' : isNew ? 'Create template' : 'Save changes'}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/templates')}>
            Cancel
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${id}?`}
        busy={remove.isPending}
        confirmLabel={deleteBlockers ? 'Delete anyway' : 'Delete'}
        body={
          <>
            {deleteBlockers ? (
              <p>
                This template is assigned to {deleteBlockers.join(', ')}. Those applications will stop being protected wherever they reference it.
              </p>
            ) : (
              <p>Anything that references this template by name will start failing. This cannot be undone.</p>
            )}
            {remove.error && !(remove.error instanceof ApiError && remove.error.status === 409) && (
              <div className="mt-3">
                <ErrorAlert error={remove.error} />
              </div>
            )}
          </>
        }
        onCancel={() => {
          setConfirmDelete(false);
          setDeleteBlockers(undefined);
        }}
        onConfirm={() => remove.mutate(Boolean(deleteBlockers))}
      />
    </>
  );
}
