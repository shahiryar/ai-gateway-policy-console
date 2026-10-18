import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { z } from 'zod';

export const INTEGRATION_TYPES = ['vertex-ai', 'api', 'service-extension', 'apigee', 'gemini-enterprise'] as const;
export const ENVIRONMENTS = ['dev', 'staging', 'prod'] as const;

export const applicationInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(''),
  owner: z.string().trim().min(1).max(120),
  environment: z.enum(ENVIRONMENTS),
  integrationType: z.enum(INTEGRATION_TYPES),
  location: z.string().trim().min(1).max(40),
  promptTemplateId: z.string().trim().min(1).max(63),
  responseTemplateId: z.string().trim().max(63).default(''),
  // Optional details used to fill in the integration instructions.
  workloadServiceAccount: z.string().trim().max(200).default(''),
  model: z.string().trim().max(120).default(''),
});

export type ApplicationInput = z.infer<typeof applicationInput>;

export interface Application extends ApplicationInput {
  id: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export interface ApplicationStore {
  list(): Promise<Application[]>;
  get(id: string): Promise<Application | undefined>;
  create(input: ApplicationInput, actor: string): Promise<Application>;
  update(id: string, input: ApplicationInput, actor: string): Promise<Application | undefined>;
  delete(id: string): Promise<boolean>;
}

function build(input: ApplicationInput, actor: string): Application {
  const at = new Date().toISOString();
  return { ...input, id: randomUUID(), createdBy: actor, createdAt: at, updatedBy: actor, updatedAt: at };
}

const byName = (a: Application, b: Application) => a.name.localeCompare(b.name);

export class MemoryApplicationStore implements ApplicationStore {
  private items = new Map<string, Application>();

  async list() {
    return [...this.items.values()].sort(byName);
  }

  async get(id: string) {
    return this.items.get(id);
  }

  async create(input: ApplicationInput, actor: string) {
    const app = build(input, actor);
    this.items.set(app.id, app);
    return app;
  }

  async update(id: string, input: ApplicationInput, actor: string) {
    const existing = this.items.get(id);
    if (!existing) return undefined;
    const app = { ...existing, ...input, updatedBy: actor, updatedAt: new Date().toISOString() };
    this.items.set(id, app);
    return app;
  }

  async delete(id: string) {
    return this.items.delete(id);
  }
}

/** Uses the Cloud Run service account (Application Default Credentials), not the user's token. */
export class FirestoreApplicationStore implements ApplicationStore {
  private readonly collection;

  constructor(projectId: string, databaseId: string) {
    const db = new Firestore({ projectId, databaseId, ignoreUndefinedProperties: true });
    this.collection = db.collection('applications');
  }

  async list() {
    const snap = await this.collection.get();
    return snap.docs.map((d) => d.data() as Application).sort(byName);
  }

  async get(id: string) {
    const doc = await this.collection.doc(id).get();
    return doc.exists ? (doc.data() as Application) : undefined;
  }

  async create(input: ApplicationInput, actor: string) {
    const app = build(input, actor);
    await this.collection.doc(app.id).create(app);
    return app;
  }

  async update(id: string, input: ApplicationInput, actor: string) {
    const ref = this.collection.doc(id);
    return this.collection.firestore.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) return undefined;
      const app = { ...(doc.data() as Application), ...input, updatedBy: actor, updatedAt: new Date().toISOString() };
      tx.set(ref, app);
      return app;
    });
  }

  async delete(id: string) {
    const ref = this.collection.doc(id);
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.delete();
    return true;
  }
}
