/**
 * capture-me-observer Hook Handler
 * 
 * 在 message:preprocessed 事件时静默分析用户消息，提取画像信号
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// 画像信号提取规则
const SIGNAL_RULES: Array<{ dimension: string; patterns: RegExp[]; extract?: (text: string) => string }> = [
  {
    dimension: 'work',
    patterns: [
      /开会|会议|项目|客户|工作|上班|下班|加班|老板|同事|上司|汇报|方案|合同|谈判|面试|入职|辞职|晋升|加薪/
    ],
    extract: (text) => {
      if (/开会|会议/.test(text)) return '工作中频繁开会';
      if (/项目|客户/.test(text)) return '项目/客户相关工作';
      if (/加班|上班/.test(text)) return '工作时间长/加班';
      return '工作相关内容';
    }
  },
  {
    dimension: 'life',
    patterns: [
      /吃饭|早餐|午餐|晚餐|外卖|做饭|购物|买|出行|旅游|回家|出门|电影|娱乐|休息/
    ],
    extract: (text) => {
      if (/吃饭|外卖|做饭/.test(text)) return '日常饮食相关';
      if (/购物|买/.test(text)) return '购物消费';
      if (/出行|旅游/.test(text)) return '出行/旅游';
      return '日常生活';
    }
  },
  {
    dimension: 'habit',
    patterns: [
      /每天|总是|经常|通常|习惯|了一般|以往都|向来|熬夜|早起|晚睡|晨跑|夜跑/
    ],
    extract: (text) => {
      if (/熬夜|晚睡/.test(text)) return '晚睡/熬夜习惯';
      if (/早起|晨跑/.test(text)) return '早起/晨跑习惯';
      if (/每天|习惯/.test(text)) return '日常习惯行为';
      return '习惯性行为模式';
    }
  },
  {
    dimension: 'emotion',
    patterns: [
      /开心|高兴|兴奋|满足|愉快|轻松|不错|顺利|成功|突破|成就感/,
      /焦虑|担心|担忧|不安|紧张|压力|累|疲惫|困|郁闷|烦躁|沮丧|失落|失望|伤心|难过/
    ],
    extract: (text) => {
      if (/开心|高兴|兴奋|满足/.test(text)) return '积极情绪';
      if (/焦虑|担心|担忧|压力/.test(text)) return '焦虑/压力情绪';
      if (/累|疲惫|困/.test(text)) return '疲惫/低能量状态';
      if (/郁闷|烦躁|沮丧|失落/.test(text)) return '负面情绪';
      return '情绪波动';
    }
  },
  {
    dimension: 'preference',
    patterns: [
      /喜欢|讨厌|偏好|宁愿|宁可|比起|宁愿.*也不|从不|绝不|从来不|希望|想要|期望|宁愿/,
      /更愿意|比较喜欢|不太喜欢|不太愿意/
    ],
    extract: (text) => {
      if (/喜欢/.test(text)) return '表达了偏好';
      if (/讨厌|不喜欢/.test(text)) return '表达了厌恶';
      if (/希望|想要|期望/.test(text)) return '表达了期望';
      return '偏好/意愿倾向';
    }
  },
  {
    dimension: 'goal',
    patterns: [
      /目标|打算|计划|想要达成|立志|决心|决定要|以后要|未来要|这辈子要|这次一定要|一定要/
    ],
    extract: (text) => {
      if (/目标/.test(text)) return '设定了目标';
      if (/打算|计划/.test(text)) return '有计划/打算';
      if (/决定|决心/.test(text)) return '做出决定/决心';
      return '目标/计划声明';
    }
  },
  {
    dimension: 'relation',
    patterns: [
      /老婆|老公|妻子|丈夫|男票|女票|男朋友|女朋友|伴侣|对象|家人|父母|爸妈|爸|妈/,
      /张总|李总|王总|赵总|刘总|陈总|总|老板|上司|领导|同事|同学|朋友|哥们|闺蜜|兄弟|姐姐|妹妹|哥哥|弟弟/
    ],
    extract: (text) => {
      if (/老婆|老公|妻子|丈夫/.test(text)) return '配偶关系动态';
      if (/爸妈|父母|家人/.test(text)) return '家庭关系动态';
      if (/张总|李总|王总|总/.test(text)) return '职场关系动态（领导/客户）';
      if (/同事|同学|朋友/.test(text)) return '社交关系动态';
      return '人际关系提及';
    }
  },
  {
    dimension: 'health',
    patterns: [
      /睡眠|睡|做梦|失眠|早睡|熬夜|累|疲惫|困|没精神|健康|身体|运动|跑步|健身|瑜伽|锻炼|头疼|感冒|发烧|咳嗽/
    ],
    extract: (text) => {
      if (/睡眠|睡|做梦|失眠|早睡|熬夜/.test(text)) return '睡眠相关状态';
      if (/运动|跑步|健身|瑜伽|锻炼/.test(text)) return '运动/健身活动';
      if (/累|疲惫|困|没精神/.test(text)) return '身体疲劳/低能量';
      if (/头疼|感冒|发烧|咳嗽/.test(text)) return '身体不适/疾病';
      return '健康/身体状态';
    }
  },
];

// Hook 主函数
const handler = async (event: any) => {
  // 只处理 message:preprocessed 事件
  if (event.type !== 'message' || event.action !== 'preprocessed') {
    return;
  }

  const { content, from, conversationId, messageId } = event.context || {};

  // 空消息跳过
  if (!content || typeof content !== 'string' || content.trim().length < 3) {
    return;
  }

  // 提取信号
  const signals: Array<{ dimension: string; signal: string; confidence: number; source: string; conversation_id: string | null }> = [];

  for (const rule of SIGNAL_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(content)) {
        const signalText = rule.extract ? rule.extract(content) : `检测到${rule.dimension}相关内容`;
        
        // 避免重复
        if (!signals.some(s => s.dimension === rule.dimension)) {
          signals.push({
            dimension: rule.dimension,
            signal: signalText,
            confidence: 0.7,
            source: 'observe',
            conversation_id: conversationId || null,
          });
        }
        break;
      }
    }
  }

  // 如果有信号，异步写入
  if (signals.length > 0) {
    await writeSignalsAsync(signals);
  }
};

// 异步写入信号（不阻塞 hook）
async function writeSignalsAsync(signals: any[]) {
  const hookDir = path.dirname(require.main?.filename || __filename);
  
  return new Promise((resolve) => {
    // 使用 write-signals.js 后台写入
    const child = spawn('node', [
      path.join(hookDir, 'write-signals.js'),
      JSON.stringify(signals),
    ], {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();
    resolve(undefined);
  });
}

export default handler;
