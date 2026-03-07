const fs = require("fs");
const path = require("path");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

function createCoupleTracker() {
  const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

function createCoupleTracker(config = {}) {
  const CHANNEL_ID = config.channelId;
  const USER_IDS = config.userIds || [];

  const BASE_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "data");
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

  function ensureStore() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STORE_PATH)) {
      fs.writeFileSync(
        STORE_PATH,
        JSON.stringify(
          {
            moods: [],       // { userId, date, mood, note, createdAt }
            compliments: []  // { fromId, toId, message, createdAt }
          },
          null,
          2
        ),
        "utf-8"
      );
    }
  }

  function readStore() {
    ensureStore();
    try {
      return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
    } catch (e) {
      const fresh = { moods: [], compliments: [] };
      fs.writeFileSync(STORE_PATH, JSON.stringify(fresh, null, 2), "utf-8");
      return fresh;
    }
  }

  function writeStore(data) {
    ensureStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
  }

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
      case "happy": return "😊 행복";
      case "calm": return "🙂 평온";
      case "neutral": return "😐 보통";
      case "stressed": return "😕 답답";
      case "sad": return "😢 우울";
      default: return mood;
    }
  }

  function moodScore(mood) {
    switch (mood) {
      case "happy": return 2;
      case "calm": return 1;
      case "neutral": return 0;
      case "stressed": return -1;
      case "sad": return -2;
      default: return 0;
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

  async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return false;
    if (!["오늘기분", "칭찬", "주간리포트"].includes(interaction.commandName)) return false;

    if (interaction.commandName === "오늘기분") {
      await interaction.deferReply({ ephemeral: true });

      const mood = interaction.options.getString("기분", true);
      const note = interaction.options.getString("한줄") || "";
      const today = ymd();
      const store = readStore();

      const already = store.moods.find(
        (x) => x.userId === interaction.user.id && x.date === today
      );

      if (already) {
        await interaction.editReply("오늘은 이미 기분을 기록했어요. (하루 1회)");
        return true;
      }

      store.moods.push({
        userId: interaction.user.id,
        date: today,
        mood,
        note,
        createdAt: Date.now()
      });

      writeStore(store);

      await interaction.editReply(
        `기록 완료: **${moodLabel(mood)}**${note ? `\n한줄: ${note}` : ""}`
      );
      return true;
    }

    if (interaction.commandName === "칭찬") {
      await interaction.deferReply({ ephemeral: true });

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

      const store = readStore();
      store.compliments.push({
        fromId: interaction.user.id,
        toId: target.id,
        message,
        createdAt: Date.now()
      });
      writeStore(store);

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
      await interaction.deferReply({ ephemeral: true });

      const store = readStore();
      const days = new Set(lastNDays(7));

      const moods7 = store.moods.filter((x) => days.has(x.date));
      const compliments7 = store.compliments.filter(
        (x) => Date.now() - x.createdAt <= 7 * 24 * 60 * 60 * 1000
      );

      const avgAll =
        moods7.length > 0
          ? (moods7.reduce((sum, x) => sum + moodScore(x.mood), 0) / moods7.length).toFixed(2)
          : "기록 없음";

      const byUser = {};
      for (const m of moods7) {
        if (!byUser[m.userId]) byUser[m.userId] = [];
        byUser[m.userId].push(m);
      }

      const userLines = Object.entries(byUser).map(([userId, arr]) => {
        const avg = (
          arr.reduce((sum, x) => sum + moodScore(x.mood), 0) / arr.length
        ).toFixed(2);
        const recent = arr.sort((a, b) => b.createdAt - a.createdAt)[0];
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
