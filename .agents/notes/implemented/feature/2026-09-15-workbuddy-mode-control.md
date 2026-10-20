# Agent Note: WorkBuddy collaboration mode control

Status: implemented

English | [中文](2026-09-15-workbuddy-mode-control.zh.md)

## Problem

WorkBuddy presents one posture control — Ask, Plan, or Craft — and a user reasons about a single choice. DSH expresses the same two axes as two independent surfaces: the plan chip in the composer's `conversation.input.plan` seat, and the permission picker behind `/permission`. A deployment that wants the WorkBuddy posture therefore had no single control, and a user had to know that "answer without touching the workspace" means a permission preset rather than a mode.

## Decision

[`ui-workbuddy-mode`](../../../../packages/client/ui-workbuddy-mode/README.md) adds the segmented control into the composer's `conversation.input.left` list seat.

The control owns no mode state. It reads the host-computed `plan` and `permissions` projections and derives the active mode from them: plan mode on (or entering) reads as **Plan**; otherwise a `read-only` preset reads as **Ask** and any other preset reads as **Craft**. Plan mode wins the derivation because it is the stronger constraint — it holds the model in review regardless of sandbox.

Every write goes through the ordinary command channel (`/plan`, `/plan off`, `/permission <preset>`), so the control adds no session event and no model-visible input. The marked option follows the projections only; a click submits commands and disables the group until they settle, and the highlight moves when the Host pushes the resulting projection frame.

`Craft` clears a `read-only` restriction back to `workspace-write` and otherwise leaves the preset alone, so a deliberate `danger-full-access` selection survives a round trip through `Ask` instead of being silently narrowed. The seat stays empty while either projection is absent, matching the convention the plan chip and the permission picker already follow.

## Alternatives considered

**Store a `mode` field as session state.** This gives the control one authoritative value and makes the derivation trivial, but the two knobs it summarizes remain separately writable — by `/plan`, by `/permission`, and by the General-settings default. A stored mode would be a third source of truth to reconcile against two that the Host already owns, and it would need a session event to be reconstructable.

**Replace `ui-plan` in the single `conversation.input.plan` seat.** Reusing the seat avoids a new control and keeps every plan affordance in one place, but a `single` seat admits exactly one occupant, so this is a package replacement rather than a plugin contribution. The seat also carries the `locked` owner share and is sized for a status chip, not a three-option group.

**Force `workspace-write` when Craft is selected.** This makes the three modes a closed cycle where each always re-asserts a full posture, but it silently narrows a session a user deliberately widened, and the narrowing would be invisible until the next blocked write.

**Derive Ask from the approval policy instead of the sandbox preset.** Approval and sandbox are separate knobs and a deployment can configure either; keying on the sandbox preset is the one that actually restricts writes, which is what "只问不动" means.

## Consequences

The three modes are a presentation over the cross-product of two host capabilities rather than a stored state, so a session whose knobs match no mode still renders the nearest one and clicking it re-asserts that mode's commands. Nothing needs migrating and no session log changes.

`Ask` constrains writes, not knowledge: a model may still answer from workspace content it read in an earlier turn. The mapping also names the shipped preset keys `read-only` and `workspace-write` directly, so a deployment that renames them changes what `Ask` and `Craft` submit without the control being able to notice.
