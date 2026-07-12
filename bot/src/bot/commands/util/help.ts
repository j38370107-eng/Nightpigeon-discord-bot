import { Client, Message, EmbedBuilder } from "discord.js";
import type { Command } from "../types";
import { getCachedConfig } from "../../store/guildConfig";
import { getUserLevel, getRequiredLevel, LEVEL_UNCONFIGURED, OWNER_LEVEL, canUseCommand } from "../../lib/yamlLevels";

const BOT_WEBSITE = "https://nightpigeon.xyz";

/** All commands the help system knows about, with friendly metadata. */
const COMMAND_META: Record<string, { description: string; usage: string }> = {
  // Moderation
  warn:              { description: "Warn a member.",                                           usage: "@user [reason]"                   },
  forcewarn:         { description: "Warn a user by ID (not in server).",                       usage: "<user_id> [reason]"               },
  kick:              { description: "Kick a member from the server.",                           usage: "@user [reason]"                   },
  ban:               { description: "Ban a member. Add a duration for a temp ban (e.g. 7d).",   usage: "@user [duration] [reason]"        },
  forceban:          { description: "Ban a user by ID — even if not in the server.",            usage: "<user_id> [duration] [reason]"    },
  unban:             { description: "Unban a user by ID.",                                      usage: "<user_id> [reason]"               },
  tempban:           { description: "Temporarily ban a member.",                                usage: "@user <duration> [reason]"        },
  softban:           { description: "Ban and immediately unban to purge recent messages.",      usage: "@user [reason]"                   },
  baninfo:           { description: "Show ban details for a user.",                             usage: "@user|<user_id>"                  },
  banlist:           { description: "List all current bans in the server.",                     usage: ""                                 },
  mute:              { description: "Mute a member (Discord timeout or mute role).",            usage: "@user [duration] [reason]"        },
  forcemute:         { description: "Mute a user by ID.",                                       usage: "<user_id> [duration] [reason]"    },
  unmute:            { description: "Unmute a member.",                                         usage: "@user [reason]"                   },
  forceunmute:       { description: "Unmute a user by ID.",                                     usage: "<user_id> [reason]"               },
  tempmute:          { description: "Temporarily mute a member.",                               usage: "@user <duration> [reason]"        },
  mutelist:          { description: "List currently muted members.",                            usage: ""                                 },
  muteinfo:          { description: "Show mute details for a member.",                          usage: "@user"                            },
  purge:             { description: "Bulk delete up to 100 messages.",                          usage: "<amount> [@user]"                 },
  slowmode:          { description: "Set or remove slowmode in a channel.",                     usage: "<seconds|off> [#channel]"         },
  slowmodeinfo:      { description: "Show current slowmode settings for a channel.",            usage: "[#channel]"                       },
  lock:              { description: "Lock a channel so @everyone cannot send messages.",        usage: "[#channel] [reason]"              },
  unlock:            { description: "Unlock a previously locked channel.",                      usage: "[#channel]"                       },
  hide:              { description: "Hide a channel from @everyone.",                           usage: "[#channel]"                       },
  unhide:            { description: "Unhide a previously hidden channel.",                      usage: "[#channel]"                       },
  nick:              { description: "Change a member's nickname.",                              usage: "@user <nickname>"                 },
  resetnick:         { description: "Reset a member's nickname.",                               usage: "@user"                            },
  locknick:          { description: "Lock a member's nickname.",                                usage: "@user"                            },
  unlocknick:        { description: "Unlock a member's nickname.",                              usage: "@user"                            },
  modnick:           { description: "Set an enforced nickname for a member.",                   usage: "@user <nickname>"                 },
  watch:             { description: "Add a user to the watchlist.",                             usage: "@user [reason]"                   },
  unwatch:           { description: "Remove a user from the watchlist.",                        usage: "@user"                            },
  watchlist:         { description: "Show all watched users.",                                  usage: ""                                 },
  roleban:           { description: "Prevent a user from holding a role.",                      usage: "@user @role [reason]"             },
  unroleban:         { description: "Remove a roleban from a user.",                            usage: "@user @role"                      },
  rolebanned:        { description: "Show rolebanned roles for a user.",                        usage: "@user"                            },
  addrole:           { description: "Add a role to a member.",                                  usage: "@user @role"                      },
  removerole:        { description: "Remove a role from a member.",                             usage: "@user @role"                      },
  temprole:          { description: "Give a member a role temporarily.",                        usage: "@user @role <duration>"           },
  temproles:         { description: "List active temporary roles for a user.",                  usage: "@user"                            },
  raidmode:          { description: "Toggle or configure raid mode.",                           usage: "[on|off]"                         },
  escalation:        { description: "Manage punishment escalation tiers.",                      usage: "<subcommand> [args]"              },
  "automod-escalation": { description: "Manage automod escalation rules.",                     usage: "<subcommand> [args]"              },
  // Mass actions
  masswarn:          { description: "Warn multiple members at once.",                           usage: "@user1 @user2 ... | <reason>"     },
  massforcewarn:     { description: "Warn multiple users by ID at once.",                       usage: "<id1> <id2> ... | <reason>"       },
  massmute:          { description: "Mute multiple members at once.",                           usage: "@user1 @user2 ... [dur] | reason" },
  massforcemute:     { description: "Mute multiple users by ID at once.",                       usage: "<id1> <id2> ... [dur] | reason"   },
  massunmute:        { description: "Unmute multiple members at once.",                         usage: "@user1 @user2 ... | [reason]"     },
  masskick:          { description: "Kick multiple members at once.",                           usage: "@user1 @user2 ... | <reason>"     },
  massban:           { description: "Ban multiple members at once.",                            usage: "@user1 @user2 ... [dur] | reason" },
  massforceban:      { description: "Ban multiple users by ID at once.",                        usage: "<id1> <id2> ... [dur] | reason"   },
  massunban:         { description: "Unban multiple users by ID at once.",                      usage: "<id1> <id2> ... | [reason]"       },
  // Cases
  case:              { description: "View a specific case by ID.",                              usage: "<case_id>"                        },
  cases:             { description: "View all cases for a user, or the last 20 server-wide.",  usage: "[@user]"                          },
  servercases:       { description: "Show the most recent cases in this server.",               usage: "[page]"                           },
  addcase:           { description: "Manually create a case.",                                  usage: "@user <action> [reason]"          },
  editcase:          { description: "Edit a case reason.",                                      usage: "<case_id> <new reason>"           },
  deletecase:        { description: "Permanently delete a case.",                               usage: "<case_id>"                        },
  casecount:         { description: "Show case counts for a user.",                             usage: "@user"                            },
  exportcases:       { description: "Export all cases for a user as CSV.",                      usage: "@user"                            },
  casesearch:        { description: "Search mod cases by keyword.",                             usage: "<keyword>"                        },
  // Notes
  note:              { description: "Add a private staff note to a user.",                      usage: "@user <text>"                     },
  forcenote:         { description: "Add a note to a user by ID.",                              usage: "<user_id> <text>"                 },
  viewnote:          { description: "View a specific note by ID.",                              usage: "<note_id>"                        },
  viewnotes:         { description: "View all notes for a user.",                               usage: "@user"                            },
  deletenote:        { description: "Delete a note from a user.",                               usage: "<note_id>"                        },
  notesearch:        { description: "Search notes by keyword.",                                 usage: "<keyword>"                        },
  editnote:          { description: "Edit an existing note.",                                   usage: "<note_id> <new text>"             },
  // Utility
  ping:              { description: "Check the bot's WebSocket and API latency.",              usage: ""                                 },
  tag:               { description: "Post a saved server tag.",                                 usage: "<tagname>"                        },
  userinfo:          { description: "Show information about a user.",                           usage: "[@user]"                          },
  avatar:            { description: "Show a user's avatar.",                                    usage: "[@user]"                          },
  banner:            { description: "Show a user's profile banner.",                            usage: "[@user]"                          },
  roles:             { description: "List roles for a user, or all server roles.",              usage: "[@user]"                          },
  joined:            { description: "Show when a user joined the server.",                      usage: "[@user]"                          },
  firstmsg:          { description: "Link to the first message in a channel.",                  usage: "[@user] [#channel]"               },
  warncount:         { description: "Show how many warns a user has.",                          usage: "[@user]"                          },
  modstats:          { description: "Show moderation stats for a moderator.",                   usage: "[@mod]"                           },
  serverinfo:        { description: "Show information about this server.",                      usage: ""                                 },
  channelinfo:       { description: "Show information about a channel.",                        usage: "[#channel]"                       },
  roleinfo:          { description: "Show information about a role.",                           usage: "<@role>"                          },
  membercount:       { description: "Show the current member count.",                           usage: ""                                 },
  botstats:          { description: "Show bot uptime, ping, memory, and server count.",         usage: ""                                 },
  botinfo:           { description: "Show bot version and info.",                               usage: ""                                 },
  inviteinfo:        { description: "Show information about a Discord invite code.",            usage: "<code>"                           },
  snowflake:         { description: "Decode a Discord snowflake ID to its creation date.",      usage: "<id>"                             },
  inrole:            { description: "List all members with a specific role.",                   usage: "<@role>"                          },
  charcount:         { description: "Count characters, words, and lines in text.",              usage: "<text>"                           },
  embed:             { description: "Send a custom embed from a JSON object.",                  usage: "<json>"                           },
  seen:              { description: "Show when a user was last active.",                        usage: "@user"                            },
  level:             { description: "Show your or another user's permission level.",            usage: "[@user]"                          },
  levels:            { description: "Show the full level configuration.",                       usage: ""                                 },
  help:              { description: "List commands or get details on one command.",             usage: "[command]"                        },
  // Timezone
  timezone:          { description: "Set your timezone or look up another user's.",             usage: "set <tz> | get [@user]"           },
  time:              { description: "Show the current time for a user in their timezone.",      usage: "[@user]"                          },
  timefor:           { description: "Show the current time in a given timezone.",               usage: "<timezone>"                       },
  timeconvert:       { description: "Convert a time between two timezones.",                    usage: "<time> <from_tz> <to_tz>"         },
  // Reminders
  remind:            { description: "Set a personal reminder.",                                 usage: "<duration> <message>"             },
  reminders:         { description: "List your active reminders.",                              usage: ""                                 },
  delreminder:       { description: "Delete a reminder by ID.",                                 usage: "<id>"                             },
  // Tickets
  ticket:            { description: "Manage the ticket system (panels, close, claim, etc.).",  usage: "<subcommand> [args]"               },
  // Automation
  autoclean:         { description: "Configure automatic channel cleanup rules.",               usage: "<subcommand> [args]"               },
  autoreaction:      { description: "Auto-react to messages matching a trigger.",               usage: "<subcommand> [args]"               },
  autoreply:         { description: "Auto-reply to messages matching a trigger.",               usage: "<subcommand> [args]"               },
  // Reaction roles
  rr:                { description: "Manage reaction roles (add, remove, list).",              usage: "<subcommand> [args]"               },
  // Starboard
  starboard:         { description: "Manage the starboard (top, stats, info, force, ignore, lock, etc.).", usage: "<subcommand> [args]" },
  // Welcome plugin
  welcome:           { description: "Preview the welcome message in the welcome channel.",      usage: "test"                             },
  goodbye:           { description: "Preview the goodbye message in the goodbye channel.",      usage: "test"                             },
  welcomedm:         { description: "Preview the join DM — sends it to your own DMs.",         usage: "test"                             },
  invites:           { description: "Show invite count for yourself or another user.",          usage: "[@user]"                          },
  inviteleaderboard: { description: "Show the top 15 inviters in this server.",                usage: ""                                 },
  invitereset:       { description: "Reset a user's invite count to zero.",                     usage: "@user"                            },
};

const helpCmd: Command = {
  name: "help",
  aliases: [],
  usage: "[command]",
  description: "List commands or get details on one command.",
  public: true,
  async execute(message: Message, args: string[], _client: Client) {
    if (!message.guild) return;

    const cfg = getCachedConfig(message.guild.id);
    const prefix = cfg.prefix ?? "!";
    const userLevel = getUserLevel(message);

    // !help <command>
    const queryName = args[0]?.toLowerCase();
    if (queryName) {
      const yamlAliases: Record<string, string> = cfg.plugins?.command_aliases?.config?.aliases ?? {};

      // Resolve: direct command name, or a guild alias pointing to a command
      const resolvedName = (() => {
        if (COMMAND_META[queryName]) return queryName;
        const target = yamlAliases[queryName];
        if (target && COMMAND_META[target]) return target;
        return null;
      })();

      if (!resolvedName) return void message.reply(`❌ Unknown command \`${queryName}\`. Use \`${prefix}help\` to see all commands.`);

      const meta = COMMAND_META[resolvedName]!;

      // Only guild-configured aliases — no hardcoded ones
      const guildAliases = Object.entries(yamlAliases)
        .filter(([, target]) => target === resolvedName)
        .map(([alias]) => alias);

      const required = getRequiredLevel(message.guild.id, resolvedName);
      const configured = required < LEVEL_UNCONFIGURED;
      const isOwnerUser = userLevel >= OWNER_LEVEL;
      const accessible = canUseCommand(required, userLevel);

      const embed = new EmbedBuilder()
        .setColor(accessible ? 0x5865f2 : 0x4a4a4a)
        .setTitle(`${prefix}${resolvedName}`)
        .setDescription(meta.description)
        .addFields(
          { name: "Usage",          value: `\`${prefix}${resolvedName} ${meta.usage}\``, inline: false },
          { name: "Aliases",        value: guildAliases.length ? guildAliases.map(a => `\`${prefix}${a}\``).join(", ") : "None", inline: true },
          { name: "Required Level", value: configured ? String(required) : (isOwnerUser ? "Not configured (owner override)" : "Not configured"), inline: true },
          { name: "Your Level",     value: String(userLevel), inline: true },
          { name: "Status",         value: accessible ? "✅ You can use this" : (configured ? "🔒 Insufficient level" : "⚙️ Not enabled — add to your config"), inline: false }
        );

      if (!configured && !isOwnerUser) {
        embed.setFooter({ text: `Configure at ${BOT_WEBSITE}` });
      }

      return void await message.channel.send({ embeds: [embed] });
    }

    // !help (list)
    const enabledNames = Object.keys(COMMAND_META).filter((name) => {
      const required = getRequiredLevel(message.guild!.id, name);
      return canUseCommand(required, userLevel);
    });

    const tags = Object.keys(cfg.tags ?? {}).filter((tagName) => {
      const required = cfg.levels.commands[tagName] ?? 0;
      return userLevel >= required;
    });
    const nonHelpEnabled = enabledNames.filter(n => n !== "help");

    if (nonHelpEnabled.length === 0 && tags.length === 0) {
      return void await message.reply(
        `⚙️ This server hasn't configured any commands yet.\nVisit the dashboard to set up your bot: <${BOT_WEBSITE}>`
      );
    }

    // Group by category
    const modNames    = enabledNames.filter(n => [
      "warn","forcewarn","kick",
      "ban","forceban","unban","tempban","softban","baninfo","banlist",
      "mute","forcemute","unmute","forceunmute","tempmute","mutelist","muteinfo",
      "purge","slowmode","slowmodeinfo",
      "lock","unlock","hide","unhide",
      "nick","resetnick","locknick","unlocknick","modnick",
      "watch","unwatch","watchlist",
      "roleban","unroleban","rolebanned",
      "addrole","removerole","temprole","temproles",
      "raidmode","escalation","automod-escalation",
    ].includes(n));

    const massNames   = enabledNames.filter(n => [
      "masswarn","massforcewarn","massmute","massforcemute","massunmute",
      "masskick","massban","massforceban","massunban",
    ].includes(n));

    const caseNames   = enabledNames.filter(n => [
      "case","cases","servercases","addcase","editcase","deletecase",
      "casecount","exportcases","casesearch",
    ].includes(n));

    const noteNames   = enabledNames.filter(n => [
      "note","forcenote","viewnote","viewnotes","deletenote","notesearch","editnote",
    ].includes(n));

    const utilNames   = enabledNames.filter(n => [
      "ping","tag","userinfo","avatar","banner","roles","joined","firstmsg",
      "warncount","modstats",
      "serverinfo","channelinfo","roleinfo","membercount","botstats","botinfo",
      "inviteinfo","snowflake","inrole","charcount","embed","seen",
      "level","levels",
      "timezone","time","timefor","timeconvert",
      "remind","reminders","delreminder",
      "help",
    ].includes(n));

    const pluginNames = enabledNames.filter(n => [
      "ticket","autoclean","autoreaction","autoreply","rr","starboard",
      "welcome","goodbye","welcomedm","invites","inviteleaderboard","invitereset",
    ].includes(n));

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📖 Commands")
      .setDescription(`Prefix: \`${prefix}\` · Your level: **${userLevel}** · Use \`${prefix}help <command>\` for details`)
      .setFooter({ text: BOT_WEBSITE });

    if (modNames.length)    embed.addFields({ name: "⚔️ Moderation",   value: modNames.map(n    => `\`${prefix}${n}\``).join("  ") });
    if (massNames.length)   embed.addFields({ name: "💥 Mass Actions", value: massNames.map(n   => `\`${prefix}${n}\``).join("  ") });
    if (caseNames.length)   embed.addFields({ name: "📋 Cases",        value: caseNames.map(n   => `\`${prefix}${n}\``).join("  ") });
    if (noteNames.length)   embed.addFields({ name: "📝 Notes",        value: noteNames.map(n   => `\`${prefix}${n}\``).join("  ") });
    if (utilNames.length)   embed.addFields({ name: "🔧 Utility",      value: utilNames.map(n   => `\`${prefix}${n}\``).join("  ") });
    if (pluginNames.length) embed.addFields({ name: "🔌 Plugins",      value: pluginNames.map(n => `\`${prefix}${n}\``).join("  ") });
    if (tags.length)        embed.addFields({ name: "🏷️ Tags",         value: tags.map(t        => `\`${prefix}${t}\``).join("  ") });

    await message.channel.send({ embeds: [embed] });
  },
};

export default helpCmd;
