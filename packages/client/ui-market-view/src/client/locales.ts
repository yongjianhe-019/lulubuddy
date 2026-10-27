export const NS = 'market'

export const zh = {
  'card.title': 'A 股大盘概览',
  'kpi.asOf': '数据日期',
  'kpi.above20': '站上 MA20',
  'kpi.above60': '站上 MA60',
  'kpi.total': '指数数',
  'table.index': '指数',
  'table.close': '收盘',
  'table.change': '日涨跌',
  'table.ret20': '20日',
  'table.retYtd': '年初至今',
  'table.ma20': 'MA20',
  'table.ma60': 'MA60',
  'table.volume': '量比',
  'state.running': '正在读取大盘…',
  'state.empty': '没有结果内容',
  'state.invalid': '无法识别的结果，显示原始输出',
  'warnings.title': '数据警告',
  'source': '来源：{value}',
  'note': '指数级概览，不构成投资建议。',
} as const

export const en = {
  'card.title': 'A-share market overview',
  'kpi.asOf': 'As of',
  'kpi.above20': 'Above MA20',
  'kpi.above60': 'Above MA60',
  'kpi.total': 'Indices',
  'table.index': 'Index',
  'table.close': 'Close',
  'table.change': 'Day',
  'table.ret20': '20D',
  'table.retYtd': 'YTD',
  'table.ma20': 'MA20',
  'table.ma60': 'MA60',
  'table.volume': 'Vol ratio',
  'state.running': 'Reading the market…',
  'state.empty': 'No result content',
  'state.invalid': 'Unrecognized result; showing raw output',
  'warnings.title': 'Data warnings',
  'source': 'Source: {value}',
  'note': 'Index-level overview, not investment advice.',
} as const

export type MarketViewKey = keyof typeof zh
