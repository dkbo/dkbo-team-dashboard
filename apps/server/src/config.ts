import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

export const REPO_ROOT = resolve(import.meta.dirname, '../../..');

const ConfigSchema = z.object({
  projects: z.array(z.object({ name: z.string().min(1), path: z.string().min(1) })),
  pollMs: z.number().int().positive().optional(),
});

export type ProjectConfig = { name: string; path: string };
export interface DashboardConfig {
  projects: ProjectConfig[];
  pollMs: number;
}

export const DEFAULT_POLL_MS = 5000;

export function parseConfig(text: string): DashboardConfig {
  const c = ConfigSchema.parse(JSON.parse(text));
  const names = new Set<string>();
  for (const p of c.projects) {
    if (names.has(p.name)) throw new Error(`dashboard config: duplicate project name '${p.name}'`);
    names.add(p.name);
  }
  return { projects: c.projects.map((p) => ({ name: p.name, path: resolve(p.path) })), pollMs: c.pollMs ?? DEFAULT_POLL_MS };
}

export function loadConfig(path = process.env.DASHBOARD_CONFIG ?? resolve(REPO_ROOT, 'dashboard.config.json')): DashboardConfig {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error(`dashboard config not found: ${path}（先複製 dashboard.config.example.json 成 dashboard.config.json 再改路徑）`);
    throw e;
  }
  return parseConfig(text);
}
