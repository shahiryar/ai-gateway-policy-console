import type { ConfidenceLevel, ModelArmorTemplate, RaiFilterType } from './types';

export type Level = 'OFF' | ConfidenceLevel;

export const RAI_FILTERS: { type: RaiFilterType; label: string }[] = [
  { type: 'HATE_SPEECH', label: 'Hate speech' },
  { type: 'HARASSMENT', label: 'Harassment' },
  { type: 'SEXUALLY_EXPLICIT', label: 'Sexually explicit' },
  { type: 'DANGEROUS', label: 'Dangerous content' },
];

export const LEVELS: { value: Level; label: string }[] = [
  { value: 'OFF', label: 'Off' },
  { value: 'LOW_AND_ABOVE', label: 'Low and above (strictest)' },
  { value: 'MEDIUM_AND_ABOVE', label: 'Medium and above' },
  { value: 'HIGH', label: 'High only' },
];

export interface TemplateForm {
  rai: Record<RaiFilterType, Level>;
  piJailbreak: Level;
  maliciousUri: boolean;
  sdpMode: 'off' | 'basic' | 'advanced';
  inspectTemplate: string;
  deidentifyTemplate: string;
  enforcementType: '' | 'INSPECT_ONLY' | 'INSPECT_AND_BLOCK';
  logSanitizeOperations: boolean;
  logTemplateOperations: boolean;
  multiLanguage: boolean;
}

export function emptyForm(): TemplateForm {
  return {
    rai: { HATE_SPEECH: 'MEDIUM_AND_ABOVE', HARASSMENT: 'MEDIUM_AND_ABOVE', SEXUALLY_EXPLICIT: 'MEDIUM_AND_ABOVE', DANGEROUS: 'MEDIUM_AND_ABOVE' },
    piJailbreak: 'MEDIUM_AND_ABOVE',
    maliciousUri: true,
    sdpMode: 'basic',
    inspectTemplate: '',
    deidentifyTemplate: '',
    enforcementType: 'INSPECT_AND_BLOCK',
    logSanitizeOperations: false,
    logTemplateOperations: false,
    multiLanguage: false,
  };
}

export function fromTemplate(t: ModelArmorTemplate): TemplateForm {
  const fc = t.filterConfig ?? {};
  const md = t.templateMetadata ?? {};
  const rai = { HATE_SPEECH: 'OFF', HARASSMENT: 'OFF', SEXUALLY_EXPLICIT: 'OFF', DANGEROUS: 'OFF' } as Record<RaiFilterType, Level>;
  for (const f of fc.raiSettings?.raiFilters ?? []) {
    rai[f.filterType] = f.confidenceLevel ?? 'MEDIUM_AND_ABOVE';
  }
  const pi = fc.piAndJailbreakFilterSettings;
  const advanced = fc.sdpSettings?.advancedConfig;
  return {
    rai,
    piJailbreak: pi?.filterEnforcement === 'ENABLED' ? pi.confidenceLevel ?? 'MEDIUM_AND_ABOVE' : 'OFF',
    maliciousUri: fc.maliciousUriFilterSettings?.filterEnforcement === 'ENABLED',
    sdpMode: advanced ? 'advanced' : fc.sdpSettings?.basicConfig?.filterEnforcement === 'ENABLED' ? 'basic' : 'off',
    inspectTemplate: advanced?.inspectTemplate ?? '',
    deidentifyTemplate: advanced?.deidentifyTemplate ?? '',
    enforcementType: md.enforcementType ?? '',
    logSanitizeOperations: Boolean(md.logSanitizeOperations),
    logTemplateOperations: Boolean(md.logTemplateOperations),
    multiLanguage: Boolean(md.multiLanguageDetection?.enableMultiLanguageDetection),
  };
}

/** Builds the template body. Metadata fields the form does not manage are carried over from `existing`. */
export function toTemplate(form: TemplateForm, existing?: ModelArmorTemplate): ModelArmorTemplate {
  const raiFilters = RAI_FILTERS.filter((f) => form.rai[f.type] !== 'OFF').map((f) => ({
    filterType: f.type,
    confidenceLevel: form.rai[f.type] as ConfidenceLevel,
  }));

  const filterConfig: NonNullable<ModelArmorTemplate['filterConfig']> = {};
  if (raiFilters.length) filterConfig.raiSettings = { raiFilters };
  if (form.piJailbreak !== 'OFF') {
    filterConfig.piAndJailbreakFilterSettings = { filterEnforcement: 'ENABLED', confidenceLevel: form.piJailbreak };
  }
  if (form.maliciousUri) filterConfig.maliciousUriFilterSettings = { filterEnforcement: 'ENABLED' };
  if (form.sdpMode === 'basic') filterConfig.sdpSettings = { basicConfig: { filterEnforcement: 'ENABLED' } };
  if (form.sdpMode === 'advanced') {
    filterConfig.sdpSettings = {
      advancedConfig: {
        inspectTemplate: form.inspectTemplate,
        ...(form.deidentifyTemplate ? { deidentifyTemplate: form.deidentifyTemplate } : {}),
      },
    };
  }

  const templateMetadata: NonNullable<ModelArmorTemplate['templateMetadata']> = {
    ...(existing?.templateMetadata ?? {}),
    logSanitizeOperations: form.logSanitizeOperations,
    logTemplateOperations: form.logTemplateOperations,
    multiLanguageDetection: { enableMultiLanguageDetection: form.multiLanguage },
  };
  if (form.enforcementType) templateMetadata.enforcementType = form.enforcementType;
  else delete templateMetadata.enforcementType;

  return { filterConfig, templateMetadata };
}

export function validateForm(form: TemplateForm): string | undefined {
  if (form.sdpMode === 'advanced' && !form.inspectTemplate) {
    return 'Advanced Sensitive Data Protection needs an inspect template.';
  }
  return undefined;
}

/** Short labels describing which filters a template turns on. */
export function summarize(t: ModelArmorTemplate): string[] {
  const f = fromTemplate(t);
  const out: string[] = [];
  const rai = RAI_FILTERS.filter((r) => f.rai[r.type] !== 'OFF');
  if (rai.length) out.push(`Responsible AI (${rai.length})`);
  if (f.piJailbreak !== 'OFF') out.push('Prompt injection');
  if (f.maliciousUri) out.push('Malicious URLs');
  if (f.sdpMode === 'basic') out.push('SDP basic');
  if (f.sdpMode === 'advanced') out.push('SDP advanced');
  return out;
}
