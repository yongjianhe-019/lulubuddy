/**
 * `workbuddy.shell` namespace dictionaries, and the namespace's declaration.
 *
 * Every row is one WorkBuddy surface paired with what DSH has for it, so the two
 * languages carry the same claims about which capability stands behind which
 * WorkBuddy surface and which surface has no counterpart.
 *
 * The namespace merge lives with its key set so that any module naming
 * `TranslateNS<'workbuddy.shell'>` or `PropsLocale<'workbuddy.shell'>` needs only
 * this file, whichever entry a program loads first.
 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Capability navigation and results-area copy for the WorkBuddy shell. */
    'workbuddy.shell': WorkBuddyShellKey
  }
}

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  'panel.label': 'WorkBuddy 能力',
  'capability.title': '能力索引',
  'capability.lead': 'WorkBuddy 的每一项能力，以及它在 DSH 中对应的能力；DSH 没有对应能力的会明确标出。',
  'cap.experts.name': '专家中心',
  'cap.experts.backing': '由 packages/subagent 与 Agent 预设提供。',
  'cap.skills.name': '技能市场',
  'cap.skills.backing': '由 packages/skill 提供文件系统发现；DSH 没有市场界面。',
  'cap.automation.name': '自动化',
  'cap.automation.backing': '由 packages/schedule 提供能力；DSH 没有写入界面。',
  'cap.connectors.name': '连接器',
  'cap.connectors.backing': '由 packages/mcp 提供。',
  'cap.memory.name': '记忆',
  'cap.memory.backing': 'DSH 没有对应能力。',
  'results.title': '结果区索引',
  'results.lead': 'WorkBuddy 结果区里的每一项，以及 DSH 目前的对应情况。',
  'results.tab': 'WorkBuddy 结果区',
  'results.guide.description': '查看 WorkBuddy 结果区的只读索引',
  'res.changes.name': '变更记录',
  'res.changes.backing': 'DSH 没有独立的变更记录面板；文件改动以会话内的工具行与交付行呈现。',
  'res.preview.name': '浏览器预览',
  'res.preview.backing': 'DSH 没有内置浏览器；右侧栏的文档预览可以只读渲染 HTML 文件。',
  'res.share.name': '分享',
  'res.share.backing': 'DSH 没有对应能力。',
  'index.absent': '无对应能力',
} satisfies Record<string, string>

/** WorkBuddy shell dictionary key union. */
export type WorkBuddyShellKey = keyof typeof zh

/** English dictionary, checked complete against the Chinese key set. */
export const en = {
  'panel.label': 'WorkBuddy capabilities',
  'capability.title': 'Capability index',
  'capability.lead': 'Every WorkBuddy capability and the DSH capability behind it; where DSH has no counterpart, the row says so.',
  'cap.experts.name': 'Expert center',
  'cap.experts.backing': 'Provided by packages/subagent and agent presets.',
  'cap.skills.name': 'Skill market',
  'cap.skills.backing': 'packages/skill provides filesystem discovery; DSH has no market surface.',
  'cap.automation.name': 'Automation',
  'cap.automation.backing': 'packages/schedule provides the capability; DSH has no write UI.',
  'cap.connectors.name': 'Connectors',
  'cap.connectors.backing': 'Provided by packages/mcp.',
  'cap.memory.name': 'Memory',
  'cap.memory.backing': 'DSH has no counterpart.',
  'results.title': 'Results index',
  'results.lead': 'Each surface of the WorkBuddy results area and what DSH has today.',
  'results.tab': 'WorkBuddy results',
  'results.guide.description': 'Read the read-only index of the WorkBuddy results area',
  'res.changes.name': 'Change history',
  'res.changes.backing': 'DSH has no separate change-history panel; file mutations appear as tool rows and the deliverables row.',
  'res.preview.name': 'Browser preview',
  'res.preview.backing': 'DSH has no built-in browser; the right Sidebar document preview renders HTML files read-only.',
  'res.share.name': 'Share',
  'res.share.backing': 'DSH has no counterpart.',
  'index.absent': 'No counterpart',
} satisfies Record<WorkBuddyShellKey, string>
