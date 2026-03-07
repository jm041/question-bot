];

let shuffledQuestions = [];
let currentIndex = 0;

function shuffleArray(array) {
  return array.sort(() => Math.random() - 0.5);
}

function getNextQuestion() {
  if (currentIndex >= shuffledQuestions.length) {
    shuffledQuestions = shuffleArray([...questions]);
    currentIndex = 0;
  }
  return shuffledQuestions[currentIndex++];
}

// ✅ 오늘 질문 상태 (둘 다 답하기 전까지 답 숨김)
let activeQuestion = null;
// activeQuestion = { question: string, answers: { [userId]: string }, postedAt: number }

// ✅ 22시에 올려야 했는데 기존 질문이 진행 중이라 못 올린 경우 "대기" 표시
let pendingQuestion = false;

let isPosting = false; // ✅ 질문 올리는 중복 실행 방지 락

/* =========================
   ✅ 미답변 리마인더(1개만 유지: 새로 올리기 전 이전 메시지 삭제)
========================= */
const REMIND_EVERY_MIN = 120; // 몇 분 간격으로 알림
const REMIND_AFTER_MIN = 60;  // 질문 올라간 뒤 몇 분 후부터 알림 시작
let reminderTimer = null;
let lastReminderMessageId = null;

async function stopReminder(channel) {
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }

  if (channel && lastReminderMessageId) {
    const oldMsg = await channel.messages.fetch(lastReminderMessageId).catch(() => null);
    if (oldMsg) await oldMsg.delete().catch(() => {});
  }
  lastReminderMessageId = null;
}

function startReminder(channel) {
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }

  reminderTimer = setInterval(async () => {
    if (!activeQuestion) {
      await stopReminder(channel);
      return;
    }

    const postedAt = activeQuestion.postedAt || Date.now();
    const elapsedMin = Math.floor((Date.now() - postedAt) / 60000);
    if (elapsedMin < REMIND_AFTER_MIN) return;

    const unanswered = USER_IDS.filter(uid => !activeQuestion.answers[uid]);
    if (unanswered.length === 0) {
      await stopReminder(channel);
      return;
    }

    const isDaily = activeQuestion.type === 'DAILY';

    const embed = new EmbedBuilder()
      .setColor(0xFAA61A)
      .setTitle("⏰ 답변 대기 중")
      .setDescription(
        [
          `🏷️ **종류:** ${isDaily ? "오늘의 질문" : "즉석 질문"}`,
          `💌 **질문:** ${activeQuestion.question}`,
          `🕒 **경과:** ${elapsedMin}분`,
          `📝 **아직 답하지 않은 사람:** ${unanswered.map(u => `<@${u}>`).join(" ")}`
        ].join("\n")
      )
      .setTimestamp();

    // 이전 리마인더 삭제 후 새로 1개만 남김
    if (lastReminderMessageId) {
      const oldMsg = await channel.messages.fetch(lastReminderMessageId).catch(() => null);
      if (oldMsg) await oldMsg.delete().catch(() => {});
      lastReminderMessageId = null;
    }

    const newMsg = await channel.send({ embeds: [embed] });
    lastReminderMessageId = newMsg.id;
  }, REMIND_EVERY_MIN * 60 * 1000);
}
/* ========================= */

/* =========================
   ✅ 질문 업로드(공통)
   - type: 'DAILY' | 'INSTANT'
   - /질문 => DAILY (오늘의 질문)
   - /질문올리기 => INSTANT (즉석 질문)
========================= */
async function postQuestion({ customQuestion = null, type = 'DAILY' } = {}) {
  if (isPosting || activeQuestion) return;
  isPosting = true;

  try {
    const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const question = (customQuestion && customQuestion.trim().length > 0)
      ? customQuestion.trim()
      : getNextQuestion();

    activeQuestion = { question, type, answers: {}, postedAt: Date.now() };

    const isDaily = type === 'DAILY';

    const embed = new EmbedBuilder()
      .setColor(isDaily ? 0xFF69B4 : 0x00BFFF)
      .setAuthor({
        name: `${channel.guild.name} ${isDaily ? '오늘의 질문 🌙' : '즉석 질문 ⚡'}`,
        iconURL: channel.guild.iconURL({ dynamic: true })
      })
      .setDescription(`💌 ${question}`)
      .setFooter({ text: isDaily ? "매일 밤 우리만의 질문 💫" : "지금 바로 던지는 즉석 질문 ✨" })
      .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    startReminder(channel);
  } finally {
    isPosting = false;
  }
}

// 답변 공개
async function revealAnswers(channel) {
  if (!activeQuestion) return;
  await stopReminder(channel);

  const [u1, u2] = USER_IDS;
  const a1 = activeQuestion.answers[u1];
  const a2 = activeQuestion.answers[u2];

  const isDaily = activeQuestion.type === 'DAILY';

  const embed = new EmbedBuilder()
    .setColor(0x2C2F33)
    .setTitle(`${isDaily ? '🌙 오늘의 질문' : '⚡ 즉석 질문'} - 답변 공개`)
    .setDescription(
      [
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        `💌  **${activeQuestion.question}**`,
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      ].join("\n")
    )
    .addFields(
      { name: `🌙 <@${u1}>`, value: `>>> ${a1}` },
      { name: `✨ <@${u2}>`, value: `>>> ${a2}` }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });

  activeQuestion = null;

  // ✅ "대기 중이던 오늘의 질문(DAILY)"만 올림
  if (pendingQuestion) {
    pendingQuestion = false;
    await postQuestion({ type: 'DAILY' });
  }
}

/* =========================
   ✅ 슬래시 명령어 등록
   - /질문 : 랜덤 즉석 질문
   - /질문올리기 : 직접 입력 즉석 질문
========================= */
async function registerSlashCommands() {
  const token = process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId || !guildId) {
    console.log("⚠️ 슬래시 명령어 등록 스킵: TOKEN/CLIENT_ID/GUILD_ID 환경변수를 확인하세요.");
    return;
  }

  const commands = [
    new SlashCommandBuilder()
      .setName('질문')
      .setDescription('즉석 질문(랜덤)을 지금 바로 올립니다. (두 사람 모두 사용 가능)'),
    
    new SlashCommandBuilder()
      .setName('질문올리기')
      .setDescription('원하는 질문을 즉시 올립니다. (두 사람 모두 사용 가능)')
      .addStringOption(opt =>
        opt.setName('내용')
          .setDescription('올릴 질문을 입력하세요.')
          .setRequired(true)
      ),
    
    new SlashCommandBuilder()
    .setName('스킵')
    .setDescription('진행 중인 질문을 스킵하고 새 질문을 올립니다. (관리자 전용)'),
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    console.log('✅ 슬래시 명령어 (/질문, /질문올리기, /스킵) 등록 완료');
  } catch (err) {
    console.error('❌ 슬래시 명령어 등록 실패:', err);
  }
}

/* =========================
   ✅ READY
========================= */
let slashRegistered = false;
let cronStarted = false;

client.once('ready', async () => {
  console.log('🟢 READY 도착:', client.user?.tag);

  if (!slashRegistered) {
    slashRegistered = true;
    await registerSlashCommands();
  }

  // ✅ 매일 22시(서울시간) 자동 질문 = 오늘의 질문(DAILY)
  if (!cronStarted) {
    cronStarted = true;
    cron.schedule('0 22 * * *', async () => {
      if (activeQuestion || isPosting) {
        pendingQuestion = true;
        return;
      }
      await postQuestion({ type: 'DAILY' });
    }, { timezone: 'Asia/Seoul' });
  }
});

/* =========================
   ✅ 슬래시 명령어 처리
   - 두 사람만 가능
   - 지정 채널에서만 가능
   - 진행 중 질문 있으면 금지
   - 업로드 조건/포맷 동일
========================= */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!['질문', '질문올리기', '스킵'].includes(interaction.commandName)) return;

  try {
    await interaction.deferReply({ ephemeral: true });
    
  // 채널 제한
  if (interaction.channelId !== CHANNEL_ID) {
      await interaction.editReply('이 명령어는 지정된 질문 채널에서만 사용할 수 있어요.');
      return;
    }
    
  // /스킵은 "본인만" 가능
    if (interaction.commandName === '스킵') {
      if (interaction.user.id !== SKIP_USER_ID) {
        await interaction.editReply('이 명령어는 지정된 관리자만 사용할 수 있어요.');
        return;
      }
      const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
      if (!channel) {
        await interaction.editReply('채널을 찾지 못했어요.');
        return;
      }
      if (!activeQuestion) {
        await interaction.editReply('지금 진행 중인 질문이 없어요.');
        return;
      }

      // 🔹 리마인더 중지
      await stopReminder(channel);

      // 🔹 현재 질문 종료
      activeQuestion = null;
      
      await interaction.editReply('현재 질문을 종료했어요.');
      return;
    }

 // 그 외 명령어는 "두 사람만" 가능
    if (!USER_IDS.includes(interaction.user.id)) {
      await interaction.editReply('이 명령어는 지정된 사용자만 사용할 수 있어요.');
      return;
    }
    
 // 진행 중 질문 있으면 막기
    if (activeQuestion) {
      await interaction.editReply('이미 진행 중인 질문이 있어요. (두 사람이 답해야 새 질문을 올릴 수 있어요)');
      return;
    }

    // 중복 방지
    if (isPosting) {
      await interaction.editReply('지금 질문을 올리는 중이에요. 잠시만요!');
      return;
    }

    // ✅ /질문 => 오늘의 질문(DAILY, 랜덤)
    if (interaction.commandName === '질문') {
      await postQuestion({ type: 'DAILY' });
      await interaction.editReply('오늘의 질문(랜덤)을 올렸어요.');
      return;
    }

    // ✅ /질문올리기 => 즉석 질문(INSTANT, 직접 입력)
    if (interaction.commandName === '질문올리기') {
      const text = interaction.options.getString('내용', true);
      await postQuestion({ customQuestion: text, type: 'INSTANT' });
      await interaction.editReply('즉석 질문(직접 입력)을 올렸어요.');
      return;
    }
  } catch (err) {
    console.error("❌ interaction 에러:", err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(`오류: ${err?.message ?? '알 수 없음'}`).catch(() => {});
    }
  }
});

/* =========================
   ✅ 답변 수집 (메시지 기반)
   - 지정된 채널 + 두 사람만 + activeQuestion 있을 때만
   - 답은 삭제해서 서로 못 봄
   - 둘 다 답하면 공개
========================= */
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!activeQuestion) return;
  if (message.channel.id !== CHANNEL_ID) return;
  if (!USER_IDS.includes(message.author.id)) return;

  const content = (message.content || '').trim();
  if (!content) return;

  // 이미 답한 사람은 처리하지 않음 (메시지는 숨김)
  if (activeQuestion.answers[message.author.id]) {
    await message.delete().catch(() => {});
    return;
  }

  // 답 저장
  activeQuestion.answers[message.author.id] = content;

  // 채널에서 답변 숨기기
  await message.delete().catch(() => {});

  // 둘 다 답했으면 공개
  const answeredCount = Object.keys(activeQuestion.answers).length;
  if (answeredCount === 2) {
    const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
    if (!channel) return;
    await revealAnswers(channel);
  }
});


process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);
client.on('error', console.error);
client.on('shardError', console.error);

async function loginWithWatchdog() {
  const TIMEOUT_MS = 30_000;     // 30초 안에 ready/login 안 되면 재시작

  while (true) {
    try {
      console.log("🚀 Discord login() 시작");

      // login()이 멈추면 TIMEOUT으로 끊어버림
      await Promise.race([
        client.login(process.env.TOKEN),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("login timeout (gateway hang)")), TIMEOUT_MS)
        )
      ]);

      // READY가 안 오고 멈출 수도 있으니 READY도 감시
      await Promise.race([
        new Promise((resolve) => client.once("ready", resolve)),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("ready timeout (gateway hang)")), TIMEOUT_MS)
        )
      ]);

     return;
    } catch (e) {
      console.error("❌ 로그인/READY 실패:", e?.message ?? e);
      // 플랫폼이 자동 재시작하게 종료
      process.exit(1);
    }
  }
}

loginWithWatchdog();


// 헬스체크 서버
http.createServer((req, res) => res.end("Bot is running")).listen(3000);








