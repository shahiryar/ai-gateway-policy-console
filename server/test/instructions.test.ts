import { describe, expect, it } from 'vitest';
import { generateInstructions } from '../src/instructions/generate.js';
import { INTEGRATION_TYPES } from '../src/store/registry.js';

describe('generateInstructions', () => {
  for (const integrationType of INTEGRATION_TYPES) {
    it(`names the real templates for ${integrationType}`, () => {
      const out = generateInstructions({
        projectId: 'acme-ai',
        location: 'europe-west4',
        promptTemplateId: 'prompts',
        responseTemplateId: 'responses',
        integrationType,
      });
      const text = JSON.stringify(out);
      expect(out.steps.length).toBeGreaterThan(0);
      expect(text).toContain('projects/acme-ai/locations/europe-west4/templates/prompts');
      expect(text).toContain('projects/acme-ai/locations/europe-west4/templates/responses');
      expect(out.docs.length).toBeGreaterThan(0);
    });
  }

  it('reuses the prompt template for responses when none is set', () => {
    const out = generateInstructions({ projectId: 'p', location: 'us-central1', promptTemplateId: 'only', integrationType: 'api' });
    expect(JSON.stringify(out)).not.toContain('templates/"');
    expect(JSON.stringify(out).match(/templates\/only/g)!.length).toBeGreaterThan(1);
  });

  it('uses the regional endpoint in code samples', () => {
    const out = generateInstructions({ projectId: 'p', location: 'us-east1', promptTemplateId: 't', integrationType: 'api' });
    expect(JSON.stringify(out)).toContain('modelarmor.us-east1.rep.googleapis.com');
  });
});
