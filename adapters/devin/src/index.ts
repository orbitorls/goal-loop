import type {
  ContinuePayload,
  Evidence,
  HostAdapter,
  RunContext,
  SessionHandle,
  SessionSnapshot,
} from "@goal-loop/core";

interface DevinSession {
  sessionId: string;
  status: SessionSnapshot["status"];
}

const sessions = new Map<string, DevinSession>();

const MISSING_KEY_ERROR =
  "DEVIN_API_KEY is required for devin adapter. Set DEVIN_API_KEY and DEVIN_ORG_ID. Optional: DEVIN_API_BASE (default https://api.devin.ai/v3).";

function getApiBase(): string {
  return (process.env.DEVIN_API_BASE ?? "https://api.devin.ai/v3").replace(/\/$/, "");
}

function getApiKey(): string | null {
  return process.env.DEVIN_API_KEY ?? null;
}

function getOrgId(): string | null {
  return process.env.DEVIN_ORG_ID ?? null;
}

function requireConfig(): { apiKey: string; orgId: string } {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(MISSING_KEY_ERROR);
  }
  const orgId = getOrgId();
  if (!orgId) {
    throw new Error(
      "DEVIN_ORG_ID is required for devin adapter. Find it on Settings → Service Users in the Devin dashboard.",
    );
  }
  return { apiKey, orgId };
}

export function isDevinConfigured(): boolean {
  return getApiKey() !== null && getOrgId() !== null;
}

async function devinRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const { apiKey } = requireConfig();
  const res = await fetch(`${getApiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Devin API ${method} ${path}: ${res.status} ${text}`);
  }
  if (res.status === 204) {
    return {};
  }
  return (await res.json()) as Record<string, unknown>;
}

function orgSessionsPath(orgId: string, sessionId?: string): string {
  const base = `/organizations/${orgId}/sessions`;
  return sessionId ? `${base}/${sessionId}` : base;
}

function buildInitialPrompt(ctx: RunContext): string {
  return [
    ctx.contract.goal,
    "",
    `Acceptance criteria: ${ctx.contract.acceptance}`,
  ].join("\n");
}

export const devinAdapter: HostAdapter = {
  id: "devin",
  capabilities: { modes: ["outerApi"] },

  async start(ctx: RunContext): Promise<SessionHandle> {
    const { orgId } = requireConfig();
    const data = await devinRequest("POST", orgSessionsPath(orgId), {
      prompt: buildInitialPrompt(ctx),
    });
    const sessionId = String(data.session_id ?? data.devin_id ?? data.id ?? "");
    if (!sessionId) {
      throw new Error("Devin API did not return a session id");
    }
    sessions.set(sessionId, { sessionId, status: "running" });
    return { id: sessionId, adapterId: "devin", metadata: data };
  },

  async continue(handle: SessionHandle, delta: ContinuePayload): Promise<void> {
    const { orgId } = requireConfig();
    await devinRequest("POST", `${orgSessionsPath(orgId, handle.id)}/messages`, {
      message: delta.message,
    });
    const session = sessions.get(handle.id);
    if (session) {
      session.status = "running";
    }
  },

  async poll(handle: SessionHandle): Promise<SessionSnapshot> {
    if (!isDevinConfigured()) {
      return { status: "error", error: MISSING_KEY_ERROR };
    }
    const { orgId } = requireConfig();
    const data = await devinRequest("GET", orgSessionsPath(orgId, handle.id));
    const status = mapDevinStatus(String(data.status ?? "running"));
    const session = sessions.get(handle.id);
    if (session) {
      session.status = status;
    }
    return {
      status,
      output: String(data.output ?? data.summary ?? ""),
    };
  },

  async cancel(handle: SessionHandle): Promise<void> {
    if (!isDevinConfigured()) {
      return;
    }
    const { orgId } = requireConfig();
    await devinRequest("DELETE", orgSessionsPath(orgId, handle.id));
    sessions.delete(handle.id);
  },

  async collectEvidence(handle: SessionHandle): Promise<Evidence> {
    if (!isDevinConfigured()) {
      return { metadata: { error: MISSING_KEY_ERROR } };
    }
    const { orgId } = requireConfig();
    const data = await devinRequest("GET", orgSessionsPath(orgId, handle.id));
    return {
      branch: data.branch as string | undefined,
      prUrl: (data.pull_request_url ?? data.pr_url) as string | undefined,
      metadata: data,
    };
  },
};

type DevinApiStatus =
  | "running"
  | "working"
  | "blocked"
  | "awaiting_input"
  | "finished"
  | "done"
  | "exit"
  | "error"
  | "failed"
  | "suspended"
  | "terminated"
  | "cancelled";

function mapDevinStatus(status: string): SessionSnapshot["status"] {
  const known = asDevinApiStatus(status);
  if (!known) {
    return "running";
  }
  switch (known) {
    case "running":
    case "working":
      return "running";
    case "blocked":
    case "awaiting_input":
    case "suspended":
      return "idle";
    case "finished":
    case "done":
    case "exit":
      return "idle";
    case "error":
    case "failed":
      return "error";
    case "terminated":
    case "cancelled":
      return "exited";
    default: {
      const _exhaustive: never = known;
      return _exhaustive;
    }
  }
}

function asDevinApiStatus(raw: string): DevinApiStatus | null {
  const normalized = raw.toLowerCase();
  const known: DevinApiStatus[] = [
    "running",
    "working",
    "blocked",
    "awaiting_input",
    "finished",
    "done",
    "exit",
    "error",
    "failed",
    "suspended",
    "terminated",
    "cancelled",
  ];
  return known.includes(normalized as DevinApiStatus)
    ? (normalized as DevinApiStatus)
    : null;
}

export function createDevinAdapter(): HostAdapter {
  return devinAdapter;
}
