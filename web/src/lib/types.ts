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
    filterMatchState?: string;
    invocationResult?: string;
    filterResults?: Record<string, Record<string, Record<string, unknown>>>;
  };
}

export type DlpKind = 'inspect' | 'deidentify';

export interface InspectTemplate {
  name?: string;
  displayName?: string;
  description?: string;
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
  updateTime?: string;
  deidentifyConfig?: Record<string, unknown>;
}

export type DlpTemplate = InspectTemplate & DeidentifyTemplate;

export interface InfoType {
  name: string;
  displayName?: string;
}

export type PermissionKey =
  | 'templatesList'
  | 'templatesGet'
  | 'templatesCreate'
  | 'templatesUpdate'
  | 'templatesDelete'
  | 'sanitizePrompt'
  | 'sanitizeResponse'
  | 'inspectList'
  | 'inspectCreate'
  | 'inspectUpdate'
  | 'inspectDelete'
  | 'deidentifyList'
  | 'deidentifyCreate'
  | 'deidentifyUpdate'
  | 'deidentifyDelete';

export interface Me {
  email: string;
  name?: string;
  picture?: string;
  projectId: string;
  locations: string[];
  mode: 'live' | 'mock';
  permissions: Record<PermissionKey, boolean>;
}

export const INTEGRATION_TYPES = ['vertex-ai', 'api', 'service-extension', 'apigee', 'gemini-enterprise'] as const;
export type IntegrationType = (typeof INTEGRATION_TYPES)[number];

export const INTEGRATION_LABELS: Record<IntegrationType, string> = {
  'vertex-ai': 'Vertex AI',
  api: 'Application code (API)',
  'service-extension': 'GKE / load balancer service extension',
  apigee: 'Apigee',
  'gemini-enterprise': 'Gemini Enterprise',
};

export const ENVIRONMENTS = ['dev', 'staging', 'prod'] as const;

export interface ApplicationInput {
  name: string;
  description: string;
  owner: string;
  environment: (typeof ENVIRONMENTS)[number];
  integrationType: IntegrationType;
  location: string;
  promptTemplateId: string;
  responseTemplateId: string;
  workloadServiceAccount: string;
  model: string;
}

export interface Application extends ApplicationInput {
  id: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  canEdit?: boolean;
}

export interface Instructions {
  title: string;
  summary: string;
  steps: { title: string; body?: string; code?: { language: string; content: string } }[];
  docs: { label: string; url: string }[];
}

export function shortId(name: string | undefined): string {
  if (!name) return '';
  return name.split('/').pop() ?? '';
}
