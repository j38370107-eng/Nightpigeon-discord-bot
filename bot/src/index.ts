import app from "./app";
import { logger } from "./lib/logger";
import { initBotStores, startBot } from "./bot";
import { setStatsClient } from "./routes/stats";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

initBotStores()
  .catch((err) => logger.error({ err }, "Failed to initialise bot stores"))
  .then(() => startBot())
  .then((client) => {
    if (client) setStatsClient(client);

    function shutdown(signal: string) {
      logger.info({ signal }, "Shutting down gracefully...");
      if (client) {
        client.destroy();
        logger.info("Discord client destroyed");
      }
      server.close(() => {
        logger.info("HTTP server closed");
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 5000).unref();
    }

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  })
  .catch((err) => {
    const msg = err?.message ?? String(err);
    if (msg.includes("disallowed intents") || msg.includes("4014")) {
      logger.error("Discord login failed: privileged intents are not enabled in the Discord Developer Portal. Enable Server Members Intent, Message Content Intent under your app's Bot settings.");
    } else if (msg.includes("TOKEN_INVALID") || msg.includes("Invalid token")) {
      logger.error("Discord login failed: the DISCORD_BOT_TOKEN is invalid or revoked. Reset it in the Discord Developer Portal.");
    } else {
      logger.error({ err }, "Discord login failed");
    }
    process.exit(1);
  });
