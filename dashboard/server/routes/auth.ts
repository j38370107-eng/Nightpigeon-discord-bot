import { Router } from "express";
import { exchangeCode, getMe, getMyGuilds, getBotGuilds, hasManageGuild } from "../discord.js";

const OWNER_ID = "1216140996463689810";

const router = Router();

function getRedirectUri(req: any): string {
  const raw = process.env["DASHBOARD_URL"] ?? `https://${req.hostname}`;
  const base = raw.trim().replace(/\/+$/, ""); // strip whitespace + trailing slashes
  return `${base}/api/auth/callback`;
}

router.get("/debug-redirect", (req: any, res: any) => {
  const redirectUri = getRedirectUri(req);
  res.json({
    redirectUri,
    DASHBOARD_URL: process.env["DASHBOARD_URL"] ?? "(not set — falling back to hostname)",
    hostname: req.hostname,
  });
});

router.get("/login", (req: any, res: any) => {
  const clientId = process.env["DISCORD_CLIENT_ID"];
  if (!clientId) return res.status(500).json({ error: "DISCORD_CLIENT_ID not configured" });

  // Save where to return after OAuth (used by apply page)
  if (req.query.returnTo) {
    req.session.returnTo = req.query.returnTo as string;
  }

  const redirectUri = encodeURIComponent(getRedirectUri(req));
  const scopes = encodeURIComponent("identify guilds");
  const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scopes}&prompt=consent`;
  res.redirect(url);
});

router.get("/callback", async (req: any, res: any) => {
  const { code, error } = req.query as { code?: string; error?: string };
  if (error || !code) return res.redirect("/?error=access_denied");

  try {
    const redirectUri = getRedirectUri(req);
    const tokens = await exchangeCode(code, redirectUri);
    const user = await getMe(tokens.access_token);

    req.session.userId = user.id;
    req.session.userTag = user.global_name ?? `${user.username}#${user.discriminator}`;
    req.session.userAvatar = user.avatar;
    req.session.accessToken = tokens.access_token;

    if (user.id === OWNER_ID) {
      const botToken = process.env["DISCORD_BOT_TOKEN"];
      const [botGuilds, userGuilds] = await Promise.all([
        botToken ? getBotGuilds(botToken) : Promise.resolve([]),
        getMyGuilds(tokens.access_token),
      ]);
      const userGuildMap = new Map(userGuilds.map((g) => [g.id, g]));
      req.session.guilds = botGuilds.map((g) => {
        const mine = userGuildMap.get(g.id);
        return { ...g, debug: !(mine && hasManageGuild(mine.permissions)) };
      });
    } else {
      // Regular users: only see guilds where they are server owner
      // Staff access is granted per-guild by the server owner via the Access panel
      const guilds = await getMyGuilds(tokens.access_token);
      req.session.guilds = guilds.filter((g) => g.owner);
      req.session.staffAccess = user.id; // mark for guilds route to merge staff access
    }

    const returnTo = req.session.returnTo as string | undefined;
    if (returnTo) delete req.session.returnTo;

    await new Promise<void>((resolve, reject) =>
      req.session.save((err: unknown) => (err ? reject(err) : resolve()))
    );

    res.redirect(returnTo ?? "/servers");
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.redirect("/?error=oauth_failed");
  }
});

router.get("/me", (req: any, res: any) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
  res.json({
    id: req.session.userId,
    tag: req.session.userTag,
    avatar: req.session.userAvatar,
  });
});

router.get("/guilds", (req: any, res: any) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
  res.json(req.session.guilds ?? []);
});

router.post("/refresh-guilds", async (req: any, res: any) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
  const accessToken = req.session.accessToken;
  if (!accessToken) return res.status(401).json({ error: "No access token in session, please log in again" });
  try {
    if (req.session.userId === OWNER_ID) {
      const botToken = process.env["DISCORD_BOT_TOKEN"];
      const [botGuilds, userGuilds] = await Promise.all([
        botToken ? getBotGuilds(botToken) : Promise.resolve([]),
        getMyGuilds(accessToken),
      ]);
      const userGuildMap = new Map(userGuilds.map((g) => [g.id, g]));
      req.session.guilds = botGuilds.map((g) => {
        const mine = userGuildMap.get(g.id);
        return { ...g, debug: !(mine && hasManageGuild(mine.permissions)) };
      });
    } else {
      // Owner-only guilds + staff access guilds
      const guilds = await getMyGuilds(accessToken);
      req.session.guilds = guilds.filter((g) => g.owner);
      req.session.staffAccess = req.session.userId;
    }
    await new Promise<void>((resolve, reject) =>
      req.session.save((err: unknown) => (err ? reject(err) : resolve()))
    );
    res.json({ guilds: req.session.guilds });
  } catch {
    res.status(500).json({ error: "Failed to refresh server list from Discord" });
  }
});

router.post("/logout", (req: any, res: any) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

export default router;
