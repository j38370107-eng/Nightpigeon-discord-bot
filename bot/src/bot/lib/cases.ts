import { dbGet, dbSet } from "../store/db";

const COUNTER_STORE = "case_counter";
const CASES_STORE   = "mod_cases";

export interface CaseRecord {
  id: number;
  action: string;
  userId: string;
  userTag: string;
  modId: string;
  modTag: string;
  reason: string;
  createdAt: number;
  duration?: string;
  expiresAt?: number;
}

async function getCounter(guildId: string): Promise<number> {
  return (await dbGet<number>(COUNTER_STORE, guildId)) ?? 0;
}

async function bumpCounter(guildId: string): Promise<number> {
  const next = (await getCounter(guildId)) + 1;
  await dbSet(COUNTER_STORE, guildId, next);
  return next;
}

async function loadCases(guildId: string): Promise<CaseRecord[]> {
  return (await dbGet<CaseRecord[]>(CASES_STORE, guildId)) ?? [];
}

async function saveCases(guildId: string, cases: CaseRecord[]): Promise<void> {
  await dbSet(CASES_STORE, guildId, cases);
}

export async function addCase(
  guildId: string,
  data: Omit<CaseRecord, "id" | "createdAt">
): Promise<CaseRecord> {
  const id = await bumpCounter(guildId);
  const record: CaseRecord = { id, createdAt: Date.now(), ...data };
  const cases = await loadCases(guildId);
  cases.push(record);
  await saveCases(guildId, cases);
  return record;
}

export async function getCase(guildId: string, caseId: number): Promise<CaseRecord | null> {
  const cases = await loadCases(guildId);
  return cases.find((c) => c.id === caseId) ?? null;
}

export async function getCasesForUser(guildId: string, userId: string): Promise<CaseRecord[]> {
  const cases = await loadCases(guildId);
  return cases.filter((c) => c.userId === userId);
}

export async function getAllCases(guildId: string): Promise<CaseRecord[]> {
  return loadCases(guildId);
}

export async function editCase(
  guildId: string,
  caseId: number,
  updates: { reason?: string; duration?: string },
): Promise<boolean> {
  const cases = await loadCases(guildId);
  const idx = cases.findIndex((c) => c.id === caseId);
  if (idx === -1) return false;
  if (updates.reason !== undefined) cases[idx]!.reason = updates.reason;
  if (updates.duration !== undefined) cases[idx]!.duration = updates.duration;
  await saveCases(guildId, cases);
  return true;
}

export async function deleteCase(guildId: string, caseId: number): Promise<boolean> {
  const cases = await loadCases(guildId);
  const idx = cases.findIndex((c) => c.id === caseId);
  if (idx === -1) return false;
  cases.splice(idx, 1);
  await saveCases(guildId, cases);
  return true;
}

/**
 * Force-expire all active warn cases for a user by setting expiresAt to now.
 * Used by !escalation reset to immediately remove them from the active count.
 * The cases themselves are preserved in history.
 */
export async function forceExpireWarnCases(guildId: string, userId: string): Promise<number> {
  const cases = await loadCases(guildId);
  const now = Date.now();
  let count = 0;
  for (const c of cases) {
    if (c.userId !== userId) continue;
    if (!c.action.toLowerCase().startsWith("warn")) continue;
    if (c.expiresAt !== undefined && c.expiresAt <= now) continue;
    c.expiresAt = now - 1;
    count++;
  }
  if (count > 0) await saveCases(guildId, cases);
  return count;
}
