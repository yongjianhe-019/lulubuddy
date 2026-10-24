/**
 * `workbuddy.scenarios` namespace dictionaries.
 *
 * Three scenarios, nineteen sub-scenarios, and one prompt starter each. A
 * starter is the question a pick puts in front of the user; a sub-scenario that
 * also names an agent preset gets the capability from that preset's own prompt,
 * so its starter must not restate the protocol that prompt already carries.
 */

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  'scenario.group.aria': '场景',
  'sub.group.aria': '子场景',
  'scroll.prev': '向前滚动',
  'scroll.next': '向后滚动',

  'scenario.office': '日常办公',
  'scenario.code': '代码开发',
  'scenario.design': '设计创意',

  'office.documents': '文档处理',
  'office.documents.template': '帮我处理这份文档：',
  'office.finance': '金融服务',
  'office.finance.template': '帮我分析一下沪深300的盘面：当前评分、所处位置和买卖时机。',
  'office.analytics': '数据分析及可视化',
  'office.analytics.template': '帮我分析这组数据并给出可视化建议：',
  'office.workbench': '个人工作台',
  'office.workbench.template': '帮我整理今天的工作：',
  'office.slides': 'PPT 制作',
  'office.slides.template': '帮我做一份 PPT，主题是：',
  'office.research': '深度研究',
  'office.research.template': '帮我深入研究这个主题并给出报告：',

  'code.daily': '日常开发',
  'code.daily.template': '帮我实现这个功能：',
  'code.website': '网站开发',
  'code.website.template': '帮我做一个网站，需求是：',
  'code.agent': 'Agent 应用',
  'code.agent.template': '帮我构建一个 Agent 应用，需求是：',
  'code.skill': 'Skill 开发',
  'code.skill.template': '帮我写一个 Skill，用途是：',
  'code.cicd': 'CI/CD',
  'code.cicd.template': '帮我配置 CI/CD 流水线，目标是：',
  'code.docs': '文档',
  'code.docs.template': '帮我写一份技术文档，内容是：',

  'design.web': '网页设计',
  'design.web.template': '帮我设计一个网页，需求是：',
  'design.poster': '视觉海报',
  'design.poster.template': '帮我设计一张视觉海报，主题是：',
  'design.video': '视频生成',
  'design.video.template': '帮我做一条短视频，主题是：',
  'design.xhs': '小红书创作',
  'design.xhs.template': '帮我做一篇小红书帖子，主题是：',
  'design.mobile': '移动端 App',
  'design.mobile.template': '帮我设计一个移动端 App 界面，需求是：',
  'design.system': '设计系统',
  'design.system.template': '帮我搭一套设计系统，范围是：',
  'design.brand': '品牌设计',
  'design.brand.template': '帮我做一套品牌视觉，品牌是：',
} satisfies Record<string, string>

/** WorkBuddy scenario dictionary key union. */
export type ScenarioKey = keyof typeof zh

/** English dictionary, checked complete against the Chinese key set. */
export const en = {
  'scenario.group.aria': 'Scenario',
  'sub.group.aria': 'Sub-scenario',
  'scroll.prev': 'Scroll back',
  'scroll.next': 'Scroll forward',

  'scenario.office': 'Office',
  'scenario.code': 'Code',
  'scenario.design': 'Design',

  'office.documents': 'Documents',
  'office.documents.template': 'Help me work on this document: ',
  'office.finance': 'Finance',
  'office.finance.template': 'Help me read the CSI 300: its current score, where it stands, and the buy or sell timing.',
  'office.analytics': 'Data analysis & visualisation',
  'office.analytics.template': 'Help me analyse this dataset and suggest visualisations: ',
  'office.workbench': 'Personal workbench',
  'office.workbench.template': "Help me sort out today's work: ",
  'office.slides': 'Slide deck production',
  'office.slides.template': 'Help me build a slide deck about: ',
  'office.research': 'Deep research',
  'office.research.template': 'Help me research this topic in depth and write it up: ',

  'code.daily': 'Everyday coding',
  'code.daily.template': 'Help me implement this: ',
  'code.website': 'Web development',
  'code.website.template': 'Help me build a website. Requirements: ',
  'code.agent': 'Agent apps',
  'code.agent.template': 'Help me build an agent app. Requirements: ',
  'code.skill': 'Skill authoring',
  'code.skill.template': 'Help me write a skill that: ',
  'code.cicd': 'CI/CD',
  'code.cicd.template': 'Help me configure a CI/CD pipeline for: ',
  'code.docs': 'Docs',
  'code.docs.template': 'Help me write technical documentation for: ',

  'design.web': 'Web design',
  'design.web.template': 'Help me design a web page. Requirements: ',
  'design.poster': 'Poster',
  'design.poster.template': 'Help me design a poster about: ',
  'design.video': 'Video generation',
  'design.video.template': 'Make a short video about: ',
  'design.xhs': 'Xiaohongshu post',
  'design.xhs.template': 'Make a Xiaohongshu post about: ',
  'design.mobile': 'Mobile app',
  'design.mobile.template': 'Help me design a mobile app screen. Requirements: ',
  'design.system': 'Design system',
  'design.system.template': 'Help me build a design system covering: ',
  'design.brand': 'Brand design',
  'design.brand.template': 'Help me build the visual identity for: ',
} satisfies Record<ScenarioKey, string>
