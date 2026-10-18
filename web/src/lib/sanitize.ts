import type { SanitizeResponse } from './types';

export interface FilterOutcome {
  key: string;
  label: string;
  matched: boolean;
  executionState?: string;
  details: string[];
  sanitizedText?: string;
}

const LABELS: Record<string, string> = {
  rai: 'Responsible AI',
  pi_and_jailbreak: 'Prompt injection and jailbreak',
  malicious_uris: 'Malicious URLs',
  sdp: 'Sensitive data',
  csam: 'Child safety',
};

const ORDER = ['pi_and_jailbreak', 'rai', 'sdp', 'malicious_uris', 'csam'];

type Loose = Record<string, unknown>;

function asObj(v: unknown): Loose {
  return v && typeof v === 'object' ? (v as Loose) : {};
}

const humanize = (s: string) => s.toLowerCase().replace(/_/g, ' ');

/** Flattens Model Armor's nested filterResults into one row per filter. */
export function summarizeSanitize(res: SanitizeResponse): { matched: boolean; filters: FilterOutcome[] } {
  const result = res.sanitizationResult ?? {};
  const filters: FilterOutcome[] = [];

  for (const [key, wrapper] of Object.entries(result.filterResults ?? {})) {
    const inner = asObj(Object.values(asObj(wrapper))[0]);
    const details: string[] = [];
    let matched = inner.matchState === 'MATCH_FOUND';
    let executionState = inner.executionState as string | undefined;
    let sanitizedText: string | undefined;

    if (key === 'rai') {
      for (const [type, r] of Object.entries(asObj(inner.raiFilterTypeResults))) {
        const o = asObj(r);
        if (o.matchState === 'MATCH_FOUND') details.push(`${humanize(type)}${o.confidenceLevel ? ` (${humanize(String(o.confidenceLevel))})` : ''}`);
      }
    } else if (key === 'pi_and_jailbreak') {
      if (matched && inner.confidenceLevel) details.push(`confidence ${humanize(String(inner.confidenceLevel))}`);
    } else if (key === 'malicious_uris') {
      for (const item of (inner.maliciousUriMatchedItems as Loose[] | undefined) ?? []) details.push(String(item.uri));
    } else if (key === 'sdp') {
      const inspect = asObj(inner.inspectResult);
      const deid = asObj(inner.deidentifyResult);
      matched = inspect.matchState === 'MATCH_FOUND' || deid.matchState === 'MATCH_FOUND';
      executionState = (inspect.executionState ?? deid.executionState) as string | undefined;
      const findings = (inspect.findings as Loose[] | undefined) ?? [];
      const counts = new Map<string, number>();
      for (const f of findings) counts.set(String(f.infoType), (counts.get(String(f.infoType)) ?? 0) + 1);
      for (const [type, n] of counts) details.push(n > 1 ? `${type} ×${n}` : type);
      if (!findings.length) for (const t of (deid.infoTypes as string[] | undefined) ?? []) details.push(t);
      sanitizedText = asObj(deid.data).text as string | undefined;
    }

    filters.push({ key, label: LABELS[key] ?? humanize(key), matched, executionState, details, sanitizedText });
  }

  filters.sort((a, b) => {
    const ia = ORDER.indexOf(a.key);
    const ib = ORDER.indexOf(b.key);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return { matched: result.filterMatchState === 'MATCH_FOUND', filters };
}
