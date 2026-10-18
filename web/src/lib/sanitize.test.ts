import { describe, expect, it } from 'vitest';
import { summarizeSanitize } from './sanitize';

describe('summarizeSanitize', () => {
  it('flattens filter results and orders them', () => {
    const out = summarizeSanitize({
      sanitizationResult: {
        filterMatchState: 'MATCH_FOUND',
        filterResults: {
          csam: { csamFilterFilterResult: { executionState: 'EXECUTION_SUCCESS', matchState: 'NO_MATCH_FOUND' } },
          rai: {
            raiFilterResult: {
              executionState: 'EXECUTION_SUCCESS',
              matchState: 'MATCH_FOUND',
              raiFilterTypeResults: { dangerous: { matchState: 'MATCH_FOUND', confidenceLevel: 'HIGH' }, harassment: { matchState: 'NO_MATCH_FOUND' } },
            },
          },
          sdp: {
            sdpFilterResult: {
              inspectResult: {
                executionState: 'EXECUTION_SUCCESS',
                matchState: 'MATCH_FOUND',
                findings: [{ infoType: 'EMAIL_ADDRESS' }, { infoType: 'EMAIL_ADDRESS' }],
              },
              deidentifyResult: { matchState: 'MATCH_FOUND', data: { text: 'mail [EMAIL_ADDRESS]' } },
            },
          },
          pi_and_jailbreak: { piAndJailbreakFilterResult: { executionState: 'EXECUTION_SUCCESS', matchState: 'NO_MATCH_FOUND' } },
        },
      },
    });
    expect(out.matched).toBe(true);
    expect(out.filters.map((f) => f.key)).toEqual(['pi_and_jailbreak', 'rai', 'sdp', 'csam']);
    expect(out.filters[1]!.details).toEqual(['dangerous (high)']);
    expect(out.filters[2]!.details).toEqual(['EMAIL_ADDRESS ×2']);
    expect(out.filters[2]!.sanitizedText).toBe('mail [EMAIL_ADDRESS]');
  });
});
