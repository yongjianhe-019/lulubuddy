# Agent Note: WorkBuddy shell surfaces

Status: implemented

English | [中文](2026-09-15-workbuddy-shell.zh.md)

## Problem

WorkBuddy's office shell orients a user with two navigation surfaces: a left capability column (专家中心, 技能市场, 自动化, 连接器, 记忆) and a right results area (变更记录, 浏览器预览, 分享). DSH has no equivalent shell, and the capabilities behind those surfaces are spread across unrelated packages or absent altogether. A user coming from WorkBuddy has nowhere to see which half of that shell exists here and which half does not, and a naive port that drew the same surfaces as controls would offer buttons for capabilities DSH has no write path to.

## Decision

[`ui-workbuddy-shell`](../../../../packages/client/ui-workbuddy-shell/README.md) renders both surfaces as **read-only indexes**.

The left surface is one `sidebar.panellist` list entry whose `id` is this package's name; the same id keys a capability-index body in the layout's root-scoped keyed `main` slot, so selecting the row selects the panel. The right surface is one tab type registered through `ctx.sidebarRightTabs`, with its body and chip title in the keyed `sidebar.right.pane.tab` and `sidebar.right.pane.tab.title` seats under the definition's `id`. One shared presentational panel draws either row set from module constants, and every string reaches it through the `workbuddy.shell` locale namespace.

Each row states the WorkBuddy surface and the DSH capability behind it, and the `absent` marker marks the surfaces DSH does not have. The five capability rows read: 专家中心 backed by `packages/subagent` plus agent presets; 技能市场 backed by `packages/skill`'s filesystem discovery with no market surface; 自动化 backed by `packages/schedule` with no write UI; 连接器 backed by `packages/mcp`; and **记忆 (Memory), which corresponds to a capability DSH does not have**. The three results rows read: 变更记录 has no dedicated panel (mutations appear as conversation tool rows and the deliverables row); 浏览器预览 has no built-in browser (the right Sidebar's document preview renders HTML files read-only); and **分享 (Share), which likewise corresponds to a capability DSH does not have**.

No row is a control. The package declares no store, no injected write verb, and no click handler, so it cannot render an action that could not act. The one interactive element it contributes is the sidebar row itself, which does something: it selects the panel.

## Alternatives considered

**Port the surfaces as working controls.** A skill-market browser, an automation editor, a browser preview, and a share button would match WorkBuddy's shape more closely, but none of them has a DSH capability behind it. Building them would mean inventing backend capability and write paths in a change scoped to product surface, and shipping them as disabled affordances would state nothing a row does not state more honestly.

**Register the three results surfaces as three tab types.** Three types would give each surface its own chip and let a user open one at a time, but a tab type is a claim that something can be viewed. None of the three has DSH behavior to back a distinct type, so the result would be three dead tabs instead of one index that names all three. One type also keeps the tab registry from filling with entries that only repeat copy.

**Put the capability index in the conversation's main slot.** Reusing the reserved `conversation` key would avoid a second main panel, but that key hosts the Conversation and carries its own session binding and child slots. The `main` slot is keyed precisely so a global panel adds a key beside it; a new key is the additive move, and replacing the Conversation is a different decision entirely.

## Consequences

WorkBuddy's shell is present as navigation and absent as capability. The index is static copy, so mounting or unmounting `packages/mcp`, `packages/skill`, `packages/schedule`, or `packages/subagent` does not change what a row says: the mapping is maintained by hand and a deployment that drops one of those packages still reads the row as backed by it. The absence markers for 记忆 and 分享 are the honest half of the record — they name what DSH has not built rather than hiding it behind a disabled control.

Nothing about the package reaches the model. It adds no tool, no prompt section, no session event, and no model-visible input, and it reads no session data, so the session log does not change and nothing here needs migrating.
