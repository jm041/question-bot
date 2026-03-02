const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const dns = require("dns");    
const cron = require('node-cron');
const http = require('http');

console.log("✅ execArgv:", process.execArgv);
console.log("✅ NODE_OPTIONS:", process.env.NODE_OPTIONS);
console.log("✅ index.js 로딩됨", new Date().toISOString());
console.log("✅ ENV 체크", {
  hasTOKEN: !!process.env.TOKEN,
  hasCLIENT_ID: !!process.env.CLIENT_ID,
  hasGUILD_ID: !!process.env.GUILD_ID
});

// Node 18+ 지원: DNS 결과를 IPv4 우선으로
try {
  dns.setDefaultResultOrder("ipv4first");
  console.log("✅ dns.setDefaultResultOrder(ipv4first) 적용");
} catch (e) {
  console.log("⚠️ dns.setDefaultResultOrder 적용 실패:", e?.message);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ✅ 설정값 (반드시 채우세요)
const CHANNEL_ID = "1473382815897747507";           // 질문을 올릴 채널 ID
const USER_IDS = ["926457972538871880", "560466004858372096"];        // 두 사람의 유저 ID
const SKIP_USER_ID = "926457972538871880"; // ✅ /스킵 가능한 본인 ID

const questions = [
  //하루 · 감정 · 일상 공유형
"요즘 제일 자주 듣는 노래 뭐야?",
"스트레스 받을 때 어떻게 풀어?",
"최근에 제일 많이 웃은 순간은?",
"요즘 가장 먹고 싶은 음식은?",
"지금 기분 한 단어로 표현하면?",
"요즘 제일 많이 생각하는 주제는?",
"오늘 가장 웃겼던 일 뭐였어?",
"요즘 누구랑 있으면 제일 편해?",
"요즘 연락 제일 많이 하는 사람 누구야?",
  //나에 대한 생각 · 존재감 확인형
"오늘 나 생각난 적 있어?",
"나랑 대화할 때 어떤 기분 들어?",
"나한테 제일 잘 어울리는 별명은?",
"나한테 비밀 하나 말해줄 수 있어?",
"나한테 하고 싶었는데 못 한 말 있어?",
"나 생각보다 괜찮은 사람 같아?",
"내가 위로가 된 적 있어?",
"내가 없으면 조금 허전할 것 같아?",
"내가 오늘 웃게 만든 순간 있어?",
"내가 있으면 하루가 더 즐거워?",
"오늘 나랑 함께 한 시간 중 가장 좋았던 순간?",
"내가 없을 때 가끔 나를 떠올리는 순간 있어?",
"내가 너한테 어떤 존재 같아?",
"내가 바꾸면 좋을 것 같은 부분 있어?",
"솔직히 나랑 대화하는 거 귀찮았던 적 있어?",
"내가 연락 안 하면 서운할 것 같아?",
  //관계 방향 · 친밀도 탐색형
"나랑 같이 해보고 싶은 거 하나만 말해줘 😌",
"요즘 나한테 하고 싶었던 말 있어?",
"너한테 '편하다'는 어떤 의미야?",
"요즘 나한테 숨기고 있는 고민 있어?",
"갑자기 떠오르는 사람 있어?",
"너는 사랑하면 어떤 스타일 같아?",
"사람을 좋아하게 되면 제일 먼저 변하는 게 뭐야?",
"나랑 더 가까워지고 싶다고 느낀 적 있어?",
"나랑 단둘이 놀면 뭐 하고 싶어?",
"내가 사라지면 조금이라도 아쉬울 것 같아?",
"나랑 여행 가면 어디 가고 싶어?",
"나랑 단둘이 여행 가는 거 괜찮아?",
"나 웃길 때랑 진지할 때 중 뭐가 더 좋아?",
"내가 갑자기 고백하면 반응 어때?",
"나랑 데이트 코스 짜본다면?",
"내가 다른 사람이랑 더 친해지면 어떤 기분일 것 같?",
"우리 둘이 잘 맞는 편 같아?",
"나랑 연락 끊기면 아쉬울 것 같아?",
"나랑 단둘이 어디 가는 거 상상해 본 적 있어?",
"나랑 하루 바꿔 살면 해보고 싶은 건?",
"나랑 더 깊은 얘기해보고 싶어?",
"나랑 사소한 다툼 생기면?",
"내가 보고 싶다고 하면?",
"나랑 사귀면 가장 걱정되는 건?",
"나를 친구라고만 생각해?",
  //직설적 감정 확인 · 고백 압박형
"나 좋아해?",
"내가 좋아한다고 하면 부담이야?",
"내가 고백하면 받아줄 가능성은?",
"나를 좋아하려다 참는 느낌이야 아니면 애초에 감정이 없어?",
"내가 고백하면 고민은 할 거야 아니면 바로 거절할 거야?",
  //신체적 상상 · 스킨십 수위형
"나한테 설렌 적 있어?",
"내가 갑자기 손 잡으면 뺄 거야?",
"나를 안아보고 싶다는 생각 해봤어?",
"나를 보면 눈 어디부터 볼 것 같아?",
  "성관계 - 정상위 vs 후배위",
  "성관계 - 기구를 사용하여 vs 기구없이",
  "성관계 - 내가 위에 있기 vs 내가 아래에 있기",
  "성관계 3명이서 한다면 - 내가 2명인 쪽에서 vs 내가 1명인 쪽에서",
  "19 - 이상형 팬디 속에 내 손 vs 내 팬티 속에 이상형 ",
  "성관계 - 털 vs 왁싱",
  "성관계 - 짧게 여러 번 vs 길게 한번",
  "상대방이 나를 애무 해줄때 - 입으로 vs 손으로",
  "내가 상대방을 애무 해줄때 - 입으로 vs 손으로",
  "성관계 - 대놓고 내지르는 신음 소리 vs 참다가 새어나온 신음 소리",
  "성관계 - 빨기 vs 빨리기",
  "성관계 - 한 자세로 오래 vs 여러 자세 바꿔가며",
  "성관계 - 입에다 마무리 vs 안에다 마무리",
  "성관계 - 눈 마주치며 vs 눈 감고",
  "성관계 - 대화하면서 하기 vs 몸으로만 대화",
  "성관계 - 불 키고 vs 불 끄고",

  //나랑 대화할 때 어떤 기분 들어?
  //누군가한테 꼭 듣고 싶은 말 있어?
  //내가 보내는 메시지에 설레는 느낌이 들 때가 있어?
  //나한테 솔직해질 수 있어?
  //오늘 가장 행복했던 순간 공유해줄래?
  //요즘 외롭다고 느낀 적 있어?
  //나랑 오늘 이야기하면서 좋았던 순간은?
  //오늘 하루 점수는 10점 만점에 몇 점?
  //나한테 점수 매기면 몇 점 줄 거야?
  //가끔 혼자 있을 때 무슨 생각해?
  //힘들 때 누가 옆에 있어주면 좋겠어?
  //나한테 처음 느낀 인상은?
  //나와 이야기할 때 웃음이 자연스럽게 나는 순간이 있어?
  //나랑 밤새 대화 가능?
  //나랑 해볼래 말래
  //내가 없는 동안 하루가 심심하게 느껴진 적 있어?
  //오늘 하루 중 제일 기분 좋았던 순간은?
  //너한테 위로가 되는 말은 뭐야?
  //나한테 궁금했던 거 하나 있어?
  //내가 해줬으면 하는 말 있어?
  //나랑 지금보다 더 가까워질 용기 있어?
  //집에서 제일 좋아하는 시간대는?
  //내가 보내는 메시지가 기다려진 적 있어?
  //내가 생각보다 이런 사람이다 싶은 거 있어?
  //요즘 제일 많이 생각나는 건 뭐야?
  //오늘 기분 한 단어로 표현하면?
  //오늘 나랑 대화하면서 제일 좋았던 순간은?
  //나랑 있으면 안정감 들어?
  //내가 장난치거나 농담하면 기분이 묘하게 달라지는 적 있어?
  //나랑 하루 종일 통화 가능해?
  //솔직히 나한테 감정 있어 없어요 둘 중 하나만 말해줘
  //나랑 포옹하면 몇 초 버틸 수 있어?
  //성관계 - 남이 하는 거 내가 보기 vs 내가 하는 거 남이 보기
  //내 매력 하나만 말해줘
  //나한테 기대하는 게 있어?
  //나랑 스킨십 가능하다면 어디까지 괜찮아?
  //하루동안 성별이 바뀌면 뭐하고 싶어?
  //가장 좋아하는 계절은?
  //사람 좋아할 때 보통 먼저 표현하는 편이야 아니면 기다리는 편이야?
  //내가 다른 사람이랑 친하게 지내면 질투나?
  //성관계 - 골반 잡고 vs 머리채 잡고
  //성관계 - 애무 30분 vs 삽입 30분
  //나랑 메시지나 통화할 때 기다려지는 순간이 있어?
  //내가 질투하면 귀여울 것 같아?
  //오늘 하루 나랑 공유하고 싶은 일 있어?
  //나를 이성으로 생각해 본 적 있어?
  //내가 하지 말았으면 하는거 있어?
  //성관계 - 깊숙히 vs 빠르게
  //나를 실제로 만볼 생각 있어?
  //오늘 하루 중 나 생각난 순간 있어?
  //내가 없는 동안에도 나를 떠올린 적이 있어?
  //나랑 공통점 하나 찾자면 뭐 같아?
  //나랑 둘이 침대에 있으면 아무 일도 안 생길 자신 있어?
  //오늘 하루에 점수 준다면 몇 점?
  //가 본 여행지 중에 가장 좋았던 곳은?(ㅈㄴ질문)
  //나랑 실제로 만나면 어색할까?
  //요즘 자주 생각나는 장소 있어?
  //나랑 해보고 싶은 소소한 버킷리스트 하나만 말해줘
  //우리가 만났을떄 내가 섹스 하자고 하면 할생각 있어?(ㅈㅁ질문)
  //요즘 빠져있는 거 있어?
  //솔직히 나 조금이라도 신경 쓰여?
  //요즘 제일 듣고 싶은 한마디는?

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






