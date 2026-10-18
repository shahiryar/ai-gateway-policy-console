import { describe, expect, it } from 'vitest';
import { emptyForm, fromTemplate, summarize, toTemplate, validateForm } from './templateForm';
import type { ModelArmorTemplate } from './types';

describe('templateForm', () => {
  it('round-trips a template through the form', () => {
    const template: ModelArmorTemplate = {
      filterConfig: {
        raiSettings: { raiFilters: [{ filterType: 'DANGEROUS', confidenceLevel: 'HIGH' }] },
        piAndJailbreakFilterSettings: { filterEnforcement: 'ENABLED', confidenceLevel: 'LOW_AND_ABOVE' },
        sdpSettings: { advancedConfig: { inspectTemplate: 'projects/p/locations/l/inspectTemplates/i' } },
      },
      templateMetadata: { enforcementType: 'INSPECT_ONLY', customPromptSafetyErrorCode: 451 },
    };
    const back = toTemplate(fromTemplate(template), template);
    expect(back.filterConfig).toEqual(template.filterConfig);
    expect(back.templateMetadata?.enforcementType).toBe('INSPECT_ONLY');
    // Metadata the form does not manage is preserved.
    expect(back.templateMetadata?.customPromptSafetyErrorCode).toBe(451);
  });

  it('omits filters that are off', () => {
    const form = { ...emptyForm(), piJailbreak: 'OFF' as const, maliciousUri: false, sdpMode: 'off' as const };
    form.rai = { HATE_SPEECH: 'OFF', HARASSMENT: 'OFF', SEXUALLY_EXPLICIT: 'OFF', DANGEROUS: 'OFF' };
    expect(toTemplate(form).filterConfig).toEqual({});
  });

  it('requires an inspect template in advanced mode', () => {
    expect(validateForm({ ...emptyForm(), sdpMode: 'advanced' })).toMatch(/inspect template/);
    expect(validateForm(emptyForm())).toBeUndefined();
  });

  it('summarizes enabled filters', () => {
    expect(summarize(toTemplate(emptyForm()))).toEqual(['Responsible AI (4)', 'Prompt injection', 'Malicious URLs', 'SDP basic']);
  });
});
