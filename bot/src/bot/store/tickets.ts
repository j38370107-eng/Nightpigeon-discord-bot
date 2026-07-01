import { logger } from "../../lib/logger";
import { pool } from "./db";
import { dbSet, dbGet, dbGetAll, dbDelete } from "./db";

// Store names (bot_store KV)
const BLACKLIST_STORE = "ticketBlacklist";
const PANEL_MSG_STORE = "ticketPanelMessages";
const COUNTER_STORE   = "ticketCounter";

// SQL-backed data types
export type TicketStatus = "open" | "closed" | "archived";

export interface Ticket {
  id: number;
  guildId: string;
  number: number;
  categoryKey: string;
  channelId: string;
  openerId: string;
  openerTag: string;
  claimerId: string | null;
  claimerTag: string | null;
  status: TicketStatus;
  openAt: number;
  closeAt: number | null;
  closeReason: string | null;
  transcriptUrl: string | null;
  lastActivityAt: number;
  originalCategoryId: string | null;
}

export interface TicketParticipant {
  ticketId: number;
  userId: string;
}

export interface TicketFeedback {
  ticketId: number;
  userId: string;
  rating: number;
  comment: string | null;
}

export interface TicketBlacklistEntry {
  userId: string;
  userTag: string;
  reason?: string;
  addedBy: string;
  addedByTag: string;
  addedAt: number;
}

// Init — create SQL tables
export async function initTicketStore(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id                  SERIAL PRIMARY KEY,
      guild_id            TEXT NOT NULL,
      number              INTEGER NOT NULL,
      category_key        TEXT NOT NULL DEFAULT '',
      channel_id          TEXT NOT NULL UNIQUE,
      opener_id           TEXT NOT NULL,
      opener_tag          TEXT NOT NULL,
      claimer_id          TEXT,
      claimer_tag         TEXT,
      status              TEXT NOT NULL DEFAULT 'open',
      open_at             BIGINT NOT NULL,
      close_at            BIGINT,
      close_reason        TEXT,
      transcript_url      TEXT,
      last_activity_at    BIGINT NOT NULL,
      original_category_id TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_participants (
      ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL,
      PRIMARY KEY (ticket_id, user_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_feedback (
      ticket_id  INTEGER PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL,
      rating     INTEGER NOT NULL,
      comment    TEXT
    )
  `);
  logger.info("Ticket SQL tables ensured");
}

// Ticket counter
export async function nextTicketNumber(guildId: string): Promise<number> {
  const key = `counter:${guildId}`;
  const cur = await dbGet<{ n: number }>(COUNTER_STORE, key);
  const next = (cur?.n ?? 0) + 1;
  await dbSet(COUNTER_STORE, key, { n: next });
  return next;
}

// Ticket CRUD
function rowToTicket(r: Record<string, unknown>): Ticket {
  return {
    id:                 r["id"] as number,
    guildId:            r["guild_id"] as string,
    number:             r["number"] as number,
    categoryKey:        r["category_key"] as string,
    channelId:          r["channel_id"] as string,
    openerId:           r["opener_id"] as string,
    openerTag:          r["opener_tag"] as string,
    claimerId:          (r["claimer_id"] as string | null) ?? null,
    claimerTag:         (r["claimer_tag"] as string | null) ?? null,
    status:             r["status"] as TicketStatus,
    openAt:             Number(r["open_at"]),
    closeAt:            r["close_at"] != null ? Number(r["close_at"]) : null,
    closeReason:        (r["close_reason"] as string | null) ?? null,
    transcriptUrl:      (r["transcript_url"] as string | null) ?? null,
    lastActivityAt:     Number(r["last_activity_at"]),
    originalCategoryId: (r["original_category_id"] as string | null) ?? null,
  };
}

export async function createTicket(t: Omit<Ticket, "id">): Promise<Ticket> {
  const res = await pool.query(
    `INSERT INTO tickets
       (guild_id, number, category_key, channel_id, opener_id, opener_tag,
        status, open_at, last_activity_at, original_category_id)
     VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$8,$9)
     RETURNING *`,
    [t.guildId, t.number, t.categoryKey, t.channelId, t.openerId, t.openerTag,
     t.openAt, t.openAt, t.originalCategoryId ?? null]
  );
  return rowToTicket(res.rows[0]);
}

export async function getTicketByChannel(channelId: string): Promise<Ticket | null> {
  const res = await pool.query("SELECT * FROM tickets WHERE channel_id = $1", [channelId]);
  if (!res.rows[0]) return null;
  return rowToTicket(res.rows[0]);
}

export async function getTicketById(id: number): Promise<Ticket | null> {
  const res = await pool.query("SELECT * FROM tickets WHERE id = $1", [id]);
  if (!res.rows[0]) return null;
  return rowToTicket(res.rows[0]);
}

export async function getOpenTicketsByUser(guildId: string, userId: string): Promise<Ticket[]> {
  const res = await pool.query(
    "SELECT * FROM tickets WHERE guild_id = $1 AND opener_id = $2 AND status = 'open'",
    [guildId, userId]
  );
  return res.rows.map(rowToTicket);
}

export async function getOpenTicketsByUserCategory(
  guildId: string, userId: string, categoryKey: string
): Promise<Ticket[]> {
  const res = await pool.query(
    "SELECT * FROM tickets WHERE guild_id = $1 AND opener_id = $2 AND category_key = $3 AND status = 'open'",
    [guildId, userId, categoryKey]
  );
  return res.rows.map(rowToTicket);
}

export async function getAllOpenTickets(guildId: string): Promise<Ticket[]> {
  const res = await pool.query(
    "SELECT * FROM tickets WHERE guild_id = $1 AND status = 'open' ORDER BY open_at ASC",
    [guildId]
  );
  return res.rows.map(rowToTicket);
}

export async function getAllTicketsForUser(guildId: string, userId: string): Promise<Ticket[]> {
  const res = await pool.query(
    "SELECT * FROM tickets WHERE guild_id = $1 AND opener_id = $2 ORDER BY open_at DESC",
    [guildId, userId]
  );
  return res.rows.map(rowToTicket);
}

export async function updateTicket(id: number, updates: Partial<Omit<Ticket, "id">>): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (updates.claimerId    !== undefined) { fields.push(`claimer_id = $${i++}`);         values.push(updates.claimerId); }
  if (updates.claimerTag   !== undefined) { fields.push(`claimer_tag = $${i++}`);        values.push(updates.claimerTag); }
  if (updates.status       !== undefined) { fields.push(`status = $${i++}`);             values.push(updates.status); }
  if (updates.closeAt      !== undefined) { fields.push(`close_at = $${i++}`);           values.push(updates.closeAt); }
  if (updates.closeReason  !== undefined) { fields.push(`close_reason = $${i++}`);       values.push(updates.closeReason); }
  if (updates.transcriptUrl !== undefined){ fields.push(`transcript_url = $${i++}`);     values.push(updates.transcriptUrl); }
  if (updates.lastActivityAt !== undefined){ fields.push(`last_activity_at = $${i++}`);  values.push(updates.lastActivityAt); }
  if (updates.channelId    !== undefined) { fields.push(`channel_id = $${i++}`);         values.push(updates.channelId); }

  if (fields.length === 0) return;
  values.push(id);
  await pool.query(`UPDATE tickets SET ${fields.join(", ")} WHERE id = $${i}`, values);
}

export async function deleteTicketRecord(id: number): Promise<void> {
  await pool.query("DELETE FROM tickets WHERE id = $1", [id]);
}

export async function touchTicketActivity(channelId: string): Promise<void> {
  await pool.query(
    "UPDATE tickets SET last_activity_at = $1 WHERE channel_id = $2 AND status = 'open'",
    [Date.now(), channelId]
  );
}

// Ticket stats
export interface TicketStats {
  totalTickets: number;
  openTickets: number;
  closedTickets: number;
  avgResponseMs: number | null;
  busiestCategory: string | null;
}

export async function getGuildStats(guildId: string): Promise<TicketStats> {
  const total = await pool.query(
    "SELECT COUNT(*) FROM tickets WHERE guild_id = $1", [guildId]
  );
  const open = await pool.query(
    "SELECT COUNT(*) FROM tickets WHERE guild_id = $1 AND status = 'open'", [guildId]
  );
  const closed = await pool.query(
    "SELECT COUNT(*) FROM tickets WHERE guild_id = $1 AND status IN ('closed','archived')", [guildId]
  );
  const avgRes = await pool.query(
    `SELECT AVG(close_at - open_at) as avg_ms
     FROM tickets WHERE guild_id = $1 AND close_at IS NOT NULL`, [guildId]
  );
  const busiest = await pool.query(
    `SELECT category_key, COUNT(*) as cnt FROM tickets
     WHERE guild_id = $1 GROUP BY category_key ORDER BY cnt DESC LIMIT 1`, [guildId]
  );
  return {
    totalTickets:    Number(total.rows[0]?.count ?? 0),
    openTickets:     Number(open.rows[0]?.count ?? 0),
    closedTickets:   Number(closed.rows[0]?.count ?? 0),
    avgResponseMs:   avgRes.rows[0]?.avg_ms != null ? Math.round(Number(avgRes.rows[0].avg_ms)) : null,
    busiestCategory: (busiest.rows[0]?.category_key as string) ?? null,
  };
}

// Participants
export async function addParticipant(ticketId: number, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO ticket_participants (ticket_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [ticketId, userId]
  );
}

export async function removeParticipant(ticketId: number, userId: string): Promise<void> {
  await pool.query(
    "DELETE FROM ticket_participants WHERE ticket_id = $1 AND user_id = $2",
    [ticketId, userId]
  );
}

export async function getParticipants(ticketId: number): Promise<string[]> {
  const res = await pool.query(
    "SELECT user_id FROM ticket_participants WHERE ticket_id = $1", [ticketId]
  );
  return res.rows.map((r) => r["user_id"] as string);
}

// Feedback
export async function saveFeedback(fb: TicketFeedback): Promise<void> {
  await pool.query(
    `INSERT INTO ticket_feedback (ticket_id, user_id, rating, comment)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (ticket_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment`,
    [fb.ticketId, fb.userId, fb.rating, fb.comment ?? null]
  );
}

export async function getFeedback(ticketId: number): Promise<TicketFeedback | null> {
  const res = await pool.query(
    "SELECT * FROM ticket_feedback WHERE ticket_id = $1", [ticketId]
  );
  if (!res.rows[0]) return null;
  const r = res.rows[0];
  return { ticketId: r["ticket_id"] as number, userId: r["user_id"] as string, rating: r["rating"] as number, comment: r["comment"] as string | null };
}

// Panel message IDs (persisted so panels survive restarts)
export async function savePanelMessageId(guildId: string, panelName: string, messageId: string): Promise<void> {
  await dbSet(PANEL_MSG_STORE, `${guildId}:${panelName}`, { messageId });
}

export async function getPanelMessageId(guildId: string, panelName: string): Promise<string | null> {
  const d = await dbGet<{ messageId: string }>(PANEL_MSG_STORE, `${guildId}:${panelName}`);
  return d?.messageId ?? null;
}

// Blacklist
export async function addTicketBlacklist(guildId: string, entry: TicketBlacklistEntry): Promise<void> {
  await dbSet(BLACKLIST_STORE, `${guildId}:${entry.userId}`, entry);
}

export async function removeTicketBlacklist(guildId: string, userId: string): Promise<boolean> {
  const existing = await dbGet<TicketBlacklistEntry>(BLACKLIST_STORE, `${guildId}:${userId}`);
  if (!existing) return false;
  await dbDelete(BLACKLIST_STORE, `${guildId}:${userId}`);
  return true;
}

export async function isTicketBlacklisted(guildId: string, userId: string): Promise<TicketBlacklistEntry | null> {
  return dbGet<TicketBlacklistEntry>(BLACKLIST_STORE, `${guildId}:${userId}`);
}

export async function listTicketBlacklist(guildId: string): Promise<TicketBlacklistEntry[]> {
  const all = await dbGetAll<TicketBlacklistEntry>(BLACKLIST_STORE);
  return all.filter(({ key }) => key.startsWith(`${guildId}:`)).map(({ data }) => data);
}

// Auto-close: tickets inactive for too long
export async function getTicketsInactiveFor(guildId: string, thresholdMs: number): Promise<Ticket[]> {
  const cutoff = Date.now() - thresholdMs;
  const res = await pool.query(
    `SELECT * FROM tickets WHERE guild_id = $1 AND status = 'open' AND last_activity_at < $2`,
    [guildId, cutoff]
  );
  return res.rows.map(rowToTicket);
}
