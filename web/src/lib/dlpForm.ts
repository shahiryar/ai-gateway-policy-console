import type { DeidentifyTemplate, InspectTemplate } from './types';

export const LIKELIHOODS = ['VERY_UNLIKELY', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'VERY_LIKELY'] as const;

export interface InspectForm {
  displayName: string;
  description: string;
  infoTypes: string[];
  minLikelihood: string;
  includeQuote: boolean;
  regexes: { name: string; pattern: string }[];
  dictionaries: { name: string; words: string }[];
}

export function emptyInspect(): InspectForm {
  return {
    displayName: '',
    description: '',
    infoTypes: ['EMAIL_ADDRESS', 'PHONE_NUMBER', 'CREDIT_CARD_NUMBER'],
    minLikelihood: 'POSSIBLE',
    includeQuote: false,
    regexes: [],
    dictionaries: [],
  };
}

export function fromInspect(t: InspectTemplate): InspectForm {
  const c = t.inspectConfig ?? {};
  const custom = c.customInfoTypes ?? [];
  return {
    displayName: t.displayName ?? '',
    description: t.description ?? '',
    infoTypes: (c.infoTypes ?? []).map((i) => i.name),
    minLikelihood: c.minLikelihood ?? 'POSSIBLE',
    includeQuote: Boolean(c.includeQuote),
    regexes: custom.filter((x) => x.regex).map((x) => ({ name: x.infoType.name, pattern: x.regex!.pattern })),
    dictionaries: custom
      .filter((x) => x.dictionary)
      .map((x) => ({ name: x.infoType.name, words: x.dictionary!.wordList.words.join(', ') })),
  };
}

/** Builds the template body. inspectConfig fields the form does not manage are carried over from `existing`. */
export function toInspect(form: InspectForm, existing?: InspectTemplate): InspectTemplate {
  const customInfoTypes = [
    ...form.regexes.filter((r) => r.name && r.pattern).map((r) => ({ infoType: { name: r.name }, regex: { pattern: r.pattern } })),
    ...form.dictionaries
      .filter((d) => d.name && d.words.trim())
      .map((d) => ({
        infoType: { name: d.name },
        dictionary: { wordList: { words: d.words.split(',').map((w) => w.trim()).filter(Boolean) } },
      })),
  ];
  return {
    displayName: form.displayName,
    description: form.description,
    inspectConfig: {
      ...(existing?.inspectConfig ?? {}),
      infoTypes: form.infoTypes.map((name) => ({ name })),
      minLikelihood: form.minLikelihood,
      includeQuote: form.includeQuote,
      customInfoTypes,
    },
  };
}

export function validateInspect(form: InspectForm): string | undefined {
  if (!form.infoTypes.length && !form.regexes.length && !form.dictionaries.length) {
    return 'Pick at least one infoType or add a custom one.';
  }
  const badName = [...form.regexes, ...form.dictionaries].find((c) => c.name && !/^[A-Z0-9_]{1,64}$/.test(c.name));
  if (badName) return `Custom infoType names use capital letters, digits and underscores (${badName.name}).`;
  for (const r of form.regexes) {
    try {
      new RegExp(r.pattern);
    } catch {
      return `The pattern for ${r.name || 'a custom regex'} is not a valid regular expression.`;
    }
  }
  return undefined;
}

export type DeidMethod = 'infoType' | 'mask' | 'replace' | 'redact';

export interface DeidentifyForm {
  displayName: string;
  description: string;
  method: DeidMethod;
  maskingCharacter: string;
  numberToMask: number;
  replaceValue: string;
  infoTypes: string[];
}

export const DEID_METHODS: { value: DeidMethod; label: string; hint: string }[] = [
  { value: 'infoType', label: 'Replace with infoType', hint: 'jane@example.com becomes [EMAIL_ADDRESS]' },
  { value: 'mask', label: 'Mask characters', hint: 'jane@example.com becomes ****************' },
  { value: 'replace', label: 'Replace with a fixed value', hint: 'Every finding becomes the text you choose' },
  { value: 'redact', label: 'Remove', hint: 'Findings are deleted from the text' },
];

export function emptyDeidentify(): DeidentifyForm {
  return {
    displayName: '',
    description: '',
    method: 'infoType',
    maskingCharacter: '*',
    numberToMask: 0,
    replaceValue: '[REDACTED]',
    infoTypes: [],
  };
}

type Transformation = {
  infoTypes?: { name: string }[];
  primitiveTransformation?: {
    replaceWithInfoTypeConfig?: object;
    characterMaskConfig?: { maskingCharacter?: string; numberToMask?: number };
    replaceConfig?: { newValue?: { stringValue?: string } };
    redactConfig?: object;
  };
};

/** Returns undefined when the template uses a structure this form cannot represent. */
export function fromDeidentify(t: DeidentifyTemplate): DeidentifyForm | undefined {
  const config = t.deidentifyConfig as { infoTypeTransformations?: { transformations?: Transformation[] } } | undefined;
  const keys = Object.keys(t.deidentifyConfig ?? {});
  const transformations = config?.infoTypeTransformations?.transformations ?? [];
  if (keys.length > 1 || (keys.length === 1 && keys[0] !== 'infoTypeTransformations') || transformations.length > 1) {
    return undefined;
  }
  const base = { ...emptyDeidentify(), displayName: t.displayName ?? '', description: t.description ?? '' };
  const tr = transformations[0];
  if (!tr) return base;
  const p = tr.primitiveTransformation ?? {};
  const infoTypes = (tr.infoTypes ?? []).map((i) => i.name);
  if (p.replaceWithInfoTypeConfig) return { ...base, infoTypes, method: 'infoType' };
  if (p.characterMaskConfig) {
    return {
      ...base,
      infoTypes,
      method: 'mask',
      maskingCharacter: p.characterMaskConfig.maskingCharacter ?? '*',
      numberToMask: p.characterMaskConfig.numberToMask ?? 0,
    };
  }
  if (p.replaceConfig) {
    return { ...base, infoTypes, method: 'replace', replaceValue: p.replaceConfig.newValue?.stringValue ?? '' };
  }
  if (p.redactConfig) return { ...base, infoTypes, method: 'redact' };
  return undefined;
}

export function toDeidentify(form: DeidentifyForm): DeidentifyTemplate {
  const primitive =
    form.method === 'infoType'
      ? { replaceWithInfoTypeConfig: {} }
      : form.method === 'mask'
        ? { characterMaskConfig: { maskingCharacter: form.maskingCharacter || '*', numberToMask: form.numberToMask || 0 } }
        : form.method === 'replace'
          ? { replaceConfig: { newValue: { stringValue: form.replaceValue } } }
          : { redactConfig: {} };
  return {
    displayName: form.displayName,
    description: form.description,
    deidentifyConfig: {
      infoTypeTransformations: {
        transformations: [
          {
            ...(form.infoTypes.length ? { infoTypes: form.infoTypes.map((name) => ({ name })) } : {}),
            primitiveTransformation: primitive,
          },
        ],
      },
    },
  };
}
