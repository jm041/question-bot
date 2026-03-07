const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

function createCoupleTracker(config = {}) {
  const CHANNEL_ID = config.channelId;
  const USER_IDS = config.userIds || [];

  const BASE_DIR =
    process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "data");
  const DATA_DIR = path.join(BASE_DIR, "couple-tracker");
  const DB_PATH = path.join(DATA_DIR, "tracker.db");

  function ensureDb() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");

    db.prepare(`
      CREATE TABLE IF NOT EXISTS moods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        date TEXT NOT NULL,
        mood TEXT NOT NULL,
        note TEXT DEFAULT '',
        created_at INTEGER NOT NULL
      )
    `).run();

    db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_moods_user_date
      ON moods(user_id, date)
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS compliments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `).run();

    return db;
  }

  const db = ensureDb();

  function ymd(date = new Date()) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function lastNDays(n = 7) {
    const arr = [];
    const now = new Date();
    for (let i = 0; i < n; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      arr.push(ymd(d));
    }
    return arr;
  }

  function moodLabel(mood) {
    switch (mood) {
      case "happy":
        return "😊 행복";
      case "calm":
        return "🙂 평온";
      case "neutral":
        return "😐 보통";
      case "stressed":
        return "😕 답답";
      case "sad":
        return "😢 우울";
      default:
        return mood;
    }
  }

  function moodScore(mood) {
    switch (mood) {
      case "happy":
        return 2;
      case "calm":
        return 1;
      case "neutral":
        return 0;
      case "stressed":
        return -1;
      case "sad":
        return -2;
      default:
        return 0;
    }
  }

  const commands = [
    new SlashCommandBuilder()
      .setName("오늘기분")
      .setDescription("오늘의 기분을 기록합니다 (하루 1회)")
      .addStringOption((opt) =>
        opt
          .setName("기분")
          .setDescription("오늘 기분")
          .setRequired(true)
          .addChoices(
            { name: "😊 행복", value: "happy" },
            { name: "🙂 평온", value: "calm" },
            { name: "😐 보통", value: "neutral" },
            { name: "😕 답답", value: "stressed" },
            { name: "😢 우울", value: "sad" }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName("한줄")
          .setDescription("한줄 메모")
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("칭찬")
      .setDescription("상대에게 칭찬이나 고마움을 보냅니다")
      .addUserOption((opt) =>
        opt
          .setName("상대")
          .setDescription("보낼 대상")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("내용")
          .setDescription("칭찬 내용")
          .setRequired(true)
          .setMaxLength(300)
      ),

    new SlashCommandBuilder()
      .setName("주간리포트")
      .setDescription("최근 7일간 기분과 칭찬 기록을 확인합니다")
  ];

  async function replyDenied(interaction, text) {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(text).catch(() => {});
    } else {
      await interaction.reply({ content: text, ephemeral: true }).catch(() => {});
    }
  }

  async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return false;
    if (!["오늘기분", "칭찬", "주간리포트"].includes(interaction.commandName)) {
      return false;
    }

    if (interaction.channelId !== CHANNEL_ID) {
      await replyDenied(
        interaction,
        "이 명령어는 지정된 질문 채널에서만 사용할 수 있어요."
      );
      return true;
    }

    if (!USER_IDS.includes(interaction.user.id)) {
      await replyDenied(
        interaction,
        "이 명령어는 지정된 사용자만 사용할 수 있어요."
      );
      return true;
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    if (interaction.commandName === "오늘기분") {
      const mood = interaction.options.getString("기분", true);
      const note = interaction.options.getString("한줄") || "";
      const today = ymd();

      const exists = db.prepare(`
        SELECT id
        FROM moods
        WHERE user_id = ? AND date = ?
      `).get(interaction.user.id, today);

      if (exists) {
        await interaction.editReply("오늘은 이미 기분을 기록했어요. (하루 1회)");
        return true;
      }

      db.prepare(`
        INSERT INTO moods (user_id, date, mood, note, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(interaction.user.id, today, mood, note, Date.now());

      await interaction.editReply(
        `기록 완료: **${moodLabel(mood)}**${note ? `\n한줄: ${note}` : ""}`
      );
      return true;
    }

    if (interaction.commandName === "칭찬") {
      const target = interaction.options.getUser("상대", true);
      const message = interaction.options.getString("내용", true);

      if (target.bot) {
        await interaction.editReply("봇에게는 보낼 수 없어요.");
        return true;
      }

      if (target.id === interaction.user.id) {
        await interaction.editReply("자기 자신에게는 보낼 수 없어요.");
        return true;
      }

      if (!USER_IDS.includes(target.id)) {
        await interaction.editReply("지정된 두 사람에게만 보낼 수 있어요.");
        return true;
      }

      db.prepare(`
        INSERT INTO compliments (from_id, to_id, message, created_at)
        VALUES (?, ?, ?, ?)
      `).run(interaction.user.id, target.id, message, Date.now());

      const embed = new EmbedBuilder()
        .setTitle("✨ 칭찬/고마움 도착")
        .setDescription(message)
        .addFields(
          { name: "보낸 사람", value: `<@${interaction.user.id}>`, inline: true },
          { name: "받는 사람", value: `<@${target.id}>`, inline: true }
        )
        .setTimestamp();

      await interaction.channel.send({ embeds: [embed] }).catch(() => {});
      await interaction.editReply("전송 완료!");
      return true;
    }

    if (interaction.commandName === "주간리포트") {
      const days = lastNDays(7);
      const placeholders = days.map(() => "?").join(",");

      const moods7 = db.prepare(`
        SELECT user_id, date, mood, note, created_at
        FROM moods
        WHERE date IN (${placeholders})
        ORDER BY created_at DESC
      `).all(...days);

      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const compliments7 = db.prepare(`
        SELECT from_id, to_id, message, created_at
        FROM compliments
        WHERE created_at >= ?
        ORDER BY created_at DESC
      `).all(sevenDaysAgo);

      const avgAll =
        moods7.length > 0
          ? (
              moods7.reduce((sum, row) => sum + moodScore(row.mood), 0) /
              moods7.length
            ).toFixed(2)
          : "기록 없음";

      const byUser = {};
      for (const row of moods7) {
        if (!byUser[row.user_id]) byUser[row.user_id] = [];
        byUser[row.user_id].push(row);
      }

      const userLines = Object.entries(byUser).map(([userId, rows]) => {
        const avg = (
          rows.reduce((sum, row) => sum + moodScore(row.mood), 0) / rows.length
        ).toFixed(2);

        const recent = rows.sort((a, b) => b.created_at - a.created_at)[0];
        return `- <@${userId}> : 평균 **${avg}**, 최근 **${moodLabel(recent.mood)}**`;
      });

      const embed = new EmbedBuilder()
        .setTitle("📊 최근 7일 리포트")
        .setDescription(
          [
            `기분 기록 수: **${moods7.length}**`,
            `칭찬/고마움 수: **${compliments7.length}**`,
            `전체 평균 점수: **${avgAll}**`,
            "",
            "**개인 요약**",
            ...(userLines.length ? userLines : ["- 기록 없음"])
          ].join("\n")
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return true;
    }

    return false;
  }

  return {
    commands: commands.map((cmd) => cmd.toJSON()),
    handleInteraction
  };
}

module.exports = { createCoupleTracker };
