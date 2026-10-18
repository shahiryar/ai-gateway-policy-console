import {
  CallContext,
  DlpKind,
  DlpTemplate,
  GoogleApiError,
  InfoTypeDescription,
  InspectTemplate,
  ModelArmorTemplate,
  PolicyApis,
  SanitizeResponse,
  dlpTemplateName,
  templateName,
} from './types.js';

/**
 * In-memory stand-in for Model Armor and DLP, used for local demos and end-to-end tests
 * (GOOGLE_API_MODE=mock). Sanitize results use simple pattern rules, not Google's classifiers.
 */

const INFO_TYPES: InfoTypeDescription[] = [
  { name: 'EMAIL_ADDRESS', displayName: 'Email address' },
  { name: 'PHONE_NUMBER', displayName: 'Phone number' },
  { name: 'CREDIT_CARD_NUMBER', displayName: 'Credit card number' },
  { name: 'US_SOCIAL_SECURITY_NUMBER', displayName: 'US Social Security number' },
  { name: 'IBAN_CODE', displayName: 'IBAN code' },
  { name: 'IP_ADDRESS', displayName: 'IP address' },
  { name: 'PERSON_NAME', displayName: 'Person name' },
  { name: 'GCP_API_KEY', displayName: 'Google Cloud API key' },
  { name: 'PASSPORT', displayName: 'Passport number' },
  { name: 'STREET_ADDRESS', displayName: 'Street address' },
];

const DETECTORS: Record<string, RegExp> = {
  EMAIL_ADDRESS: /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  US_SOCIAL_SECURITY_NUMBER: /\b\d{3}-\d{2}-\d{4}\b/g,
  CREDIT_CARD_NUMBER: /\b(?:\d[ -]?){13,16}\b/g,
  PHONE_NUMBER: /\+?\d{1,3}[ .-]?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g,
  IP_ADDRESS: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  GCP_API_KEY: /\bAIza[0-9A-Za-z_-]{35}\b/g,
};

const BASIC_SDP_TYPES = ['EMAIL_ADDRESS', 'US_SOCIAL_SECURITY_NUMBER', 'CREDIT_CARD_NUMBER', 'GCP_API_KEY'];

const RAI_WORDS: Record<string, RegExp> = {
  dangerous: /\b(bomb|explosive|weapon|poison)\b/i,
  harassment: /\b(idiot|stupid|loser)\b/i,
  hate_speech: /\b(hate all)\b/i,
  sexually_explicit: /\b(explicit sexual)\b/i,
};

const PI_PATTERN = /(ignore (all |any )?(previous|prior|above) instructions|disregard (your|the) (rules|instructions)|you are now (in )?developer mode|jailbreak)/i;
const URI_PATTERN = /https?:\/\/[^\s]*(malware|phish|testsafebrowsing)[^\s]*/gi;

function now(): string {
  return new Date().toISOString();
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function applyMask<T extends object>(existing: T, update: T, mask: string[]): T {
  const out = clone(existing) as Record<string, unknown>;
  for (const field of mask) {
    out[field] = (update as Record<string, unknown>)[field];
  }
  return out as T;
}

export class MockPolicyApis implements PolicyApis {
  private templates = new Map<string, ModelArmorTemplate>();
  private dlp = new Map<string, DlpTemplate>();

  constructor(projectId: string, seedLocation: string) {
    const created = now();
    const baseline: ModelArmorTemplate = {
      name: templateName(projectId, seedLocation, 'baseline-safety'),
      createTime: created,
      updateTime: created,
      filterConfig: {
        raiSettings: {
          raiFilters: [
            { filterType: 'DANGEROUS', confidenceLevel: 'MEDIUM_AND_ABOVE' },
            { filterType: 'HARASSMENT', confidenceLevel: 'MEDIUM_AND_ABOVE' },
            { filterType: 'HATE_SPEECH', confidenceLevel: 'MEDIUM_AND_ABOVE' },
            { filterType: 'SEXUALLY_EXPLICIT', confidenceLevel: 'MEDIUM_AND_ABOVE' },
          ],
        },
        piAndJailbreakFilterSettings: { filterEnforcement: 'ENABLED', confidenceLevel: 'MEDIUM_AND_ABOVE' },
        maliciousUriFilterSettings: { filterEnforcement: 'ENABLED' },
        sdpSettings: { basicConfig: { filterEnforcement: 'ENABLED' } },
      },
      templateMetadata: { enforcementType: 'INSPECT_AND_BLOCK', logSanitizeOperations: true },
    };
    this.templates.set(`${seedLocation}/baseline-safety`, baseline);

    const inspect: InspectTemplate = {
      name: dlpTemplateName(projectId, seedLocation, 'inspect', 'pii-basic'),
      displayName: 'Basic PII',
      description: 'Emails, phone numbers, card numbers and SSNs',
      createTime: created,
      updateTime: created,
      inspectConfig: {
        infoTypes: [
          { name: 'EMAIL_ADDRESS' },
          { name: 'PHONE_NUMBER' },
          { name: 'CREDIT_CARD_NUMBER' },
          { name: 'US_SOCIAL_SECURITY_NUMBER' },
        ],
        minLikelihood: 'POSSIBLE',
      },
    };
    this.dlp.set(`inspect/${seedLocation}/pii-basic`, inspect);
    this.dlp.set(`deidentify/${seedLocation}/replace-with-type`, {
      name: dlpTemplateName(projectId, seedLocation, 'deidentify', 'replace-with-type'),
      displayName: 'Replace with infoType',
      description: 'Replaces each finding with its infoType name',
      createTime: created,
      updateTime: created,
      deidentifyConfig: {
        infoTypeTransformations: { transformations: [{ primitiveTransformation: { replaceWithInfoTypeConfig: {} } }] },
      },
    });
  }

  private requireTemplate(location: string, id: string): ModelArmorTemplate {
    const t = this.templates.get(`${location}/${id}`);
    if (!t) throw new GoogleApiError(404, `Template ${id} not found in ${location}`, 'NOT_FOUND');
    return t;
  }

  async listTemplates(_ctx: CallContext, location: string): Promise<ModelArmorTemplate[]> {
    return [...this.templates.entries()].filter(([k]) => k.startsWith(`${location}/`)).map(([, v]) => clone(v));
  }

  async getTemplate(_ctx: CallContext, location: string, id: string): Promise<ModelArmorTemplate> {
    return clone(this.requireTemplate(location, id));
  }

  async createTemplate(ctx: CallContext, location: string, id: string, body: ModelArmorTemplate): Promise<ModelArmorTemplate> {
    const key = `${location}/${id}`;
    if (this.templates.has(key)) throw new GoogleApiError(409, `Template ${id} already exists`, 'ALREADY_EXISTS');
    const t = { ...clone(body), name: templateName(ctx.projectId, location, id), createTime: now(), updateTime: now() };
    this.templates.set(key, t);
    return clone(t);
  }

  async updateTemplate(
    _ctx: CallContext,
    location: string,
    id: string,
    body: ModelArmorTemplate,
    updateMask: string[],
  ): Promise<ModelArmorTemplate> {
    const existing = this.requireTemplate(location, id);
    const t = { ...applyMask(existing, body, updateMask), updateTime: now() };
    this.templates.set(`${location}/${id}`, t);
    return clone(t);
  }

  async deleteTemplate(_ctx: CallContext, location: string, id: string): Promise<void> {
    this.requireTemplate(location, id);
    this.templates.delete(`${location}/${id}`);
  }

  async sanitize(
    _ctx: CallContext,
    location: string,
    id: string,
    input: { kind: 'prompt' | 'response'; text: string },
  ): Promise<SanitizeResponse> {
    const t = this.requireTemplate(location, id);
    const fc = t.filterConfig ?? {};
    const filterResults: Record<string, Record<string, unknown>> = {};
    let anyMatch = false;
    const state = (m: boolean) => (m ? 'MATCH_FOUND' : 'NO_MATCH_FOUND');

    const raiFilters = fc.raiSettings?.raiFilters ?? [];
    if (raiFilters.length) {
      const typeResults: Record<string, unknown> = {};
      let raiMatch = false;
      for (const f of raiFilters) {
        const key = f.filterType.toLowerCase();
        const m = RAI_WORDS[key]?.test(input.text) ?? false;
        raiMatch ||= m;
        typeResults[key] = { matchState: state(m), ...(m ? { confidenceLevel: 'HIGH' } : {}) };
      }
      anyMatch ||= raiMatch;
      filterResults.rai = {
        raiFilterResult: { executionState: 'EXECUTION_SUCCESS', matchState: state(raiMatch), raiFilterTypeResults: typeResults },
      };
    }

    if (fc.piAndJailbreakFilterSettings?.filterEnforcement === 'ENABLED') {
      const m = PI_PATTERN.test(input.text);
      anyMatch ||= m;
      filterResults.pi_and_jailbreak = {
        piAndJailbreakFilterResult: {
          executionState: 'EXECUTION_SUCCESS',
          matchState: state(m),
          ...(m ? { confidenceLevel: 'HIGH' } : {}),
        },
      };
    }

    if (fc.maliciousUriFilterSettings?.filterEnforcement === 'ENABLED') {
      const uris = input.text.match(URI_PATTERN) ?? [];
      anyMatch ||= uris.length > 0;
      filterResults.malicious_uris = {
        maliciousUriFilterResult: {
          executionState: 'EXECUTION_SUCCESS',
          matchState: state(uris.length > 0),
          maliciousUriMatchedItems: uris.map((uri) => ({ uri })),
        },
      };
    }

    const sdp = fc.sdpSettings;
    if (sdp?.basicConfig?.filterEnforcement === 'ENABLED' || sdp?.advancedConfig?.inspectTemplate) {
      let types = BASIC_SDP_TYPES;
      if (sdp.advancedConfig?.inspectTemplate) {
        const inspect = this.findDlpByName(sdp.advancedConfig.inspectTemplate) as InspectTemplate | undefined;
        types = inspect?.inspectConfig?.infoTypes?.map((i) => i.name) ?? BASIC_SDP_TYPES;
      }
      const findings: { infoType: string; likelihood: string; quote: string }[] = [];
      let redacted = input.text;
      for (const type of types) {
        const re = DETECTORS[type];
        if (!re) continue;
        for (const match of input.text.match(re) ?? []) {
          findings.push({ infoType: type, likelihood: 'LIKELY', quote: match });
          redacted = redacted.split(match).join(`[${type}]`);
        }
      }
      const m = findings.length > 0;
      anyMatch ||= m;
      const sdpFilterResult: Record<string, unknown> = {
        inspectResult: {
          executionState: 'EXECUTION_SUCCESS',
          matchState: state(m),
          findings: findings.map(({ infoType, likelihood }) => ({ infoType, likelihood })),
        },
      };
      if (sdp.advancedConfig?.deidentifyTemplate) {
        sdpFilterResult.deidentifyResult = {
          executionState: 'EXECUTION_SUCCESS',
          matchState: state(m),
          data: { text: redacted },
          infoTypes: [...new Set(findings.map((f) => f.infoType))],
        };
      }
      filterResults.sdp = { sdpFilterResult };
    }

    filterResults.csam = { csamFilterFilterResult: { executionState: 'EXECUTION_SUCCESS', matchState: 'NO_MATCH_FOUND' } };

    return {
      sanitizationResult: {
        filterMatchState: state(anyMatch) as 'MATCH_FOUND' | 'NO_MATCH_FOUND',
        invocationResult: 'SUCCESS',
        filterResults,
      },
    };
  }

  private findDlpByName(name: string): DlpTemplate | undefined {
    return [...this.dlp.values()].find((t) => t.name === name);
  }

  private dlpKey(kind: DlpKind, location: string, id: string) {
    return `${kind}/${location}/${id}`;
  }

  async listDlpTemplates(_ctx: CallContext, location: string, kind: DlpKind): Promise<DlpTemplate[]> {
    return [...this.dlp.entries()].filter(([k]) => k.startsWith(`${kind}/${location}/`)).map(([, v]) => clone(v));
  }

  async getDlpTemplate(_ctx: CallContext, location: string, kind: DlpKind, id: string): Promise<DlpTemplate> {
    const t = this.dlp.get(this.dlpKey(kind, location, id));
    if (!t) throw new GoogleApiError(404, `Template ${id} not found`, 'NOT_FOUND');
    return clone(t);
  }

  async createDlpTemplate(ctx: CallContext, location: string, kind: DlpKind, id: string, body: DlpTemplate): Promise<DlpTemplate> {
    const key = this.dlpKey(kind, location, id);
    if (this.dlp.has(key)) throw new GoogleApiError(409, `Template ${id} already exists`, 'ALREADY_EXISTS');
    const t = { ...clone(body), name: dlpTemplateName(ctx.projectId, location, kind, id), createTime: now(), updateTime: now() };
    this.dlp.set(key, t);
    return clone(t);
  }

  async updateDlpTemplate(
    ctx: CallContext,
    location: string,
    kind: DlpKind,
    id: string,
    body: DlpTemplate,
    updateMask: string[],
  ): Promise<DlpTemplate> {
    const existing = await this.getDlpTemplate(ctx, location, kind, id);
    const t = { ...applyMask(existing, body, updateMask), updateTime: now() };
    this.dlp.set(this.dlpKey(kind, location, id), t);
    return clone(t);
  }

  async deleteDlpTemplate(ctx: CallContext, location: string, kind: DlpKind, id: string): Promise<void> {
    await this.getDlpTemplate(ctx, location, kind, id);
    this.dlp.delete(this.dlpKey(kind, location, id));
  }

  async listInfoTypes(): Promise<InfoTypeDescription[]> {
    return clone(INFO_TYPES);
  }

  async testPermissions(_ctx: CallContext, permissions: string[]): Promise<string[]> {
    return [...permissions];
  }
}

