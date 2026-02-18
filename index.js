const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const questions = [
  "오늘 하루 중 제일 기분 좋았던 순간은?",
  "요즘 제일 많이 생각나는 건 뭐야?",
  "오늘 하루 점수는 10점 만점에 몇 점?",
  "나랑 같이 해보고 싶은 거 하나만 말해줘 😌",
  "요즘 나한테 하고 싶었던 말 있어?"
];

client.once('ready', () => {
  console.log('봇 실행됨');

  cron.schedule('* * * * *', () => {
    const channel = client.channels.cache.get("1473382815897747507");
    const random = questions[Math.floor(Math.random() * questions.length)];
    channel.send(`🌙 오늘의 질문\n\n${random}`);
  });
});

client.login(process.env.TOKEN);

const http = require('http');

http.createServer((req, res) => res.end("Bot is running")).listen(3000);

