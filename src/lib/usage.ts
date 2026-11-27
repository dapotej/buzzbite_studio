import "server-only";
import { neon } from "@neondatabase/serverless";
import { requireSession } from "./accounts";

// What each piece of AI work cost, so we can see the margin per workspace and per post.
// Claude costs come from the token counts each response reports. fal.ai does not report a
// price per job, so its costs are estimates per model (override with FAL_COSTS, a JSON map
// of model id to US dollars per job). Both are recorded only for work that succeeded.

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

// US dollars per million tokens (Anthropic list prices, Nov 2026).
const CLAUDE_PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
};
const WEB_SEARCH_USD = 0.01; // $10 per 1,000 searches

// Estimated US dollars per job on fal.ai.
const FAL_DEFAULTS: Record<string, number> = {
  "blackforestlabs/flux-3/text-to-image": 0.05,
  "openai/gpt-image-2/edit": 0.2,
  "fal-ai/kling-video/v2.1/standard/image-to-video": 0.25,
  "fal-ai/elevenlabs/tts/eleven-v3": 0.03,
  "fal-ai/elevenlabs/music": 0.4,
};
function falCost(model: string): number {
  try {
    const extra = JSON.parse(process.env.FAL_COSTS || "{}") as Record<string, number>;
    if (typeof extra[model] === "number") return extra[model];
  } catch { /* ignore a malformed override */ }
  return FAL_DEFAULTS[model] ?? (/video/.test(model) ? 0.3 : /music|tts|audio/.test(model) ? 0.05 : 0.08);
}

export type ClaudeUsage = {
  input_tokens?: number | null; output_tokens?: number | null;
  cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
};

export function claudeCost(model: string, u: ClaudeUsage): number {
  const p = CLAUDE_PRICES[model] ?? CLAUDE_PRICES["claude-opus-5-5"];
  return ((u.input_tokens ?? 0) * p.input + (u.output_tokens ?? 0) * p.output
    + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1e6
    + (u.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD;
}

async function insert(e: { workspaceId: string; brandId?: string | null; postId?: string | null; provider: string; model: string; action: string; units: unknown; cost: number }) {
  try {
    await client()`insert into usage_events (workspace_id, brand_id, post_id, provider, model, action, units, cost_usd)
      values (${e.workspaceId}, ${e.brandId ?? null}, ${e.postId ?? null}, ${e.provider}, ${e.model}, ${e.action}, ${JSON.stringify(e.units)}::jsonb, ${e.cost.toFixed(4)})`;
  } catch (err) {
    console.error("could not record usage", err); // cost tracking never breaks the work itself
  }
}

/** Records one Claude response for the signed-in workspace. */
export async function recordClaude(action: string, model: string, usage: ClaudeUsage): Promise<void> {
  const ws = await requireSession().then((s) => s.workspace.id).catch(() => null);
  if (!ws) return;
  const units = { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0, cacheRead: usage.cache_read_input_tokens ?? 0, cacheWrite: usage.cache_creation_input_tokens ?? 0, searches: usage.server_tool_use?.web_search_requests ?? 0 };
  await insert({ workspaceId: ws, provider: "anthropic", model, action, units, cost: claudeCost(model, usage) });
}

/** Records a finished fal.ai job against its brand's workspace and post. */
export async function recordFal(m: { brand_id: string; post_id: string | null; fal_endpoint: string | null; role: string | null }): Promise<void> {
  if (!m.fal_endpoint) return;
  const rows = await client()`select workspace_id from brands where id = ${m.brand_id}`.catch(() => []);
  const ws = (rows[0] as { workspace_id?: string } | undefined)?.workspace_id;
  if (!ws) return;
  const action = (m.role ?? "media").replace(/^scene:\d+:/, "reel ");
  await insert({ workspaceId: ws, brandId: m.brand_id, postId: m.post_id, provider: "fal", model: m.fal_endpoint, action, units: { jobs: 1 }, cost: falCost(m.fal_endpoint) });
}

export type WorkspaceCost = { workspace_id: string; workspace: string; plan: string; claude: number; fal: number; total: number; posts: number };

/** This calendar month's estimated AI cost for every workspace (internal health page). */
export async function costsThisMonth(): Promise<WorkspaceCost[]> {
  const rows = await client()`
    select w.id as workspace_id, w.name as workspace, w.plan,
      coalesce(sum(u.cost_usd) filter (where u.provider = 'anthropic'), 0)::float as claude,
      coalesce(sum(u.cost_usd) filter (where u.provider = 'fal'), 0)::float as fal,
      coalesce(sum(u.cost_usd), 0)::float as total,
      (select count(*)::int from posts p join brands b on b.id = p.brand_id where b.workspace_id = w.id and p.created_at >= date_trunc('month', now())) as posts
    from workspaces w left join usage_events u on u.workspace_id = w.id and u.created_at >= date_trunc('month', now())
    group by w.id order by total desc`;
  return rows as WorkspaceCost[];
}

/** This month's estimated AI cost for one workspace. */
export async function workspaceCostThisMonth(workspaceId: string): Promise<number> {
  const rows = await client()`select coalesce(sum(cost_usd), 0)::float as total from usage_events where workspace_id = ${workspaceId} and created_at >= date_trunc('month', now())`;
  return Number((rows[0] as { total: number }).total);
}

/** The most expensive posts this month, with their photo and video cost (internal health page). */
export async function costliestPosts(limit = 10): Promise<{ id: string; title: string; brand: string; cost: number; jobs: number }[]> {
  const rows = await client()`
    select p.id, p.title, b.name as brand, sum(u.cost_usd)::float as cost, count(*)::int as jobs
    from usage_events u join posts p on p.id = u.post_id join brands b on b.id = p.brand_id
    where u.created_at >= date_trunc('month', now()) group by p.id, b.name order by cost desc limit ${limit}`;
  return rows as { id: string; title: string; brand: string; cost: number; jobs: number }[];
}
