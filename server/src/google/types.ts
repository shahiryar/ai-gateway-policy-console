// Shapes follow the public REST resources of Model Armor v1 and Sensitive Data Protection v2.
// Only the fields the console reads or writes are typed; everything else passes through untouched.

export type FilterEnforcement = 'ENABLED' | 'DISABLED';
export type ConfidenceLevel = 'LOW_AND_ABOVE' | 'MEDIUM_AND_ABOVE' | 'HIGH';
export type RaiFilterType = 'HATE_SPEECH' | 'HARASSMENT' | 'SEXUALLY_EXPLICIT' | 'DANGEROUS';

export interface ModelArmorTemplate {
  name?: string;
  createTime?: string;
  updateTime?: string;
  labels?: Record<string, string>;
  filterConfig?: {
    raiSettings?: { raiFilters?: { filterType: RaiFilterType; confidenceLevel?: ConfidenceLevel }[] };
    sdpSettings?: {
      basicConfig?: { filterEnforcement?: FilterEnforcement };
      advancedConfig?: { inspectTemplate?: string; deidentifyTemplate?: string };
    };
    piAndJailbreakFilterSettings?: { filterEnforcement?: FilterEnforcement; confidenceLevel?: ConfidenceLevel };
    maliciousUriFilterSettings?: { filterEnforcement?: FilterEnforcement };
  };
  templateMetadata?: {
    enforcementType?: 'INSPECT_ONLY' | 'INSPECT_AND_BLOCK';
    logTemplateOperations?: boolean;
    logSanitizeOperations?: boolean;
    multiLanguageDetection?: { enableMultiLanguageDetection?: boolean };
    [key: string]: unknown;
  };
}

export interface SanitizeResponse {
  sanitizationResult?: {
    filterMatchState?: 'MATCH_FOUND' | 'NO_MATCH_FOUND' | 'FILTER_MATCH_STATE_UNSPECIFIED';
    invocationResult?: string;
    filterResults?: Record<string, Record<string, unknown>>;
    sanitizationMetadata?: Record<string, unknown>;
  };
}

export type DlpKind = 'inspect' | 'deidentify';

export interface InspectTemplate {
  name?: string;
  displayName?: string;
  description?: string;
  createTime?: string;
  updateTime?: string;
  inspectConfig?: {
    infoTypes?: { name: string }[];
    minLikelihood?: string;
    includeQuote?: boolean;
    customInfoTypes?: {
      infoType: { name: string };
      likelihood?: string;
      regex?: { pattern: string };
      dictionary?: { wordList: { words: string[] } };
    }[];
    [key: string]: unknown;
  };
}

export interface DeidentifyTemplate {
  name?: string;
  displayName?: string;
  description?: string;
  createTime?: string;
  updateTime?: string;
  deidentifyConfig?: Record<string, unknown>;
}

export type DlpTemplate = InspectTemplate | DeidentifyTemplate;

export interface InfoTypeDescription {
  name: string;
  displayName?: string;
  description?: string;
  categories?: unknown[];
}

/** Who is calling and against which project. The token is always the signed-in user's own. */
export interface CallContext {
  accessToken: string;
  projectId: string;
}

export interface PolicyApis {
  listTemplates(ctx: CallContext, location: string): Promise<ModelArmorTemplate[]>;
  getTemplate(ctx: CallContext, location: string, id: string): Promise<ModelArmorTemplate>;
  createTemplate(ctx: CallContext, location: string, id: string, body: ModelArmorTemplate): Promise<ModelArmorTemplate>;
  updateTemplate(
    ctx: CallContext,
    location: string,
    id: string,
    body: ModelArmorTemplate,
    updateMask: string[],
  ): Promise<ModelArmorTemplate>;
  deleteTemplate(ctx: CallContext, location: string, id: string): Promise<void>;
  sanitize(
    ctx: CallContext,
    location: string,
    id: string,
    input: { kind: 'prompt' | 'response'; text: string; userPrompt?: string },
  ): Promise<SanitizeResponse>;

  listDlpTemplates(ctx: CallContext, location: string, kind: DlpKind): Promise<DlpTemplate[]>;
  getDlpTemplate(ctx: CallContext, location: string, kind: DlpKind, id: string): Promise<DlpTemplate>;
  createDlpTemplate(ctx: CallContext, location: string, kind: DlpKind, id: string, body: DlpTemplate): Promise<DlpTemplate>;
  updateDlpTemplate(
    ctx: CallContext,
    location: string,
    kind: DlpKind,
    id: string,
    body: DlpTemplate,
    updateMask: string[],
  ): Promise<DlpTemplate>;
  deleteDlpTemplate(ctx: CallContext, location: string, kind: DlpKind, id: string): Promise<void>;
  listInfoTypes(ctx: CallContext, location: string): Promise<InfoTypeDescription[]>;

  /** Returns the subset of `permissions` the caller holds on the project. */
  testPermissions(ctx: CallContext, permissions: string[]): Promise<string[]>;
}

export class GoogleApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly googleStatus?: string,
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }
}

export function templateName(projectId: string, location: string, id: string): string {
  return `projects/${projectId}/locations/${location}/templates/${id}`;
}

export function dlpTemplateName(projectId: string, location: string, kind: DlpKind, id: string): string {
  return `projects/${projectId}/locations/${location}/${kind === 'inspect' ? 'inspectTemplates' : 'deidentifyTemplates'}/${id}`;
}

/** Last path segment of a resource name. */
export function shortId(name: string | undefined): string {
  if (!name) return '';
  const parts = name.split('/');
  return parts[parts.length - 1] ?? '';
}
