import { describe, expect, it } from 'vitest';
import { emptyDeidentify, emptyInspect, fromDeidentify, fromInspect, toDeidentify, toInspect, validateInspect } from './dlpForm';

describe('inspect form', () => {
  it('round-trips custom infoTypes', () => {
    const form = {
      ...emptyInspect(),
      displayName: 'Ids',
      regexes: [{ name: 'EMPLOYEE_ID', pattern: 'E-\\d{6}' }],
      dictionaries: [{ name: 'CODENAMES', words: 'falcon, osprey' }],
    };
    const back = fromInspect(toInspect(form));
    expect(back.regexes).toEqual(form.regexes);
    expect(back.dictionaries).toEqual([{ name: 'CODENAMES', words: 'falcon, osprey' }]);
    expect(back.displayName).toBe('Ids');
  });

  it('rejects bad custom names and patterns', () => {
    expect(validateInspect({ ...emptyInspect(), regexes: [{ name: 'lower', pattern: 'x' }] })).toMatch(/capital/);
    expect(validateInspect({ ...emptyInspect(), regexes: [{ name: 'OK', pattern: '(' }] })).toMatch(/not a valid/);
    expect(validateInspect({ ...emptyInspect(), infoTypes: [] })).toMatch(/at least one/);
  });
});

describe('deidentify form', () => {
  it('round-trips each method', () => {
    for (const method of ['infoType', 'mask', 'replace', 'redact'] as const) {
      const form = { ...emptyDeidentify(), method, infoTypes: ['EMAIL_ADDRESS'] };
      expect(fromDeidentify(toDeidentify(form))).toEqual(form);
    }
  });

  it('declines structures it cannot edit', () => {
    expect(fromDeidentify({ deidentifyConfig: { recordTransformations: {} } })).toBeUndefined();
  });
});
