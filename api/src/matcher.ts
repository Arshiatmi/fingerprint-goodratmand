export interface Candidate {
  id: number;
  template: Buffer;
}

export interface Matcher {
  /** Returns the id of an already-enrolled person whose fingerprint matches, or null. */
  findMatch(probe: Buffer, candidates: Candidate[]): Promise<number | null>;
}

/**
 * Development only. Real fingerprint scans of the same finger are never
 * byte-identical, so this only catches the exact same template.
 */
class MockMatcher implements Matcher {
  async findMatch(probe: Buffer, candidates: Candidate[]): Promise<number | null> {
    const hit = candidates.find((c) => c.template.equals(probe));
    return hit ? hit.id : null;
  }
}

/**
 * Production matcher: delegates to the local agent, which should call
 * Suprema's matcher (UFMatcher) against each candidate.
 *
 * TODO: adjust the path, request body and response fields to your real agent.
 */
class AgentMatcher implements Matcher {
  constructor(private readonly baseUrl: string) {}

  async findMatch(probe: Buffer, candidates: Candidate[]): Promise<number | null> {
    if (candidates.length === 0) return null;
    const res = await fetch(`${this.baseUrl}/api/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        probe: probe.toString("base64"),
        candidates: candidates.map((c) => ({ id: c.id, template: c.template.toString("base64") })),
      }),
    });
    if (!res.ok) throw new Error(`Matcher agent error: HTTP ${res.status}`);
    const data = (await res.json()) as { matchedId: number | null };
    return data.matchedId ?? null;
  }
}

export function createMatcher(): Matcher {
  if (process.env.MATCHER === "agent") {
    return new AgentMatcher(process.env.AGENT_URL ?? "http://localhost:8443");
  }
  console.warn("[matcher] MATCHER=mock: duplicate detection is exact-match only. Do not use in production.");
  return new MockMatcher();
}
