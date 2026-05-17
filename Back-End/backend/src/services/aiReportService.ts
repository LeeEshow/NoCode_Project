import Anthropic from '@anthropic-ai/sdk';
import { DailySnapshot } from '../models/DailySnapshot';
import { Holding } from '../models/Holding';
import { RebalanceRule } from '../models/RebalanceRule';
import { RebalanceSnapshot } from '../models/RebalanceSnapshot';
import { Settings } from '../models/Settings';
import { AiReport, AiReportDoc } from '../models/AiReport';
import { AppError } from '../middleware/errorHandler';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env['ANTHROPIC_API_KEY']) {
    throw new AppError(503, '未設定 ANTHROPIC_API_KEY，無法使用 AI 功能');
  }
  if (!_client) _client = new Anthropic();
  return _client;
}

const DEFAULT_SYSTEM = `你是一位專業的台灣股市投資分析師助理。根據提供的持股資料、每日快照與再平衡建議，產出一份結構化的每日投資早報。請以繁體中文撰寫，語氣專業、客觀、簡明扼要。`;

function getTaiwanDate(): string {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function generate(): Promise<AiReportDoc> {
  const [snapshot, holdings, rules, recentSnapshots, settings] = await Promise.all([
    DailySnapshot.findLatest(),
    Holding.findAll(),
    RebalanceRule.find(),
    RebalanceSnapshot.findRecent(3),
    Settings.find(),
  ]);

  const systemPrompt = settings?.aiSystemPrompt?.trim() || DEFAULT_SYSTEM;
  const reportDate   = getTaiwanDate();

  const holdingsSummary = holdings.length > 0
    ? holdings
        .map(h => `  - ${h.stockId} ${h.stockName ?? ''}: ${h.sharesHeld} 股，均價 ${h.avgCost.toFixed(2)}`)
        .join('\n')
    : '  （無持股）';

  const snapshotSummary = snapshot
    ? [
        `日期：${snapshot.date}`,
        `  股票現值：${snapshot.stockValue.toFixed(0)} 元`,
        `  外幣資產：${snapshot.forexValue.toFixed(0)} 元`,
        `  現金餘額：${snapshot.cashBalance.toFixed(0)} 元`,
        `  未實現損益：${snapshot.unrealizedProfit.toFixed(0)} 元`,
      ].join('\n')
    : '  （無快照資料）';

  const rebalanceSummary = recentSnapshots.length > 0
    ? recentSnapshots
        .map((s, i) => {
          const active = s.suggestions.filter(sg => sg.action !== 'hold');
          const lines = active.length > 0
            ? active.map(sg => `    ${sg.stockCode} ${sg.stockName}: ${sg.action === 'buy' ? '買入' : '賣出'} ${sg.shares} 股，約 ${sg.estimatedAmount.toFixed(0)} 元`).join('\n')
            : '    （無建議操作）';
          return `  [${i + 1}] ${s.createdAt.slice(0, 10)}（市場狀態：${s.params.marketState}）\n${lines}`;
        })
        .join('\n')
    : '  （無再平衡快照）';

  const userPrompt = `請根據以下資料，產出今日（${reportDate}）的投資早報。

【持股清單】
${holdingsSummary}

【最新每日快照】（單位：新台幣）
${snapshotSummary}

【近期再平衡建議】（最近 3 筆）
${rebalanceSummary}

【再平衡參數】
  基準閾值：${(rules.baseThreshold * 100).toFixed(1)}%
  波動係數：${rules.volatilityFactor}
  流動性上限：${(rules.liquidityCapRatio * 100).toFixed(1)}%
  集中度上限：${(rules.concentrationLimit * 100).toFixed(1)}%`;

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    tools: [
      {
        name: 'generate_daily_report',
        description: '產出每日投資早報的結構化 JSON',
        input_schema: {
          type: 'object' as const,
          properties: {
            reportDate:       { type: 'string', description: '報告日期 YYYY-MM-DD' },
            marketState:      { type: 'string', description: '目前市場狀態摘要（中性/偏多/偏空等）' },
            summary:          { type: 'string', description: '市場整體摘要（200 字以內）' },
            exposureAnalysis: { type: 'string', description: '持倉曝險分析（各類資產占比與風險評估）' },
            stockStrategies:  { type: 'string', description: '個股操作建議（每檔一段，含方向與理由）' },
            riskWarnings:     { type: 'string', description: '風險警告事項（條列式）' },
            generatedAt:      { type: 'string', description: '報告產生時間 ISO 8601' },
          },
          required: ['reportDate', 'marketState', 'summary', 'exposureAnalysis', 'stockStrategies', 'riskWarnings', 'generatedAt'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'generate_daily_report' },
  });

  const toolBlock = response.content.find(b => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('AI 未回傳結構化報告');
  }

  const input = toolBlock.input as Record<string, string>;
  return AiReport.save({
    reportDate:       input['reportDate']       ?? reportDate,
    marketState:      input['marketState']      ?? '',
    summary:          input['summary']          ?? '',
    exposureAnalysis: input['exposureAnalysis'] ?? '',
    stockStrategies:  input['stockStrategies']  ?? '',
    riskWarnings:     input['riskWarnings']     ?? '',
    generatedAt:      input['generatedAt']      ?? new Date().toISOString(),
  });
}
