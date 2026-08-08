import type { HostAdapter } from "./types.js";

const adapters = new Map<string, HostAdapter>();

export function registerAdapter(adapter: HostAdapter): void {
  adapters.set(adapter.id, adapter);
}

export function listAdapters(): HostAdapter[] {
  return [...adapters.values()];
}

export function getAdapter(id: string): HostAdapter | undefined {
  return adapters.get(id);
}

/**
 * Resolve a host id. `auto` prefers outerCli (generic-shell), then outerApi, then inSessionGate.
 */
export function resolveHost(id: string | "auto" | undefined): HostAdapter {
  const requested = id ?? "auto";

  if (requested !== "auto") {
    const found = adapters.get(requested);
    if (!found) {
      const known = [...adapters.keys()].join(", ") || "(none)";
      throw new Error(`Unknown host adapter '${requested}'. Registered: ${known}`);
    }
    return found;
  }

  const preference = ["outerCli", "outerApi", "inSessionGate", "proofOnly"] as const;
  for (const mode of preference) {
    const match = [...adapters.values()].find((a) =>
      a.capabilities.modes.includes(mode),
    );
    if (match) return match;
  }

  throw new Error("No host adapters registered. Install an adapter package or use generic-shell.");
}

export function clearRegistry(): void {
  adapters.clear();
}
