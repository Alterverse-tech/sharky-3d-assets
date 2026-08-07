import "./styles.css";

import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";

import {
  callTool,
  openExternalLink,
  publishConfirmedPlan,
  restoredWidgetState,
  saveWidgetState,
  subscribeToolOutput,
} from "./bridge";

const CHARACTER_DESIGNER_URL = "https://studio.13-216-49-19.sslip.io/asset-center/characters/new";

type Asset = {
  id: string;
  displayName: string;
  classification?: string;
  description?: string;
  animations?: string[];
  sizeBytes?: number;
  parentAssetId?: string;
  previewUrl?: string;
  compatibility?: { status?: string };
};

type Proposal = any;
type ChoiceState = { slots: Record<string, { model: any; actions: Record<string, any> }> };
type ChoiceRow = {
  key: string;
  value: string;
  label: string;
  source: string;
  detail?: string;
  previewUrl?: string;
  recommended?: boolean;
  disabled?: boolean;
};

function modelAssets(slot: any): Asset[] {
  return [slot.model.recommended, ...(slot.model.alternatives ?? [])].filter(Boolean);
}

function modelValue(choice: any) {
  return choice.assetId ? `${choice.source}:${choice.assetId}` : choice.source;
}

function parseChoiceValue(value: string) {
  const [source, assetId] = value.split(":", 2);
  return assetId ? { source, assetId } : { source };
}

function defaultActionChoice(action: any, model: any) {
  if (action.defaultSource === "reuse_linked_action") {
    const linked = action.candidates?.find((entry: Asset) => entry.parentAssetId === model.assetId);
    if (linked) return { source: "reuse_linked_action", assetId: linked.id };
  }
  if (action.defaultSource === "reuse_compatible_action") {
    const compatible = action.candidates?.find((entry: Asset) => entry.compatibility?.status === "verified");
    if (compatible) return { source: "reuse_compatible_action", assetId: compatible.id };
  }
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
    slots[slot.id] = {
      model,
      actions: Object.fromEntries(slot.actions.map((action: any) => [action.name, defaultActionChoice(action, model)])),
    };
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
      if (choice.source === "generate_action") {
        result.generatedActions += 1;
        result.tripoCost += action.cost ?? 0;
      }
      if (choice.source === "runtime_procedural") result.runtimeActions += 1;
      if (choice.source === "primitive_fallback") result.fallbacks += 1;
    }
  }
  return result;
}

function previewUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function assetDetail(asset: Asset) {
  return [
    asset.classification,
    asset.animations?.length ? asset.animations.slice(0, 2).join(" / ") : null,
    asset.sizeBytes ? `${(asset.sizeBytes / 1_000_000).toFixed(1)} MB` : null,
  ].filter(Boolean).join(" · ");
}

function modelRows(slot: any): ChoiceRow[] {
  const rows: ChoiceRow[] = [];
  for (const entry of slot.model.projectCandidates ?? []) {
    rows.push({
      key: `project:${entry.id}`,
      value: `reuse_project:${entry.id}`,
      label: entry.displayName,
      source: "当前项目",
      detail: assetDetail(entry),
      previewUrl: previewUrl(entry.previewUrl),
      recommended: slot.model.defaultSource === "reuse_project" && entry.id === slot.model.projectCandidates[0]?.id,
    });
  }
  for (const entry of modelAssets(slot)) {
    rows.push({
      key: `center:${entry.id}`,
      value: `reuse_asset_center:${entry.id}`,
      label: entry.displayName,
      source: "Asset Center",
      detail: assetDetail(entry),
      previewUrl: previewUrl(entry.previewUrl),
      recommended: slot.model.defaultSource === "reuse_asset_center" && entry.id === slot.model.recommended?.id,
    });
  }
  rows.push({
    key: "generate_new",
    value: "generate_new",
    label: `生成原创${slot.name}`,
    source: "新生成",
    detail: slot.model.generator ?? "按当前游戏风格生成 GLB",
    previewUrl: String(slot.assetKind).toLowerCase() === "character" ? CHARACTER_DESIGNER_URL : undefined,
    recommended: slot.model.defaultSource === "generate_new",
  });
  rows.push({
    key: "primitive_fallback",
    value: "primitive_fallback",
    label: "Three.js 基础几何兜底",
    source: "程序模型",
    detail: "只在模型不可用时保证玩法可运行",
    recommended: slot.model.defaultSource === "primitive_fallback",
  });
  return rows;
}

function actionRows(action: any, selectedModel: any): ChoiceRow[] {
  const rows: ChoiceRow[] = [];
  for (const entry of action.candidates ?? []) {
    const linked = Boolean(selectedModel.assetId && entry.parentAssetId === selectedModel.assetId);
    const compatible = entry.compatibility?.status === "verified";
    if (!linked && !compatible) continue;
    const source = linked ? "reuse_linked_action" : "reuse_compatible_action";
    rows.push({
      key: `${source}:${entry.id}`,
      value: `${source}:${entry.id}`,
      label: entry.displayName,
      source: linked ? "关联动作 GLB" : "兼容动作 GLB",
      detail: assetDetail(entry),
      previewUrl: previewUrl(entry.previewUrl),
      recommended: action.defaultSource === source,
    });
  }
  const reusedBase = selectedModel.source === "reuse_asset_center" || selectedModel.source === "reuse_project";
  const generationDisabled = reusedBase && !action.generationRoute?.supportedForReusedBase;
  rows.push({
    key: "generate_action",
    value: "generate_action",
    label: action.preset ?? `生成 ${action.name} 动作 GLB`,
    source: action.generator ?? "新生成",
    recommended: action.defaultSource === "generate_action" && !generationDisabled,
    disabled: generationDisabled,
  });
  rows.push({
    key: "runtime_procedural",
    value: "runtime_procedural",
    label: "运行时程序动画",
    source: "程序动画",
    recommended: action.defaultSource === "runtime_procedural" || generationDisabled,
  });
  rows.push({
    key: "primitive_fallback",
    value: "primitive_fallback",
    label: "动作兜底",
    source: "运行时",
    recommended: action.defaultSource === "primitive_fallback",
  });
  return rows;
}

function ChoiceList({
  label,
  rows,
  selectedValue,
  onSelect,
}: {
  label: string;
  rows: ChoiceRow[];
  selectedValue: string;
  onSelect: (value: string) => void;
}) {
  return <div className="choice-list">{rows.map((row) => {
    const selected = selectedValue === row.value;
    return (
      <label className="choice-option" data-selected={selected || undefined} data-disabled={row.disabled || undefined} key={row.key}>
        <input
          type="checkbox"
          checked={selected}
          disabled={row.disabled}
          onChange={() => onSelect(row.value)}
          aria-label={`选择${label}：${row.label}`}
        />
        <span className="choice-copy">
          {row.previewUrl ? (
            <a
              className="candidate-link"
              href={row.previewUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void openExternalLink(row.previewUrl!);
              }}
            >
              {row.label}<span aria-hidden="true">↗</span>
            </a>
          ) : <span className="candidate-name">{row.label}</span>}
          <small>{row.source}{row.detail ? ` · ${row.detail}` : ""}</small>
        </span>
        <em>{row.disabled ? "不可用" : selected ? (row.recommended ? "推荐" : "已选") : ""}</em>
      </label>
    );
  })}</div>;
}

export function AssetSourcingBoard() {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [choices, setChoices] = useState<ChoiceState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => subscribeToolOutput((output) => {
    const next = output?.proposal ?? output;
    if (next?.schema !== "shark-asset-sourcing-proposal") return;
    const restored = restoredWidgetState();
    setProposal(next);
    setChoices(restored?.runId === next.runId && restored?.choices ? restored.choices : defaultState(next));
  }), []);

  useEffect(() => {
    if (proposal && choices) saveWidgetState({ runId: proposal.runId, choices });
  }, [proposal, choices]);

  const summary = useMemo(() => proposal && choices ? totals(proposal, choices) : null, [proposal, choices]);

  if (!proposal || !choices || !summary) return <div className="loading">等待资产方案…</div>;

  const updateModel = (slot: any, value: string) => {
    const model = parseChoiceValue(value);
    setChoices((current) => {
      const next = structuredClone(current!);
      next.slots[slot.id].model = model;
      next.slots[slot.id].actions = Object.fromEntries(
        slot.actions.map((action: any) => [action.name, defaultActionChoice(action, model)]),
      );
      return next;
    });
  };

  const updateAction = (slotId: string, actionName: string, value: string) => {
    setChoices((current) => {
      const next = structuredClone(current!);
      next.slots[slotId].actions[actionName] = parseChoiceValue(value);
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
      <header>
        <div><h1>资产选择表</h1><p>{proposal.gameSummary ?? "选择每项游戏需求使用的资产方案"}</p></div>
        <span>{proposal.slots.length} 个关键资产</span>
      </header>
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="table-scroll">
        <table>
          <thead><tr><th>角色/实体</th><th>模型来源</th><th>动作</th><th>触发场景</th><th>动作来源</th></tr></thead>
          <tbody>
            {proposal.slots.map((slot: any) => {
              const selected = choices.slots[slot.id];
              if (!selected) return null;
              const actions = slot.actions.length ? slot.actions : [null];
              return actions.map((action: any, index: number) => (
                <tr key={`${slot.id}:${action?.name ?? "static"}`}>
                  {index === 0 ? (
                    <th className="entity-cell" rowSpan={actions.length} scope="rowgroup">
                      <strong>{slot.name}</strong>
                      <span>{slot.tier}</span>
                    </th>
                  ) : null}
                  {index === 0 ? (
                    <td className="model-source-cell" rowSpan={actions.length}>
                      <ChoiceList
                        label={`${slot.name}模型来源`}
                        rows={modelRows(slot)}
                        selectedValue={modelValue(selected.model)}
                        onSelect={(value) => updateModel(slot, value)}
                      />
                    </td>
                  ) : null}
                  <td className="action-cell">{action?.name ?? "—"}</td>
                  <td className="scene-cell">{action?.scene ?? "静态实体，无动作触发"}</td>
                  <td className="action-source-cell">
                    {action ? (
                      <ChoiceList
                        label={`${slot.name} ${action.name}动作来源`}
                        rows={actionRows(action, selected.model)}
                        selectedValue={modelValue(selected.actions[action.name])}
                        onSelect={(value) => updateAction(slot.id, action.name, value)}
                      />
                    ) : <span className="no-action">无需动作</span>}
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
      <aside className="rules">
        <strong>选择说明</strong>
        <span>每个角色/实体只选择一个模型来源；每个动作只选择一个动作来源。</span>
        <span>绿色勾选是当前方案；带 ↗ 的名称可点击并在浏览器打开 HTTP 预览页。</span>
      </aside>
      <footer>
        <div className="totals">
          <span>导入 {summary.imports}</span><span>生成模型 {summary.generatedModels}</span>
          <span>生成动作 {summary.generatedActions}</span><span>运行时 {summary.runtimeActions}</span>
          <span>Fallback {summary.fallbacks}</span>
        </div>
        <button className="confirm-button" type="button" disabled={pending} onClick={() => void confirm()}>
          {pending ? "正在确认…" : "确认资产方案并开始制作"}
        </button>
      </footer>
    </main>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<AssetSourcingBoard />);
