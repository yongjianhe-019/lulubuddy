/** `workbuddy.mode` namespace dictionaries (the composer mode control's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.group.aria': '协作模式',
  'mode.ask': 'Ask',
  'mode.ask.title': '只问不动：回答问题，不改动工作区',
  'mode.plan': 'Plan',
  'mode.plan.title': '先想后做：先出方案，确认后再执行',
  'mode.craft': 'Craft',
  'mode.craft.title': '你说我做：立即执行并交付',
  'mode.failed': '模式切换失败',
} satisfies Record<string, string>

/** The workbuddy.mode namespace key union. */
export type ModeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.group.aria': 'Collaboration mode',
  'mode.ask': 'Ask',
  'mode.ask.title': 'Answer only: reply without touching the workspace',
  'mode.plan': 'Plan',
  'mode.plan.title': 'Plan first: propose, then execute after confirmation',
  'mode.craft': 'Craft',
  'mode.craft.title': 'Execute: act immediately and deliver',
  'mode.failed': 'Mode switch failed',
} satisfies Record<ModeKey, string>
