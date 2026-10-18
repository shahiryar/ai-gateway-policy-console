import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, CodeBlock, ConfirmDialog, ErrorAlert, Field, PageHeader, Spinner, Toggle } from '../components/ui';
import { api } from '../lib/api';
import {
  DEID_METHODS,
  LIKELIHOODS,
  emptyDeidentify,
  emptyInspect,
  fromDeidentify,
  fromInspect,
  toDeidentify,
  toInspect,
  validateInspect,
  type DeidentifyForm,
  type InspectForm,
} from '../lib/dlpForm';
import { NO_PERMISSION, useSession } from '../lib/session';
import { shortId, type DlpKind, type InfoType } from '../lib/types';

function InfoTypePicker({ all, selected, onChange, disabled }: {
  all: InfoType[];
  selected: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const q = query.toLowerCase();
    return all.filter((t) => !selected.includes(t.name) && (t.name.toLowerCase().includes(q) || t.displayName?.toLowerCase().includes(q))).slice(0, 30);
  }, [all, selected, query]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {selected.length === 0 && <span className="text-xs text-slate-500">None selected.</span>}
        {selected.map((name) => (
          <span key={name} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
            {name}
            {!disabled && (
              <button type="button" aria-label={`Remove ${name}`} className="text-indigo-400 hover:text-indigo-700" onClick={() => onChange(selected.filter((s) => s !== name))}>
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <>
          <input className="input" placeholder="Search infoTypes, for example EMAIL or PASSPORT" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <div className="mt-1 max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white">
              {matches.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">No matches.</div>}
              {matches.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                  onClick={() => {
                    onChange([...selected, t.name]);
                    setQuery('');
                  }}
                >
                  <span className="font-mono text-xs">{t.name}</span>
                  {t.displayName && <span className="ml-2 text-slate-500">{t.displayName}</span>}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function DlpEditorPage() {
  const params = useParams();
  const kind: DlpKind = params.kind === 'deidentify' ? 'deidentify' : 'inspect';
  const id = params.id;
  const isNew = !id;
  const { location, can } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const existing = useQuery({ queryKey: ['dlp-template', location, kind, id], queryFn: () => api.getDlp(location, kind, id!), enabled: !isNew });
  const infoTypes = useQuery({ queryKey: ['info-types', location], queryFn: () => api.infoTypes(location), staleTime: Infinity });

  const [templateId, setTemplateId] = useState('');
  const [inspectForm, setInspectForm] = useState<InspectForm>(emptyInspect);
  const [deidForm, setDeidForm] = useState<DeidentifyForm | undefined>(emptyDeidentify);
  const [formError, setFormError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!existing.data) return;
    if (kind === 'inspect') setInspectForm(fromInspect(existing.data));
    else setDeidForm(fromDeidentify(existing.data));
  }, [existing.data, kind]);

  const canSave = can(kind === 'inspect' ? (isNew ? 'inspectCreate' : 'inspectUpdate') : isNew ? 'deidentifyCreate' : 'deidentifyUpdate');
  const disabled = !canSave || (kind === 'deidentify' && !deidForm);

  const save = useMutation({
    mutationFn: async () => {
      const body = kind === 'inspect' ? toInspect(inspectForm, existing.data) : toDeidentify(deidForm!);
      return isNew ? api.createDlp(location, kind, templateId, body) : api.updateDlp(location, kind, id!, body);
    },
    onSuccess: (t) => {
      queryClient.invalidateQueries({ queryKey: ['dlp', location, kind] });
      queryClient.invalidateQueries({ queryKey: ['dlp-template', location, kind, shortId(t.name)] });
      navigate(`/dlp?kind=${kind}`);
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteDlp(location, kind, id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dlp', location, kind] });
      navigate(`/dlp?kind=${kind}`);
    },
  });

  function submit() {
    let problem: string | undefined;
    if (isNew && !/^[a-zA-Z0-9_-]{1,100}$/.test(templateId)) problem = 'Template ID must be 1-100 letters, numbers, hyphens or underscores.';
    if (!problem && kind === 'inspect') problem = validateInspect(inspectForm);
    setFormError(problem);
    if (!problem) save.mutate();
  }

  if (!isNew && existing.isLoading) return <Spinner />;
  if (!isNew && existing.error) return <ErrorAlert error={existing.error} />;

  const kindLabel = kind === 'inspect' ? 'inspect' : 'de-identify';
  const common = kind === 'inspect' ? inspectForm : deidForm;
  const setCommon = (patch: { displayName?: string; description?: string }) =>
    kind === 'inspect' ? setInspectForm((f) => ({ ...f, ...patch })) : setDeidForm((f) => (f ? { ...f, ...patch } : f));

  return (
    <>
      <PageHeader
        title={isNew ? `New ${kindLabel} template` : existing.data?.displayName || id!}
        description={!isNew ? <code className="text-xs">{existing.data?.name}</code> : `Created in ${location}.`}
        actions={
          !isNew && (
            <Button
              variant="danger"
              onClick={() => setConfirmDelete(true)}
              disabled={!can(kind === 'inspect' ? 'inspectDelete' : 'deidentifyDelete')}
              disabledReason={NO_PERMISSION}
            >
              Delete
            </Button>
          )
        }
      />
      {!canSave && <div className="mb-4"><Alert kind="info">You can view this template, but your IAM roles do not allow changing it.</Alert></div>}

      <div className="space-y-5">
        <Card title="Details">
          <div className="grid gap-4 sm:grid-cols-2">
            {isNew && (
              <Field label="Template ID" hint="Cannot be changed later.">
                <input className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value.trim())} placeholder={kind === 'inspect' ? 'customer-pii' : 'mask-pii'} />
              </Field>
            )}
            <Field label="Display name">
              <input className="input" value={common?.displayName ?? ''} disabled={disabled} onChange={(e) => setCommon({ displayName: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description">
                <input className="input" value={common?.description ?? ''} disabled={disabled} onChange={(e) => setCommon({ description: e.target.value })} />
              </Field>
            </div>
          </div>
        </Card>

        {kind === 'inspect' && (
          <>
            <Card title="Built-in infoTypes" description="Google's detectors for common kinds of sensitive data.">
              <InfoTypePicker all={infoTypes.data ?? []} selected={inspectForm.infoTypes} disabled={disabled} onChange={(v) => setInspectForm((f) => ({ ...f, infoTypes: v }))} />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Minimum likelihood" hint="Lower values catch more, with more false positives.">
                  <select className="input" value={inspectForm.minLikelihood} disabled={disabled} onChange={(e) => setInspectForm((f) => ({ ...f, minLikelihood: e.target.value }))}>
                    {LIKELIHOODS.map((l) => (
                      <option key={l} value={l}>
                        {l.replace('_', ' ').toLowerCase()}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="pt-6">
                  <Toggle label="Include quotes in findings" description="Findings contain the matched text. Leave off for logs that should not hold sensitive data." checked={inspectForm.includeQuote} disabled={disabled} onChange={(v) => setInspectForm((f) => ({ ...f, includeQuote: v }))} />
                </div>
              </div>
            </Card>

            <Card title="Custom patterns" description="Organization-specific identifiers, such as employee or account numbers, as regular expressions.">
              <div className="space-y-2">
                {inspectForm.regexes.map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <input className="input w-56" placeholder="EMPLOYEE_ID" value={r.name} disabled={disabled} onChange={(e) => setInspectForm((f) => ({ ...f, regexes: f.regexes.map((x, j) => (j === i ? { ...x, name: e.target.value.toUpperCase() } : x)) }))} />
                    <input className="input font-mono" placeholder="E-\d{6}" value={r.pattern} disabled={disabled} onChange={(e) => setInspectForm((f) => ({ ...f, regexes: f.regexes.map((x, j) => (j === i ? { ...x, pattern: e.target.value } : x)) }))} />
                    {!disabled && <Button variant="ghost" onClick={() => setInspectForm((f) => ({ ...f, regexes: f.regexes.filter((_, j) => j !== i) }))}>Remove</Button>}
                  </div>
                ))}
                {!disabled && <Button variant="secondary" onClick={() => setInspectForm((f) => ({ ...f, regexes: [...f.regexes, { name: '', pattern: '' }] }))}>Add pattern</Button>}
              </div>
            </Card>

            <Card title="Word lists" description="Exact words or phrases to treat as sensitive, such as project code names.">
              <div className="space-y-2">
                {inspectForm.dictionaries.map((d, i) => (
                  <div key={i} className="flex gap-2">
                    <input className="input w-56" placeholder="CODENAMES" value={d.name} disabled={disabled} onChange={(e) => setInspectForm((f) => ({ ...f, dictionaries: f.dictionaries.map((x, j) => (j === i ? { ...x, name: e.target.value.toUpperCase() } : x)) }))} />
                    <input className="input" placeholder="falcon, osprey, kestrel" value={d.words} disabled={disabled} onChange={(e) => setInspectForm((f) => ({ ...f, dictionaries: f.dictionaries.map((x, j) => (j === i ? { ...x, words: e.target.value } : x)) }))} />
                    {!disabled && <Button variant="ghost" onClick={() => setInspectForm((f) => ({ ...f, dictionaries: f.dictionaries.filter((_, j) => j !== i) }))}>Remove</Button>}
                  </div>
                ))}
                {!disabled && <Button variant="secondary" onClick={() => setInspectForm((f) => ({ ...f, dictionaries: [...f.dictionaries, { name: '', words: '' }] }))}>Add word list</Button>}
              </div>
            </Card>
          </>
        )}

        {kind === 'deidentify' && !deidForm && existing.data && (
          <Card title="Transformation">
            <Alert kind="info">This template uses a structure the console cannot edit yet. Edit it in the Google Cloud console; its configuration is shown below.</Alert>
            <CodeBlock language="json" code={JSON.stringify(existing.data.deidentifyConfig, null, 2)} />
          </Card>
        )}

        {kind === 'deidentify' && deidForm && (
          <Card title="Transformation" description="What happens to each finding.">
            <div className="space-y-3">
              {DEID_METHODS.map((m) => (
                <label key={m.value} className="flex items-start gap-3">
                  <input type="radio" className="mt-1" name="method" checked={deidForm.method === m.value} disabled={disabled} onChange={() => setDeidForm({ ...deidForm, method: m.value })} />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">{m.label}</span>
                    <span className="block text-xs text-slate-500">{m.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {deidForm.method === 'mask' && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Masking character">
                  <input className="input w-24" maxLength={1} value={deidForm.maskingCharacter} disabled={disabled} onChange={(e) => setDeidForm({ ...deidForm, maskingCharacter: e.target.value })} />
                </Field>
                <Field label="Characters to mask" hint="0 masks the whole value.">
                  <input type="number" min={0} className="input w-32" value={deidForm.numberToMask} disabled={disabled} onChange={(e) => setDeidForm({ ...deidForm, numberToMask: Number(e.target.value) })} />
                </Field>
              </div>
            )}
            {deidForm.method === 'replace' && (
              <div className="mt-4 max-w-sm">
                <Field label="Replacement text">
                  <input className="input" value={deidForm.replaceValue} disabled={disabled} onChange={(e) => setDeidForm({ ...deidForm, replaceValue: e.target.value })} />
                </Field>
              </div>
            )}
            <div className="mt-5">
              <Field group label="Apply only to these infoTypes" hint="Leave empty to transform every finding.">
                <InfoTypePicker all={infoTypes.data ?? []} selected={deidForm.infoTypes} disabled={disabled} onChange={(v) => setDeidForm({ ...deidForm, infoTypes: v })} />
              </Field>
            </div>
          </Card>
        )}

        {formError && <Alert>{formError}</Alert>}
        <ErrorAlert error={save.error} />
        <div className="flex gap-2">
          <Button onClick={submit} disabled={disabled || save.isPending} disabledReason={NO_PERMISSION}>
            {save.isPending ? 'Saving…' : isNew ? 'Create template' : 'Save changes'}
          </Button>
          <Button variant="secondary" onClick={() => navigate(`/dlp?kind=${kind}`)}>
            Cancel
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${id}?`}
        busy={remove.isPending}
        confirmLabel="Delete"
        body={
          <>
            <p>Model Armor templates that use this in Advanced mode will fail their sensitive data check. This cannot be undone.</p>
            {remove.error && (
              <div className="mt-3">
                <ErrorAlert error={remove.error} />
              </div>
            )}
          </>
        }
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
