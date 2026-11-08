// @vitest-environment jsdom
/**
 * The create card, driven by the exact document and payload one live render
 * produced on 2026-09-27 (1080x1920, 8.112 s, 1,277,851 bytes, two scenes).
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { VideoCreateView } from '../src/client/VideoCreateView.tsx'
import type { VideoViewProps } from '../src/client/parts.tsx'
import { zh } from '../src/client/locales.ts'
import { meta, rendered, renderedBlock, running, settled, type RunningBlock, type SettledBlock } from './fixtures.client.ts'

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
    toolName: 'video_create',
    block,
    openFile: vi.fn(),
    t,
  } as unknown as VideoViewProps
}

/**
 * The measured render with one payload member replaced.
 * @param over - the member to replace.
 * @returns a settled node carrying the changed payload.
 */
function payloadWith(over: Record<string, unknown>): SettledBlock {
  return settled(rendered('create'), { meta: { ...meta('create'), ...over } })
}

describe('the create card over the measured render', () => {
  it('reports the render\'s own numbers', () => {
    const view = render(<VideoCreateView {...props(renderedBlock())} />)
    const text = view.container.textContent ?? ''
    expect(text).toContain('短视频')
    expect(text).toContain('8.1')
    expect(text).toContain('1080×1920 · 30fps')
    expect(text).toContain('1.3')
    expect(text).toContain('zh-CN-XiaoxiaoNeural')
    // The file's own path is always shown, whatever the player can do.
    expect(text).toContain('/Users/hyj/.dsh/video/out/real-render-check.mp4')
  })

  it('plays the video through the playback route', () => {
    const view = render(<VideoCreateView {...props(renderedBlock())} />)
    const player = view.container.querySelector('video')
    expect(player?.getAttribute('src')).toBe('/video/out/real-render-check.mp4')
    expect(player?.hasAttribute('controls')).toBe(true)
    // The element is labelled by the video's title rather than by widget jargon.
    expect(player?.getAttribute('aria-label')).toBe('真机渲染验证')
  })

  it('lists every scene with its place on the timeline', () => {
    const view = render(<VideoCreateView {...props(renderedBlock())} />)
    const text = view.container.textContent ?? ''
    expect(text).toContain('第 1 段')
    expect(text).toContain('第 2 段')
    expect(text).toContain('0.0 → 4.2')
    expect(text).toContain('4.2 → 8.1')
    expect(text).toContain('两个要点')
    expect(text).toContain('第一句，市场估值处于历史中位。')
    // A scene whose narration came from the cache says so.
    expect(text).toContain('复用已有配音')
  })

  it('keeps the raw fallback for a result that carries no render', () => {
    const view = render(<VideoCreateView {...props(settled(rendered('create')))} />)
    expect(view.container.textContent).toContain('"operation": "create"')
    expect(view.container.querySelector('video')).toBeNull()
  })

  it('says a render is running rather than showing an empty card', () => {
    const view = render(<VideoCreateView {...props(running())} />)
    expect(view.container.textContent).toContain('正在渲染')
  })

  it('says a settled call returned nothing', () => {
    const view = render(<VideoCreateView {...props(settled('', { content: [] }))} />)
    expect(view.container.textContent).toContain('没有返回结果')
  })
})

describe('when the player cannot be used', () => {
  it('names the missing playback route instead of a dead control', () => {
    const view = render(<VideoCreateView {...props(payloadWith({ url: null }))} />)
    expect(view.container.querySelector('video')).toBeNull()
    expect(view.container.textContent).toContain('未挂载播放路由')
    // The file is still named, because opening it is what remains available.
    expect(view.container.textContent).toContain('real-render-check.mp4')
  })

  it('says so when the browser refuses the file', () => {
    const view = render(<VideoCreateView {...props(renderedBlock())} />)
    const player = view.container.querySelector('video') as HTMLVideoElement
    fireEvent.error(player)
    expect(view.container.querySelector('video')).toBeNull()
    expect(view.container.textContent).toContain('无法播放该文件')
  })
})

describe('production notes', () => {
  it('surfaces the notes the result carried ahead of the numbers', () => {
    const text = `Production warnings:\n- no playback route is mounted\n\n${rendered('create')}`
    const view = render(<VideoCreateView {...props(settled(text, { meta: meta('create') }))} />)
    expect(view.container.textContent).toContain('制作提示')
    expect(view.container.textContent).toContain('no playback route is mounted')
  })

  it('renders no notes section when the result carried none', () => {
    const view = render(<VideoCreateView {...props(renderedBlock())} />)
    expect(view.container.textContent).not.toContain('制作提示')
  })

  it('keeps the card when the render is readable but the document is not', () => {
    const view = render(<VideoCreateView {...props(settled('not a document', { meta: meta('create') }))} />)
    expect(view.container.querySelector('video')).not.toBeNull()
    expect(screen.queryByText('制作提示')).toBeNull()
  })

  it('keeps the card when the result carries a render and no text at all', () => {
    // A result whose text blocks were pruned still has a payload, so the card
    // draws it and reports no notes rather than falling back to nothing.
    const view = render(<VideoCreateView {...props(settled('', { meta: meta('create'), content: [] }))} />)
    expect(view.container.querySelector('video')).not.toBeNull()
    expect(view.container.textContent).toContain('8.1')
    expect(view.container.textContent).not.toContain('制作提示')
  })

  it('marks only the scenes whose narration was reused', () => {
    const payload = meta('create')
    const scenes = (payload['scenes'] as Record<string, unknown>[]).map((scene, index) => ({ ...scene, cached: index === 0 }))
    const view = render(<VideoCreateView {...props(payloadWith({ scenes }))} />)
    expect(view.container.textContent?.match(/复用已有配音/g)).toHaveLength(1)
  })
})
