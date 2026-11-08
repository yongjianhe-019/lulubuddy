// @vitest-environment jsdom
/**
 * The render-environment card, driven by the report one real `video_setup` call
 * produced on 2026-09-27 (Remotion 4.0.529, edge-tts 7.2.8).
 */

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { VideoSetupView } from '../src/client/VideoSetupView.tsx'
import type { VideoViewProps } from '../src/client/parts.tsx'
import { zh } from '../src/client/locales.ts'
import { document, running, settled, type RunningBlock, type SettledBlock } from './fixtures.client.ts'

const t: VideoViewProps['t'] = makeTranslate(zh, commonZh)

afterEach(cleanup)

/**
 * Compose the card's props over one result node.
 * @param block - the settled or running node.
 * @returns the composed props.
 */
function props(block: SettledBlock | RunningBlock): VideoViewProps {
  return {
    callId: 'call-video',
    toolName: 'video_setup',
    block,
    openFile: vi.fn(),
    t,
  } as unknown as VideoViewProps
}

/**
 * The measured setup document with one member replaced.
 * @param over - the member to replace.
 * @returns a settled node carrying the changed report.
 */
function reportWith(over: Record<string, unknown>): SettledBlock {
  return settled(`\`\`\`json\n${JSON.stringify({ ...document('setup'), ...over })}\n\`\`\``)
}

describe('the setup card over the measured report', () => {
  it('reports the project and the versions a prepared environment carries', () => {
    const view = render(<VideoSetupView {...props(settled(`\`\`\`json\n${JSON.stringify(document('setup'))}\n\`\`\``))} />)
    const text = view.container.textContent ?? ''
    expect(text).toContain('渲染环境')
    expect(text).toContain('/Users/hyj/.dsh/video')
    expect(text).toContain('4.0.529')
    expect(text).toContain('7.2.8')
  })

  it('reports what this call wrote and what was already there', () => {
    const wrote = render(<VideoSetupView {...props(settled(`\`\`\`json\n${JSON.stringify(document('setup'))}\n\`\`\``))} />)
    expect(wrote.container.textContent).toContain('本次已写入')
    expect(wrote.container.textContent).toContain('本次已安装')
    expect(wrote.container.textContent).toContain('已就绪')

    cleanup()
    const current = render(<VideoSetupView {...props(reportWith({
      laid_template: false,
      installed_packages: false,
      browser_ready: false,
    }))} />)
    expect(current.container.textContent).toContain('已是最新')
    expect(current.container.textContent).toContain('已存在')
  })

  it('shows an unknown version rather than a blank', () => {
    const view = render(<VideoSetupView {...props(reportWith({ remotion_version: null, edge_tts_version: null }))} />)
    expect(view.container.textContent).toContain('—')
  })

  it('keeps the raw fallback for a result that carries no report', () => {
    const view = render(<VideoSetupView {...props(settled('{"operation":"setup"}'))} />)
    expect(view.container.textContent).toContain('"operation":"setup"')
  })

  it('keeps the raw fallback for a settled result with no text at all', () => {
    const view = render(<VideoSetupView {...props(settled('', { content: [] }))} />)
    expect(view.container.textContent).toContain('没有返回结果')
  })

  it('keeps the raw fallback for text that is not a document', () => {
    const view = render(<VideoSetupView {...props(settled('not a document'))} />)
    expect(view.container.textContent).toContain('not a document')
  })

  it('surfaces the notes a setup carried', () => {
    const text = `Production warnings:\n- no playback route is mounted\n\n\`\`\`json\n${JSON.stringify(document('setup'))}\n\`\`\``
    const view = render(<VideoSetupView {...props(settled(text))} />)
    expect(view.container.textContent).toContain('制作提示')
    expect(view.container.textContent).toContain('no playback route is mounted')
  })

  it('says what a running setup is doing, and why it is slow the first time', () => {
    // The first setup installs packages and downloads a browser with nothing
    // streamed into the transcript, so the card states what the wait is.
    const view = render(<VideoSetupView {...props(running())} />)
    expect(view.container.textContent).toContain('正在准备渲染环境')
    expect(view.container.textContent).toContain('首次需要几分钟')
  })

  it('says a settled setup returned nothing', () => {
    expect(render(<VideoSetupView {...props(settled('', { content: [] }))} />).container.textContent)
      .toContain('没有返回结果')
  })
})
