const fs = require("fs");
const path = require("path");
const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const cron = require("node-cron");

function createSecretRevealModule(client, config) {
  const {
    channelId,
    timezone = "Asia/Seoul",
    allowedUserIds = [],
    adminUserId = null,
    fileName = "secret-messages.json",
  } = config;

  const DATA_FILE = path.join(__dirname, fileName);

  let scheduled = false;

  function ensureFile() {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), "utf8");
    }
  }

  function readMessages() {
    try {
      ensureFile();
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error("❌ secret-messages.json 읽기 실패:", err);
      return [];
    }
  }

  function writeMessages(data) {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
    } catch (err) {
      console.error("❌ secret-messages.json 저장 실패:", err);
    }
  }

  function addMessage(item) {
    const list = readMessages();
    list.push(item);
    writeMessages(list);
  }

  function clearMessages() {
    writeMessages([]);
  }

  function getTodayKey() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);

    const y = parts.find(p => p.type === "year")?.value;
    const m = parts.find(p => p.type === "month")?.value;
    const d = parts.find(p => p.type === "day")?.value;
    return `${y}-${m}-${d}`;
  }

  function formatStoredName(user) {
    if (!user) return "익명";
    return user;
  }

  async function revealSecrets(force = false) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      console.error("❌ secret reveal 채널을 찾지 못했습니다.");
      return { ok: false, reason: "channel_not_found" };
    }

    const all = readMessages();
    if (all.length === 0) {
      return { ok: true, empty: true };
    }

    const todayKey = getTodayKey();
    const todayItems = all.filter(item => item.dateKey === todayKey);

    if (todayItems.length === 0 && !force) {
      return { ok: true, empty: true };
    }

    const targetItems = force ? all : todayItems;
    const remainItems = force ? [] : all.filter(item => item.dateKey !== todayKey);

    const lines = targetItems.map((item, idx) => {
      const author = item.anonymous ? `익명${idx + 1}` : formatStoredName(item.username);
      return `**${author}**\n>>> ${item.content}`;
    });

    const chunks = [];
    let current = "";

    for (const line of lines) {
      if ((current + "\n\n" + line).length > 3800) {
        chunks.push(current);
        current = line;
      } else {
        current = current ? `${current}\n\n${line}` : line;
      }
    }
    if (current) chunks.push(current);

    for (let i = 0; i < chunks.length; i++) {
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(i === 0 ? `🌙 오늘의 마지막 말 (${targetItems.length}개)` : `🌙 오늘의 마지막 말 (계속 ${i + 1}/${chunks.length})`)
        .setDescription(chunks[i])
        .setFooter({ text: force ? "관리자 수동 공개" : "23:59 자동 공개" })
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    }

    clearMessages();
    if (!force && remainItems.length > 0) {
      writeMessages(remainItems);
    }

    return { ok: true, count: targetItems.length };
  }

  function scheduleReveal() {
    if (scheduled) return;
    scheduled = true;

    cron.schedule(
      "59 23 * * *",
      async () => {
        try {
          await revealSecrets(false);
        } catch (err) {
          console.error("❌ 23:59 비밀말 공개 실패:", err);
        }
      },
      { timezone }
    );
  }

  function getCommands() {
    return [
      new SlashCommandBuilder()
        .setName("마지막말")
        .setDescription("지금 보내고, 23:59에 한 번에 공개합니다.")
        .addStringOption(opt =>
          opt
            .setName("내용")
            .setDescription("지금은 숨기고 밤에 공개할 말")
            .setRequired(true)
        )
        .addBooleanOption(opt =>
          opt
            .setName("익명")
            .setDescription("익명으로 공개할지 선택")
            .setRequired(false)
        ),

      new SlashCommandBuilder()
        .setName("마지막말확인")
        .setDescription("오늘 쌓인 마지막말 개수를 확인합니다."),

      new SlashCommandBuilder()
        .setName("마지막말공개")
        .setDescription("관리자가 저장된 마지막말을 즉시 공개합니다."),
    ];
  }

  async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return false;
    if (!["마지막말", "마지막말확인", "마지막말공개"].includes(interaction.commandName)) {
      return false;
    }

    await interaction.deferReply({ ephemeral: true });

    if (interaction.channelId !== channelId) {
      await interaction.editReply("이 명령어는 지정된 채널에서만 사용할 수 있어요.");
      return true;
    }

    if (interaction.commandName === "마지막말확인") {
      const list = readMessages();
      const todayKey = getTodayKey();
      const todayCount = list.filter(item => item.dateKey === todayKey).length;
      await interaction.editReply(`오늘 23:59 공개 예정인 마지막말은 **${todayCount}개**예요.`);
      return true;
    }

    if (interaction.commandName === "마지막말공개") {
      if (!adminUserId || interaction.user.id !== adminUserId) {
        await interaction.editReply("이 명령어는 지정된 관리자만 사용할 수 있어요.");
        return true;
      }

      const result = await revealSecrets(true);
      if (result.empty) {
        await interaction.editReply("지금 공개할 마지막말이 없어요.");
      } else {
        await interaction.editReply(`저장된 마지막말 **${result.count}개**를 즉시 공개했어요.`);
      }
      return true;
    }

    if (interaction.commandName === "마지막말") {
      if (allowedUserIds.length > 0 && !allowedUserIds.includes(interaction.user.id)) {
        await interaction.editReply("이 명령어는 지정된 사용자만 사용할 수 있어요.");
        return true;
      }

      const content = interaction.options.getString("내용", true).trim();
      const anonymous = interaction.options.getBoolean("익명") ?? true;

      if (!content) {
        await interaction.editReply("내용이 비어 있어요.");
        return true;
      }

      addMessage({
        userId: interaction.user.id,
        username: interaction.user.username,
        content,
        anonymous,
        dateKey: getTodayKey(),
        createdAt: new Date().toISOString(),
      });

      await interaction.editReply(
        anonymous
          ? "저장했어요. 지금은 숨기고 **23:59에 익명으로** 공개됩니다."
          : "저장했어요. 지금은 숨기고 **23:59에 이름과 함께** 공개됩니다."
      );
      return true;
    }

    return false;
  }

  return {
    getCommands,
    handleInteraction,
    scheduleReveal,
  };
}

module.exports = { createSecretRevealModule };
