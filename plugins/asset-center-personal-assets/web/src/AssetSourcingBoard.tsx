import "./styles.css";

import { Badge } from "@openai/apps-sdk-ui/components/Badge";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import { RadioGroup } from "@openai/apps-sdk-ui/components/RadioGroup";
import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  callTool,
  openExternalLink,
  publishConfirmedPlan,
  requestFullscreen,
  restoredWidgetState,
  saveWidgetState,
  subscribeToolOutput,
} from "./bridge";

const CHARACTER_DESIGNER_URL = "https://studio.13-216-49-19.sslip.io/asset-center/characters/new";

type Asset = {
  id: string;
  displayName: string;
  categoryLabel?: string;
  classification?: string;
  description?: string;
  animations?: string[];
  sizeBytes?: number;
  parentAssetId?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  source?: string;
};

type Proposal = any;
type ChoiceState = { slots: Record<string, { model: any; actions: Record<string, any> }> };

function modelAssets(slot: any): Asset[] {
  return [slot.model.recommended, ...(slot.model.alternatives ?? [])].filter(Boolean);
}

function defaultActionChoice(action: any, model: any) {
  const linked = action.candidates?.find((entry: Asset) => entry.parentAssetId === model.assetId);
  if (action.defaultSource === "reuse_linked_action" && linked) return { source: "reuse_linked_action", assetId: linked.id };
  if (action.defaultSource === "generate_action") {
    const reused = model.source === "reuse_asset_center" || model.source === "reuse_project";
    if (!reused || action.generationRoute?.supportedForReusedBase) return { source: "generate_action" };
  }
  if (action.defaultSource === "primitive_fallback") return { source: "primitive_fallback" };
  return { source: "runtime_procedural" };
}

function defaultState(proposal: Proposal): ChoiceState {
  const slots: ChoiceState["slots"] = {};
  for (const slot of proposal.slots) {
    let model: any;
    if (slot.model.defaultSource === "reuse_asset_center" && slot.model.recommended) {
      model = { source: "reuse_asset_center", assetId: slot.model.recommended.id };
    } else if (slot.model.defaultSource === "reuse_project" && slot.model.projectCandidates?.[0]) {
      model = { source: "reuse_project", assetId: slot.model.projectCandidates[0].id };
    } else {
      model = { source: slot.model.defaultSource };
    }
    slots[slot.id] = { model, actions: Object.fromEntries(slot.actions.map((action: any) => [action.name, defaultActionChoice(action, model)])) };
  }
  return { slots };
}

function totals(proposal: Proposal, choices: ChoiceState) {
  const result = { imports: 0, generatedModels: 0, generatedActions: 0, runtimeActions: 0, fallbacks: 0, tripoCost: 0 };
  for (const slot of proposal.slots) {
    const selected = choices.slots[slot.id];
    if (!selected) continue;
    if (selected.model.source === "reuse_asset_center") result.imports += 1;
    if (selected.model.source === "generate_new") result.generatedModels += 1;
    if (selected.model.source === "primitive_fallback") result.fallbacks += 1;
    for (const action of slot.actions) {
      const choice = selected.actions[action.name];
      if (!choice) continue;
      if (choice.source === "reuse_linked_action" || choice.source === "reuse_compatible_action") result.imports += 1;
      if (choice.source === "generate_action") { result.generatedActions += 1; result.tripoCost += action.cost ?? 0; }
      if (choice.source === "runtime_procedural") result.runtimeActions += 1;
      if (choice.source === "primitive_fallback") result.fallbacks += 1;
    }
  }
  return result;
}

function modelValue(choice: any) {
  return choice.assetId ? `${choice.source}:${choice.assetId}` : choice.source;
}

function parseModelValue(value: string) {
  const [source, assetId] = value.split(":", 2);
  return assetId ? { source, assetId } : { source };
}

function candidateMeta(entry: Asset) {
  return [entry.classification, entry.animations?.slice(0, 2).join("/"), entry.sizeBytes ? `${(entry.sizeBytes / 1_000_000).toFixed(1)} MB` : null].filter(Boolean).join(" · ");
}

function shouldRecommendCharacterDesign(slot: any, selected: any) {
  if (String(slot.assetKind ?? "").toLowerCase() !== "character") return false;
  const hasReusableModel = Boolean(slot.model.projectCandidates?.length || modelAssets(slot).length);
  const missingLinkedAction = slot.actions?.some((action: any) =>
    !(action.candidates ?? []).some((entry: Asset) => entry.parentAssetId === selected.model.assetId),
  );
  return !hasReusableModel || selected.model.source === "generate_new" || Boolean(missingLinkedAction);
}

function modelSourceCopy(source: string) {
  if (source === "reuse_project") return { label: "项目复用", tone: "success" as const };
  if (source === "reuse_asset_center") return { label: "资产中心", tone: "info" as const };
  if (source === "generate_new") return { label: "新生成", tone: "warning" as const };
  return { label: "Fallback", tone: "secondary" as const };
}

function slotChoiceAsset(slot: any, choice: any): Asset | null {
  const candidates = [...(slot.model.projectCandidates ?? []), ...modelAssets(slot)];
  return candidates.find((entry: Asset) => entry.id === choice?.model?.assetId) ?? null;
}

function CandidateRow({ entry, selected, onFocus }: { entry: Asset; selected: boolean; onFocus: () => void }) {
  return (
    <span className="candidate-row" data-selected={selected} onMouseEnter={onFocus} onClick={onFocus}>
      {entry.thumbnailUrl ? <img className="candidate-thumb" src={entry.thumbnailUrl} alt="" /> : <span className="candidate-thumb candidate-thumb-empty">GLB</span>}
      <span><span className="candidate-name">{entry.displayName}</span><span className="candidate-meta">{candidateMeta(entry) || "可预览资产"}</span></span>
      {selected ? <Badge color="info" pill>已选择</Badge> : null}
    </span>
  );
}

export function AssetSourcingBoard() {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [choices, setChoices] = useState<ChoiceState | null>(null);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [focused, setFocused] = useState<Asset | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const fullscreenRequested = useRef(false);

  useEffect(() => subscribeToolOutput((output) => {
    const next = output?.proposal ?? output;
    if (next?.schema !== "shark-asset-sourcing-proposal") return;
    const restored = restoredWidgetState();
    setProposal(next);
    setChoices(restored?.runId === next.runId && restored?.choices ? restored.choices : defaultState(next));
    setActiveSlotId(restored?.runId === next.runId && restored?.activeSlotId ? restored.activeSlotId : next.slots[0]?.id ?? null);
  }), []);

  useEffect(() => {
    if (!proposal || !choices) return;
    saveWidgetState({ runId: proposal.runId, choices, activeSlotId, focusedId: focused?.id ?? null });
  }, [proposal, choices, activeSlotId, focused]);

  const activeSlot = proposal?.slots.find((slot: any) => slot.id === activeSlotId) ?? proposal?.slots[0];
  const selected = activeSlot && choices?.slots[activeSlot.id];
  const summary = useMemo(() => proposal && choices ? totals(proposal, choices) : null, [proposal, choices]);

  useEffect(() => {
    if (!proposal || fullscreenRequested.current) return;
    fullscreenRequested.current = true;
    if (proposal.slots.length > 1) void requestFullscreen();
  }, [proposal]);

  useEffect(() => {
    if (!activeSlot || focused) return;
    setFocused(modelAssets(activeSlot)[0] ?? null);
  }, [activeSlot, focused]);

  if (!proposal || !choices || !activeSlot || !selected || !summary) return <div className="loading">等待资产方案…</div>;
  const recommendCharacterDesign = shouldRecommendCharacterDesign(activeSlot, selected);

  const selectedAsset = slotChoiceAsset(activeSlot, selected);
  const selectedSource = modelSourceCopy(selected.model.source);

  const updateModel = (value: string) => {
    const model = parseModelValue(value);
    setChoices((current) => {
      const next = structuredClone(current!);
      next.slots[activeSlot.id].model = model;
      next.slots[activeSlot.id].actions = Object.fromEntries(activeSlot.actions.map((action: any) => [action.name, defaultActionChoice(action, model)]));
      return next;
    });
    const asset = slotChoiceAsset(activeSlot, { model });
    setFocused(asset ?? null);
  };

  const updateAction = (actionName: string, value: string) => {
    const [source, assetId] = value.split(":", 2);
    setChoices((current) => {
      const next = structuredClone(current!);
      next.slots[activeSlot.id].actions[actionName] = assetId ? { source, assetId } : { source };
      return next;
    });
  };

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await callTool("confirm_asset_sourcing_plan", { proposal, uiState: choices });
      const plan = result?.structuredContent ?? result?.structured_content ?? result;
      if (plan?.schema !== "shark-asset-sourcing-plan") throw new Error("确认工具未返回有效方案");
      publishConfirmedPlan(plan);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPending(false);
    }
  };

  return (
    <main className="sourcing-shell">
      <header className="sourcing-header">
        <div className="header-copy"><span className="eyebrow">ASSET SOURCING</span><h1 className="sourcing-title">关键资产来源确认</h1><p className="sourcing-subtitle">{proposal.gameSummary ?? "先复用已有资产，只生成最终缺口"}</p></div>
        <div className="header-actions"><div className="quick-summary"><span>{proposal.slots.length} 个资产</span><span>{summary.generatedModels} 个新模型</span><span>预计消耗 {summary.tripoCost}</span></div><Button color="secondary" variant="soft" onClick={() => void requestFullscreen()}>全屏选择</Button></div>
      </header>
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="sourcing-workspace">
        <nav className="sourcing-rail" aria-label="资产槽位">
          <div className="rail-label">资产清单</div>
          {proposal.slots.map((slot: any, index: number) => {
            const choice = choices.slots[slot.id];
            const source = modelSourceCopy(choice?.model?.source ?? slot.model.defaultSource);
            return <button type="button" className="slot-button" data-active={slot.id === activeSlot.id} key={slot.id} onClick={() => { setActiveSlotId(slot.id); setFocused(slotChoiceAsset(slot, choice) ?? modelAssets(slot)[0] ?? null); }}><span className="slot-index">{String(index + 1).padStart(2, "0")}</span><span className="slot-copy"><strong>{slot.name}</strong><span>{slot.role} · {slot.actions.length} 个动作</span></span><span className="slot-state" data-tone={source.tone}>{source.label}</span></button>;
          })}
        </nav>
        <section className="sourcing-options">
          <div className="section-heading asset-heading"><div><span className="section-kicker">{activeSlot.assetKind} · {activeSlot.tier}</span><h2>{activeSlot.name}</h2></div><Badge color={activeSlot.model.confidence === "high" ? "success" : "warning"}>{activeSlot.model.confidence} 置信度</Badge></div>
          <p className="decision-note">{activeSlot.model.reason ?? "请选择本体来源"}</p>
          <div className="choice-label">模型来源</div>
          <RadioGroup aria-label={`${activeSlot.name}本体来源`} direction="col" value={modelValue(selected.model)} onChange={updateModel}>
            {activeSlot.model.projectCandidates?.map((entry: Asset) => <RadioGroup.Item block key={entry.id} value={`reuse_project:${entry.id}`}>{entry.displayName} · 项目已有</RadioGroup.Item>)}
            {modelAssets(activeSlot).map((entry) => <RadioGroup.Item block key={entry.id} value={`reuse_asset_center:${entry.id}`}><CandidateRow entry={entry} selected={selected.model.assetId === entry.id} onFocus={() => setFocused(entry)} /></RadioGroup.Item>)}
            <RadioGroup.Item block value="generate_new"><span className="source-option"><span><strong>生成新模型</strong><small>{activeSlot.model.generator ?? "按当前游戏风格创建原创 GLB"}</small></span>{activeSlot.model.defaultSource === "generate_new" ? <Badge color="warning" pill>推荐</Badge> : null}</span></RadioGroup.Item>
            <RadioGroup.Item block value="primitive_fallback"><span className="source-option"><span><strong>Primitive 兜底</strong><small>保持玩法可运行，不作为最终视觉资产</small></span></span></RadioGroup.Item>
          </RadioGroup>
          {recommendCharacterDesign ? <aside className="character-design-cta"><div><strong>为以后积累可复用人物与动作</strong><p>在资产中心设计并发布人物模型及动作 GLB，后续游戏可自动推荐同一人物的静态模型和关联动作。</p></div><Button color="secondary" variant="soft" onClick={() => void openExternalLink(CHARACTER_DESIGNER_URL)}>设计人物资产</Button></aside> : null}
          <div className="actions">
            {activeSlot.actions.map((action: any) => {
              const linked = action.candidates?.filter((entry: Asset) => entry.parentAssetId === selected.model.assetId) ?? [];
              const actionValue = selected.actions[action.name]?.assetId ? `${selected.actions[action.name].source}:${selected.actions[action.name].assetId}` : selected.actions[action.name]?.source;
              const reusedBase = selected.model.source === "reuse_asset_center" || selected.model.source === "reuse_project";
              return <section className="action-block" key={action.name}><div className="section-heading"><h3>{action.name}</h3><Badge color="secondary">动作</Badge></div><p className="action-scene">{action.scene}</p><RadioGroup aria-label={`${action.name}动作来源`} direction="col" value={actionValue} onChange={(value) => updateAction(action.name, value)}>{linked.map((entry: Asset) => <RadioGroup.Item block key={entry.id} value={`reuse_linked_action:${entry.id}`}>{entry.displayName} · 关联动作</RadioGroup.Item>)}<RadioGroup.Item block value="generate_action" disabled={reusedBase && !action.generationRoute?.supportedForReusedBase}>生成动作{action.cost ? ` · ${action.cost} 次` : ""}</RadioGroup.Item><RadioGroup.Item block value="runtime_procedural">运行时动作 · 0 消耗</RadioGroup.Item><RadioGroup.Item block value="primitive_fallback">动作兜底</RadioGroup.Item></RadioGroup></section>;
            })}
          </div>
        </section>
        <aside className="sourcing-inspector">
          <div className="inspector-label">方案预览</div>
          {focused?.previewUrl ? <iframe key={focused.id} className="inspector-preview" src={focused.previewUrl} title={`${focused.displayName} 3D 预览`} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" /> : focused?.thumbnailUrl ? <img className="inspector-image" src={focused.thumbnailUrl} alt={focused.displayName} /> : <div className="inspector-preview generation-preview"><span className="generation-orbit"/><span className="generation-core">{selected.model.source === "generate_new" ? "NEW" : "GLB"}</span><span>{selected.model.source === "generate_new" ? "等待生成后显示 3D 模型" : "暂无可用预览"}</span></div>}
          <div className="inspector-copy"><div className="inspector-title-row"><h2>{focused?.displayName ?? selectedAsset?.displayName ?? (selected.model.source === "generate_new" ? "原创模型生成方案" : "当前模型方案")}</h2><Badge color={selectedSource.tone}>{selectedSource.label}</Badge></div><p>{focused?.description ?? selectedAsset?.description ?? activeSlot.model.reason ?? "确认后将按当前选择处理该资产。"}</p><div className="inspector-tags"><Badge color="secondary">{activeSlot.assetKind}</Badge><Badge color="secondary">{activeSlot.tier}</Badge>{activeSlot.rigType ? <Badge color="info">{activeSlot.rigType}</Badge> : null}{focused?.classification ? <Badge color="info">{focused.classification}</Badge> : null}{focused?.animations?.map((name) => <Badge color="secondary" key={name}>{name}</Badge>)}</div>{focused?.sizeBytes ? <p>大小：{(focused.sizeBytes / 1_000_000).toFixed(2)} MB</p> : null}</div>
          {activeSlot.actions.length ? <div className="inspector-actions"><span>动作计划</span>{activeSlot.actions.map((action: any) => <div key={action.name}><strong>{action.name}</strong><small>{selected.actions[action.name]?.source === "generate_action" ? `生成 · ${action.cost ?? 0} 消耗` : selected.actions[action.name]?.source === "runtime_procedural" ? "运行时 · 0 消耗" : "复用 / 兜底"}</small></div>)}</div> : null}
        </aside>
      </div>
      <footer className="sourcing-footer"><div className="totals"><span>导入 {summary.imports}</span><span>生成模型 {summary.generatedModels}</span><span>生成动作 {summary.generatedActions}</span><span>运行时 {summary.runtimeActions}</span><span>Fallback {summary.fallbacks}</span><span>预计消耗 {summary.tripoCost}</span></div><Button color="primary" size="lg" loading={pending} disabled={pending} onClick={() => void confirm()}>确认资产方案并开始制作</Button></footer>
    </main>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<AssetSourcingBoard />);
