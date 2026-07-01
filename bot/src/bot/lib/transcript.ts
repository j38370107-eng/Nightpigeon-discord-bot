import { TextChannel, AttachmentBuilder } from "discord.js";
import type { Ticket } from "../store/tickets";

// Plain text transcript
export async function generateTxtTranscript(
  channel: TextChannel,
  ticket: Ticket
): Promise<AttachmentBuilder> {
  const messages = await fetchAllMessages(channel);
  const openDate  = new Date(ticket.openAt).toUTCString();
  const closeDate = new Date().toUTCString();
  const durationMs = Date.now() - ticket.openAt;
  const durationStr = msToHuman(durationMs);

  const lines: string[] = [
    `╔═══════════════════════════════════════════════════════════════╗`,
    `  TICKET TRANSCRIPT`,
    `╚═══════════════════════════════════════════════════════════════╝`,
    `  Ticket #:   ${String(ticket.number).padStart(4, "0")}`,
    `  Category:   ${ticket.categoryKey}`,
    `  Channel:    #${channel.name}`,
    `  Opened by:  ${ticket.openerTag} (${ticket.openerId})`,
    `  Opened at:  ${openDate}`,
    `  Closed at:  ${closeDate}`,
    `  Duration:   ${durationStr}`,
    ticket.claimerId
      ? `  Claimed by: ${ticket.claimerTag} (${ticket.claimerId})`
      : `  Claimed by: Unclaimed`,
    ticket.closeReason
      ? `  Close reason: ${ticket.closeReason}`
      : "",
    `  Messages:   ${messages.length}`,
    ``,
    `───────────────────────────────────────────────────────────────`,
    ``,
  ].filter((l) => l !== undefined);

  for (const msg of messages) {
    if (msg.author.bot && !msg.content && msg.embeds.length === 0) continue;
    const time = new Date(msg.createdTimestamp).toUTCString();
    const content = msg.content || (msg.embeds.length ? `[embed: ${msg.embeds[0]?.title ?? "no title"}]` : "[no content]");
    lines.push(`[${time}] ${msg.author.tag}`);
    lines.push(`  ${content}`);
    for (const att of msg.attachments.values()) {
      lines.push(`  📎 ${att.name}: ${att.url}`);
    }
    lines.push("");
  }

  const buffer = Buffer.from(lines.join("\n"), "utf8");
  return new AttachmentBuilder(buffer, { name: `transcript-${channel.name}.txt` });
}

// HTML transcript
export async function generateHtmlTranscript(
  channel: TextChannel,
  ticket: Ticket
): Promise<AttachmentBuilder> {
  const messages = await fetchAllMessages(channel);
  const openDate  = new Date(ticket.openAt).toUTCString();
  const closeDate = new Date().toUTCString();
  const durationMs = Date.now() - ticket.openAt;

  const rows = messages
    .filter((m) => !(m.author.bot && !m.content && m.embeds.length === 0))
    .map((msg) => {
      const time    = new Date(msg.createdTimestamp).toLocaleString();
      const isBot   = msg.author.bot;
      const avatarUrl = msg.author.displayAvatarURL({ extension: "png", size: 64 });
      const escapedContent = escHtml(msg.content || "");
      const attachments = [...msg.attachments.values()]
        .map((a) => `<a class="attachment" href="${a.url}" target="_blank">📎 ${escHtml(a.name ?? "file")}</a>`)
        .join("");
      const embeds = msg.embeds.map((e) => {
        const color = e.color ? `#${e.color.toString(16).padStart(6, "0")}` : "#5865F2";
        return `<div class="embed" style="border-left:4px solid ${color}">
          ${e.title ? `<div class="embed-title">${escHtml(e.title)}</div>` : ""}
          ${e.description ? `<div class="embed-desc">${escHtml(e.description)}</div>` : ""}
        </div>`;
      }).join("");

      return `
      <div class="message ${isBot ? "bot" : ""}">
        <img class="avatar" src="${avatarUrl}" alt="" onerror="this.style.display='none'">
        <div class="content">
          <div class="meta">
            <span class="author ${isBot ? "bot-tag" : ""}">${escHtml(msg.author.tag)}</span>
            ${isBot ? '<span class="badge">BOT</span>' : ""}
            <span class="timestamp">${time}</span>
          </div>
          ${escapedContent ? `<div class="text">${escapedContent}</div>` : ""}
          ${embeds}
          ${attachments ? `<div class="attachments">${attachments}</div>` : ""}
        </div>
      </div>`;
    }).join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ticket Transcript — #${channel.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "gg sans","Noto Sans",Arial,sans-serif; background:#313338; color:#dbdee1; font-size:14px; }
    .header { background:#1e1f22; padding:20px 24px; border-bottom:1px solid #1a1b1e; }
    .header h1 { color:#fff; font-size:20px; margin-bottom:8px; }
    .header .meta { color:#b5bac1; font-size:13px; line-height:1.6; }
    .header .meta span { display:inline-block; margin-right:20px; }
    .header .label { color:#b5bac1; font-size:11px; text-transform:uppercase; letter-spacing:.5px; }
    .messages { padding:16px 24px; max-width:900px; margin:0 auto; }
    .message { display:flex; gap:12px; padding:4px 0 4px 0; margin:2px 0; border-radius:4px; }
    .message:hover { background:#2e3035; }
    .avatar { width:40px; height:40px; border-radius:50%; flex-shrink:0; margin-top:2px; }
    .content { flex:1; min-width:0; }
    .meta { display:flex; align-items:baseline; gap:8px; margin-bottom:2px; }
    .author { font-weight:600; color:#f2f3f5; }
    .author.bot-tag { color:#5865f2; }
    .badge { background:#5865f2; color:#fff; font-size:10px; font-weight:700; padding:1px 5px; border-radius:3px; text-transform:uppercase; letter-spacing:.5px; }
    .timestamp { color:#80848e; font-size:11px; }
    .text { color:#dbdee1; line-height:1.5; white-space:pre-wrap; word-break:break-word; }
    .embed { background:#2b2d31; border-left:4px solid #5865f2; border-radius:0 4px 4px 0; padding:10px 14px; margin-top:4px; max-width:520px; }
    .embed-title { font-weight:600; color:#fff; margin-bottom:4px; }
    .embed-desc { color:#dbdee1; font-size:13px; line-height:1.5; white-space:pre-wrap; }
    .attachments { margin-top:6px; display:flex; flex-wrap:wrap; gap:6px; }
    .attachment { color:#00aff4; text-decoration:none; font-size:13px; }
    .attachment:hover { text-decoration:underline; }
    .footer { background:#1e1f22; padding:14px 24px; text-align:center; color:#80848e; font-size:12px; border-top:1px solid #1a1b1e; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📄 Ticket Transcript — #${escHtml(channel.name)}</h1>
    <div class="meta">
      <span><span class="label">Ticket #</span> ${String(ticket.number).padStart(4, "0")}</span>
      <span><span class="label">Category</span> ${escHtml(ticket.categoryKey)}</span>
      <span><span class="label">Opened by</span> ${escHtml(ticket.openerTag)}</span>
      <span><span class="label">Duration</span> ${escHtml(msToHuman(durationMs))}</span>
      <span><span class="label">Messages</span> ${messages.length}</span>
    </div>
    <div class="meta" style="margin-top:6px">
      <span><span class="label">Opened</span> ${openDate}</span>
      <span><span class="label">Closed</span> ${closeDate}</span>
      ${ticket.closeReason ? `<span><span class="label">Reason</span> ${escHtml(ticket.closeReason)}</span>` : ""}
    </div>
  </div>
  <div class="messages">
    ${rows || '<p style="color:#80848e;padding:20px 0">No messages found.</p>'}
  </div>
  <div class="footer">Generated by NightPigeon • ${new Date().toUTCString()}</div>
</body>
</html>`;

  const buffer = Buffer.from(html, "utf8");
  return new AttachmentBuilder(buffer, { name: `transcript-${channel.name}.html` });
}

// Auto-select format
export async function generateTranscript(
  channel: TextChannel,
  ticket: Ticket,
  format: "html" | "txt" = "txt"
): Promise<AttachmentBuilder> {
  if (format === "html") return generateHtmlTranscript(channel, ticket);
  return generateTxtTranscript(channel, ticket);
}

// Helpers
async function fetchAllMessages(channel: TextChannel) {
  const allMessages = [];
  let lastId: string | undefined;
  // Fetch up to 500 messages (5 batches of 100)
  for (let i = 0; i < 5; i++) {
    const batch = await channel.messages.fetch({ limit: 100, before: lastId });
    if (batch.size === 0) break;
    allMessages.push(...batch.values());
    lastId = batch.last()?.id;
    if (batch.size < 100) break;
  }
  return allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function msToHuman(ms: number): string {
  if (ms < 60_000)      return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000)   return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000)  return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}
