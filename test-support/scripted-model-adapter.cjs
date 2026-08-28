"use strict";

// 确定性脚本模型适配器。
//
// ============================ 这不是一个模型 ============================
//
// 它按一张查表返回固定文本，不做任何推理，也不访问任何模型。存在的唯一目的是让
// 「座位旁 AI 会公开发言」这条链路在浏览器验收里可复现——同样的输入必须得到同样
// 的气泡，否则验收断言只能写成「有某种发言」，那等于没验收。
//
// simulated: true 是硬编码的，不接受覆盖。视图会把它显示成「（模拟）」，所以任何
// 一张截图都自证这不是真实宿主能力。Codex 的硬要求里写着「不得声称 Codex 当前任务
// 或 Claude Cowork 已通过无点击主动唤醒」——真实宿主的主动唤醒仍然未验证，本文件
// 不改变那个事实，也不构成它的证据。
//
// 真实适配器该长什么样是第四阶段的事（共享 HostAdapter 契约）。那时这个文件仍然
// 有用：它是契约的参考实现与测试替身。

const DEFAULT_LINES = Object.freeze([
  "这一手我先看看牌面。",
  "对手这个下注尺度偏大。",
  "位置不好，我倾向谨慎。",
  "牌面有听牌，别给便宜价。",
  "这轮我没什么可说的。",
]);

// 决定说不说话的规则：按已评估次数取模。不用随机数——随机会让「AI 恰好这次没说话」
// 与「AI 坏了」在验收里无法区分。
function createScriptedModelAdapter(options = {}) {
  const lines = Array.isArray(options.lines) && options.lines.length > 0
    ? [...options.lines]
    : [...DEFAULT_LINES];
  // silentEvery: N —— 每第 N 次评估选择沉默。默认 0 = 从不主动沉默，因为验收要先
  // 看到「会说话」，沉默是单独一条用例去测的。
  const silentEvery = Number.isInteger(options.silentEvery) && options.silentEvery > 0
    ? options.silentEvery
    : 0;
  const perSeat = new Map();
  const calls = [];

  return {
    label: options.label ?? "scripted-test-adapter",
    // 硬编码。不读 options，也不提供覆盖入口。
    simulated: true,

    // 供测试检查它到底被怎么调用的。真实适配器不需要这个。
    calls,

    async evaluate(input) {
      const seatId = input.seat_id;
      const count = (perSeat.get(seatId) ?? 0) + 1;
      perSeat.set(seatId, count);
      calls.push({ seat_id: seatId, turn_id: input.turn_id, nth: count });

      // 上下文是权威组装的，适配器只看得见公开信息加本席底牌。这里做一次断言性质的
      // 检查：如果哪天上下文里出现了别席底牌，测试适配器要第一个发现。
      if (input.context !== null && typeof input.context === "object") {
        const text = JSON.stringify(input.context);
        if (text.includes("\"recovery_credential\"") || text.includes("\"credential\"")) {
          throw new Error("adapter_context_carried_credential");
        }
      }

      if (silentEvery > 0 && count % silentEvery === 0) {
        return { decision: "silent" };
      }
      // 文本里带上序号，让浏览器验收能断言「这是第几句」而不只是「有一句」。
      const line = lines[(count - 1) % lines.length];
      return { decision: "public_speech", text: `${line}（第 ${count} 次）` };
    },
  };
}

// 环境变量入口：`TOKENGAME_MODEL_ADAPTER=test-support/scripted-model-adapter.cjs`
// 时 run-table-web.cjs 会 require 本文件并调用它。
module.exports = createScriptedModelAdapter;
module.exports.createScriptedModelAdapter = createScriptedModelAdapter;
module.exports.DEFAULT_LINES = DEFAULT_LINES;
