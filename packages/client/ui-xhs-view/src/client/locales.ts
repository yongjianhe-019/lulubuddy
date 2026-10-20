/**
 * `xhs` namespace dictionaries for the Xiaohongshu post card.
 *
 * The Chinese side is the key-set source of truth and the English side is
 * checked against it. Every label the card draws, including the unit
 * formatters, comes from here.
 */

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  'card.title': '小红书帖子',
  'card.subtitle': '第 {number} 篇 · {topic}',
  'status.ready': '待发布',
  'state.running': '正在打包帖子：写文件、跑两道发布检查、更新运营手册……',
  'state.empty': '这一次调用没有返回结果。',
  'warnings.title': '发布提示',

  'media.label': '成片预览',
  'media.unavailable': '本次部署未挂载播放路由，请直接打开下面这个文件。',
  'media.unsupported': '这个浏览器无法播放该文件，请直接打开下面这个文件。',

  'section.title': '标题',
  'section.body': '正文',
  'section.tags': '标签',
  'section.pinned': '置顶评论',
  'section.checks': '发布前检查',
  'section.files': '落盘文件',

  'copy.title': '复制标题',
  'copy.body': '复制正文',
  'copy.tags': '复制标签',
  'copy.pinned': '复制置顶评论',
  'copy.all': '复制发布包',
  'copied': '已复制',
  'copy.failed': '复制失败',

  'check.detect': 'detect',
  'check.scan': '发布前扫描',
  'check.pass': '通过',
  'check.fail': '未通过',
  'check.hits': '{value} 处命中',
  'check.hardSoft': '🔴{hard} · 🟡{soft}',

  'file.draft': '成稿',
  'file.publish': '发布版',
  'file.video': '视频',

  'kpi.duration': '时长',
  'kpi.frame': '画面',
  'kpi.size': '文件大小',
  'unit.seconds': '{value} 秒',
  'unit.frame': '{width}×{height} · {fps}fps',
  'unit.megabytes': '{value} MB',
  'unit.kilobytes': '{value} KB',

  'note.unpublished': '生成完成，未自动发布。复制后到小红书手动发布。',
} satisfies Record<string, string>

/** Xiaohongshu card dictionary key union. */
export type XhsViewKey = keyof typeof zh

/** English dictionary, checked complete against the Chinese key set. */
export const en = {
  'card.title': 'Xiaohongshu post',
  'card.subtitle': 'Post {number} · {topic}',
  'status.ready': 'Ready to publish',
  'state.running': 'Packaging the post: writing files, running both publication gates, updating the manual…',
  'state.empty': 'This call returned no result.',
  'warnings.title': 'Publication notes',

  'media.label': 'Finished video',
  'media.unavailable': 'This deployment mounted no playback route; open the file below instead.',
  'media.unsupported': 'This browser cannot play the file; open it below instead.',

  'section.title': 'Title',
  'section.body': 'Body',
  'section.tags': 'Hashtags',
  'section.pinned': 'Pinned comment',
  'section.checks': 'Publication gates',
  'section.files': 'Files',

  'copy.title': 'Copy title',
  'copy.body': 'Copy body',
  'copy.tags': 'Copy hashtags',
  'copy.pinned': 'Copy pinned comment',
  'copy.all': 'Copy publish package',
  'copied': 'Copied',
  'copy.failed': 'Copy failed',

  'check.detect': 'detect',
  'check.scan': 'Outbound scan',
  'check.pass': 'Passed',
  'check.fail': 'Failed',
  'check.hits': '{value} hits',
  'check.hardSoft': '🔴{hard} · 🟡{soft}',

  'file.draft': 'Draft',
  'file.publish': 'Publish copy',
  'file.video': 'Video',

  'kpi.duration': 'Duration',
  'kpi.frame': 'Frame',
  'kpi.size': 'File size',
  'unit.seconds': '{value} s',
  'unit.frame': '{width}×{height} · {fps}fps',
  'unit.megabytes': '{value} MB',
  'unit.kilobytes': '{value} KB',

  'note.unpublished': 'Packaged, not published. Copy the package and publish it in Xiaohongshu manually.',
} satisfies Record<XhsViewKey, string>

/** Locale namespace the Xiaohongshu card registers its dictionaries under. */
export const NS = 'xhs'
