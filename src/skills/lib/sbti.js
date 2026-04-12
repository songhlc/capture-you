#!/usr/bin/env node
/**
 * sbti.js — SBTI 傻乎乎大人格测试
 *
 * 玩梗性格测试，灵感来自 2026 年 4 月爆火的 SBTI
 * 10道生活场景选择题，结果荒诞扎心
 */

const readline = require('readline');

const QUESTIONS = [
  {
    id: 1,
    text: '你正在追一个剧，突然朋友叫你去喝酒，你：',
    options: [
      { text: '果断去，剧可以回放，喝酒不能重来', score: 'A' },
      { text: '把剧投屏到酒杯上，一边看一边喝', score: 'B' },
      { text: '说不去，然后偷偷去', score: 'C' },
      { text: '果断不去，在家追剧最舒服', score: 'D' },
    ],
  },
  {
    id: 2,
    text: '你点外卖，超过半小时还没送到，你：',
    options: [
      { text: '打开地图假装在追踪骑手位置', score: 'B' },
      { text: '已经默默申请退款了', score: 'A' },
      { text: '给骑手发消息：兄弟不急，平安最重要', score: 'C' },
      { text: '饿着肚子给商家打差评', score: 'D' },
    ],
  },
  {
    id: 3,
    text: '同事在群里发了一条有明显错误的通知，你：',
    options: [
      { text: '私聊提醒，怕公开说让对方尴尬', score: 'C' },
      { text: '立刻在群里纠正，错的不能忍', score: 'D' },
      { text: '假装没看见，反正不是我发的', score: 'A' },
      { text: '截图发给我最好的朋友吐槽', score: 'B' },
    ],
  },
  {
    id: 4,
    text: '你路过一家店，店员热情招呼，你：',
    options: [
      { text: '假装打电话，"喂？我快到了"', score: 'A' },
      { text: '进去逛逛，反正闲着也是闲着', score: 'B' },
      { text: '微笑点头然后快步走过', score: 'C' },
      { text: '反手一个拍照发朋友圈：又被拉客了', score: 'D' },
    ],
  },
  {
    id: 5,
    text: '晚上12点，你突然想起明天有个重要会议，你：',
    options: [
      { text: '算了，反正也来不及准备了，睡了', score: 'A' },
      { text: '设三个闹钟，确保明天能起', score: 'B' },
      { text: '焦虑地刷手机到凌晨3点', score: 'C' },
      { text: '立刻爬起来准备资料', score: 'D' },
    ],
  },
  {
    id: 6,
    text: '你妈给你发了一条养生文章，标题是《绝对不能吃的十种食物》，你：',
    options: [
      { text: '认真看完，然后偷偷点了外卖', score: 'B' },
      { text: '不回，但会在心里默默对照自己吃了多少', score: 'C' },
      { text: '转发给你爸，让他也焦虑一下', score: 'A' },
      { text: '打电话问妈：您是不是被拉进养生群了', score: 'D' },
    ],
  },
  {
    id: 7,
    text: '你体重秤上秤，发现重了3斤，你：',
    options: [
      { text: '把电池拆了，假装秤坏了', score: 'A' },
      { text: '反省今天的饮食，决定明天开始减肥', score: 'B' },
      { text: '安慰自己：这是肌肉，不是脂肪', score: 'C' },
      { text: '立刻把秤藏起来，眼不见为净', score: 'D' },
    ],
  },
  {
    id: 8,
    text: '你和朋友约好周末出去玩，但那天你突然很想宅在家，你：',
    options: [
      { text: '硬着头皮去，不能言而无信', score: 'C' },
      { text: '找个借口放朋友鸽子', score: 'A' },
      { text: '说去，但到最后一刻才告诉他们不去了', score: 'D' },
      { text: '改成线上云聚会，人到心到', score: 'B' },
    ],
  },
  {
    id: 9,
    text: '你在朋友圈发了一张自拍，你最在意的是：',
    options: [
      { text: '评论区有没有人夸', score: 'B' },
      { text: '有没有人问你要原图', score: 'C' },
      { text: '发完就忘了，不回头看', score: 'A' },
      { text: '精心修图3小时，发完立刻刷有没有赞', score: 'D' },
    ],
  },
  {
    id: 10,
    text: '你的手机电量只剩5%，且没有充电宝，你：',
    options: [
      { text: '开启超级省电模式，聊天靠打字，电话靠喊', score: 'C' },
      { text: '到处找共享充电宝，即使价格离谱', score: 'B' },
      { text: '算了，让手机自然关机，享受片刻宁静', score: 'A' },
      { text: '立刻给所有人群发消息：手机要没电了有事请打电话', score: 'D' },
    ],
  },
];

const TYPES = {
  AAAA: {
    name: '躺平仙人', emoji: '🛌',
    desc: '你是朋友圈的"精神领袖"，信奉"能躺着绝不坐着"的人生哲学。表面上云淡风轻，实际上对生活有着自己独特的理解。你的朋友觉得你很酷，因为你从不卷，也从不焦虑。',
    tagline: '世上无难事，只要肯放弃',
  },
  BBBB: {
    name: '纯爱战士', emoji: '❤️',
    desc: '你对感情认真得有点傻。喜欢一个人可以喜欢很久。你是朋友圈里的"恋爱脑"，但你自己觉得这是"深情"。别减肥了，你这样很可爱。',
    tagline: '我可以单身，但我的CP必须在一起',
  },
  CCCC: {
    name: '怼天怼地', emoji: '🔥',
    desc: '你说话从不拐弯，有话直说，朋友觉得你是"气氛担当"，但也常常因为太直接而得罪人。其实你不是故意伤人，你只是觉得实话实说是对对方最大的尊重。',
    tagline: '我不是嘴欠，我只是不想虚伪',
  },
  DDDD: {
    name: '社死女王', emoji: '🚪',
    desc: '你有过无数次尴尬的瞬间，但每次都能用幽默化解。你是朋友圈里的"社死现场"代言人，你的故事永远是"我上次……"开头。你用自嘲换来了所有人的好感。',
    tagline: '只要我不尴尬，尴尬的就是别人',
  },
  ABAB: {
    name: '精神分裂达人', emoji: '🌀',
    desc: '你的一天是这样的：早上觉得自己能改变世界，中午觉得世界在改变你，晚上觉得自己和自己都不可靠。情绪起伏比股市还大，但神奇的是，你最后总能找到平衡点。',
    tagline: '我没有分裂，我只是在演不同的自己',
  },
  BABA: {
    name: '反骨卷王', emoji: '💪',
    desc: '嘴上说着摆烂，脚比谁都勤快。你是那种嘴上说"随便考考"然后拿年级第一的人。朋友总觉得你在凡尔赛，但其实你只是不想承担"努力了还失败"的风险。',
    tagline: '我不是卷，我只是不小心太努力了',
  },
  ABCD: {
    name: '人间清醒', emoji: '🌊',
    desc: '你活得很通透，看问题比谁都准。你不给人生设限，不逼自己内卷，也不躺平。你知道什么时候该冲，什么时候该撤。朋友觉得你很酷，因为你从不被任何事绑架。',
    tagline: '我不是看透了，我只是不想被骗',
  },
  DCBA: {
    name: '多面复杂体', emoji: '🧩',
    desc: '你不是一个标签能定义的人。你有时候卷，有时候躺，有时候社牛，有时候社恐。你讨厌被归类，也讨厌扁平化的标签。SBTI说：你不是任何一个类型，你就是你自己。',
    tagline: '复杂才是真实的',
  },
};

function calcType(answers) {
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (const a of answers) {
    if (counts[a] !== undefined) counts[a]++;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 2).map(([k]) => k);
  let type = '';
  for (let i = 0; i < 4; i++) type += top[i % top.length];
  return TYPES[type] || {
    name: '多面复杂体', emoji: '🧩',
    desc: '你不是一个标签能定义的人。复杂才是真实的。',
    tagline: '我就是我自己',
  };
}

async function runInteractive() {
  console.log('\n🌀 SBTI 傻乎乎大人格测试\n');
  console.log('─'.repeat(40));
  console.log('来测测你是什么"人"吧（结果很扎心）\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answers = [];

  for (const q of QUESTIONS) {
    const score = await new Promise(resolve => {
      console.log(`\n第${q.id}/10题：${q.text}`);
      console.log(q.options.map((o, i) => `  ${i + 1}. ${o.text}`).join('\n'));
      rl.question('你的选择（1-4）: ', ans => {
        const idx = parseInt(ans) - 1;
        resolve(idx >= 0 && idx < 4 ? q.options[idx].score : 'A');
      });
    });
    answers.push(score);
  }

  rl.close();
  const result = calcType(answers);

  console.log('\n' + '═'.repeat(40));
  console.log(`\n🎉 你的 SBTI 人格是：${result.emoji} ${result.name}`);
  console.log(`\n${result.desc}`);
  console.log(`\n📌 ${result.tagline}`);
  console.log('\n' + '═'.repeat(40));

  return { answers, result };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === 'result' && args[1]) {
    const answers = args[1].split('').filter(c => ['A','B','C','D'].includes(c.toUpperCase()));
    const result = calcType(answers);
    console.log(`\n🎉 你的 SBTI 人格是：${result.emoji} ${result.name}`);
    console.log(`📌 ${result.tagline}\n`);
  } else {
    runInteractive().then(r => {
      const { updatePersonality } = require('./db');
      updatePersonality('sbti_result', {
        type: r.result.name,
        emoji: r.result.emoji,
        tagline: r.result.tagline,
        answers: r.answers.join(''),
        tested_at: new Date().toISOString(),
      });
      console.log('\n✅ 已记录到你的性格画像！');
    });
  }
}

module.exports = { calcType, QUESTIONS };
