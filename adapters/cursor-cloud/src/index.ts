import type {
  ContinuePayload,
  Evidence,
  HostAdapter,
  RunContext,
  SessionHandle,
  SessionSnapshot,
} from "@goal-loop/core";

interface CloudSession {
  agentId: string;
  status: SessionSnapshot["status"];
  output: string;
}

const sessions = new Map<string, CloudSession>();

const MISSING_KEY_ERROR =
  "CURSOR_API_KEY is required for cursor-cloud adapter. Set CURSOR_API_KEY (or CURSOR_CLOUD_API_KEY). Optional: CURSOR_API_BASE (default https://api.cursor.com).";

function getApiBase(): string {
  return (process.env.CURSOR_API_BASE ?? "https://api.cursor.com").replace(/\/$/, "");
}

function getApiKey(): string | null {
  return process.env.CURSOR_API_KEY ?? process.env.CURSOR_CLOUD_API_KEY ?? null;
}

function requireApiKey(): string {
  const key = getApiKey();
  if (!key) {
    throw new Error(MISSING_KEY_ERROR);
  }
  return key;
}

export function isCursorCloudConfigured(): boolean {
  return getApiKey() !== null;
}

async function apiRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const key = requireApiKey();
  const auth = Buffer.from(`${key}:`).toString("base64");
  const res = await fetch(`${getApiBase()}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cursor Cloud API ${method} ${path}: ${res.status} ${text}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

function buildInitialPrompt(ctx: RunContext): string {
  return [
    ctx.contract.goal,
    "",
    `Acceptance criteria: ${ctx.contract.acceptance}`,
  ].join("\n");
}

export const cursorCloudAdapter: HostAdapter = {
  id: "cursor-cloud",
  capabilities: { modes: ["outerApi"] },

  async start(ctx: RunContext): Promise<SessionHandle> {
    if (!isCursorCloudConfigured()) {
      throw new Error(MISSING_KEY_ERROR);
    }

    const body: Record<string, unknown> = {
      prompt: { text: buildInitialPrompt(ctx) },
    };
    const repo = ctx.contract.workspace ?? ctx.workspace;
    if (repo) {
      body.source = { repository: repo };
    }

    const data = await apiRequest("POST", "/v0/agents", body);
    const agentId = String(data.id ?? data.agentId ?? "");
    if (!agentId) {
      throw new Error("Cursor Cloud API did not return an agent id");
    }

    const handle: SessionHandle = {
      id: agentId,
      adapterId: "cursor-cloud",
      metadata: data,
    };
    sessions.set(agentId, { agentId, status: "running", output: "" });
    return handle;
  },

  async continue(handle: SessionHandle, delta: ContinuePayload): Promise<void> {
    if (!isCursorCloudConfigured()) {
      throw new Error(MISSING_KEY_ERROR);
    }

    await apiRequest("POST", `/v0/agents/${handle.id}/followup`, {
      prompt: { text: delta.message },
    });
    const session = sessions.get(handle.id);
    if (session) {
      session.status = "running";
    }
  },

  async poll(handle: SessionHandle): Promise<SessionSnapshot> {
    if (!isCursorCloudConfigured()) {
      return { status: "error", error: MISSING_KEY_ERROR };
    }

    const data = await apiRequest("GET", `/v0/agents/${handle.id}`);
    const status = mapCursorStatus(String(data.status ?? "RUNNING"));
    const output = String(data.summary ?? data.output ?? "");
    const snapshot: SessionSnapshot = { status, output };

    const session = sessions.get(handle.id);
    if (session) {
      session.status = snapshot.status;
      session.output = snapshot.output ?? "";
    }
    return snapshot;
  },

  async cancel(handle: SessionHandle): Promise<void> {
    if (!isCursorCloudConfigured()) {
      return;
    }
    await apiRequest("POST", `/v0/agents/${handle.id}/stop`, {});
    sessions.delete(handle.id);
  },

  async collectEvidence(handle: SessionHandle): Promise<Evidence> {
    if (!isCursorCloudConfigured()) {
      return { metadata: { error: MISSING_KEY_ERROR } };
    }
    const data = await apiRequest("GET", `/v0/agents/${handle.id}`);
    const target = data.target as Record<string, unknown> | undefined;
    return {
      branch: (data.branch ?? target?.branchName) as string | undefined,
      prUrl: (data.prUrl ?? target?.prUrl) as string | undefined,
      metadata: data,
    };
  },
};

type CursorApiStatus =
  | "RUNNING"
  | "running"
  | "FINISHED"
  | "finished"
  | "IDLE"
  | "idle"
  | "FAILED"
  | "failed"
  | "STOPPED"
  | "stopped";

function mapCursorStatus(apiStatus: string): SessionSnapshot["status"] {
  const known = asCursorApiStatus(apiStatus);
  if (!known) {
    return "running";
  }
  switch (known) {
    case "RUNNING":
    case "running":
      return "running";
    case "FINISHED":
    case "finished":
    case "IDLE":
    case "idle":
      return "idle";
    case "FAILED":
    case "failed":
      return "error";
    case "STOPPED":
    case "stopped":
      return "exited";
    default: {
      const _exhaustive: never = known;
      return _exhaustive;
    }
  }
}

function asCursorApiStatus(raw: string): CursorApiStatus | null {
  const known: CursorApiStatus[] = [
    "RUNNING",
    "running",
    "FINISHED",
    "finished",
    "IDLE",
    "idle",
    "FAILED",
    "failed",
    "STOPPED",
    "stopped",
  ];
  return known.includes(raw as CursorApiStatus) ? (raw as CursorApiStatus) : null;
}

export function createCursorCloudAdapter(): HostAdapter {
  return cursorCloudAdapter;
}
