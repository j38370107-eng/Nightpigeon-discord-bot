import { Client, MessageCreateOptions, TextChannel, WebhookClient } from "discord.js";
import { logger } from "../../lib/logger";

const WEBHOOK_NAME = "NightPigeon Logs";

// Cache webhook clients by channel ID so we don't hit the API on every log
const webhookCache = new Map<string, WebhookClient>();

async function getOrCreateWebhook(client: Client, channel: TextChannel): Promise<WebhookClient | null> {
  const cached = webhookCache.get(channel.id);
  if (cached) return cached;

  try {
    const webhooks = await channel.fetchWebhooks();
    // Reuse an existing webhook we own with the right name
    let wh = webhooks.find(
      (w) => w.owner?.id === client.user?.id && w.name === WEBHOOK_NAME && !!w.token
    );

    if (!wh) {
      wh = await channel.createWebhook({
        name: WEBHOOK_NAME,
        avatar: client.user?.displayAvatarURL() ?? undefined,
        reason: "NightPigeon logging webhook",
      });
    }

    if (!wh.token) return null;

    const whClient = new WebhookClient({ id: wh.id, token: wh.token });
    webhookCache.set(channel.id, whClient);
    return whClient;
  } catch (err) {
    logger.warn({ err, channelId: channel.id }, "Could not get/create webhook — will send directly");
    return null;
  }
}

/**
 * Send a log payload via a webhook in the given channel.
 * The bot auto-creates a webhook named "NightPigeon Logs" if one doesn't exist.
 * Falls back to channel.send() if webhooks are unavailable (missing permissions, etc.).
 */
export async function sendViaWebhook(
  client: Client,
  channel: TextChannel,
  payload: MessageCreateOptions
): Promise<void> {
  let wh = await getOrCreateWebhook(client, channel);

  const whPayload = {
    ...payload,
    username: WEBHOOK_NAME,
    avatarURL: client.user?.displayAvatarURL() ?? undefined,
  };

  if (!wh) {
    // No webhook available — fall back to direct send
    await channel.send(payload).catch((err) =>
      logger.error({ err, channelId: channel.id }, "Fallback channel.send failed")
    );
    return;
  }

  try {
    await wh.send(whPayload);
  } catch (err: any) {
    // Unknown webhook (10015) means it was deleted — clear cache and retry once
    if (err?.code === 10015) {
      webhookCache.delete(channel.id);
      const fresh = await getOrCreateWebhook(client, channel);
      if (fresh) {
        await fresh.send(whPayload).catch((e) =>
          logger.error({ e, channelId: channel.id }, "Retry webhook send failed")
        );
      } else {
        await channel.send(payload).catch(() => {});
      }
    } else {
      logger.error({ err, channelId: channel.id }, "Webhook send failed — falling back");
      await channel.send(payload).catch(() => {});
    }
  }
}
