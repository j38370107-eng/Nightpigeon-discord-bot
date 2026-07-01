import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    userTag?: string;
    userAvatar?: string;
    accessToken?: string;
    guilds?: Array<{
      id: string;
      name: string;
      icon?: string;
      owner: boolean;
      permissions: string;
    }>;
  }
}
