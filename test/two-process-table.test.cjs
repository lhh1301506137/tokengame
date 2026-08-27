"use strict";

// L0 宿主中立性的实机证据：两个操作系统进程，各自只握一个 HTTP origin 和自己的席位凭据，
// 在同一份权威状态上打完一手牌。进程内测试证不了这一条——同进程的两个对象天然共享一切。
//
// 这不是宿主适配器。两个子进程没有任何宿主特征（没有 MCP、没有 UI、没有 Codex/Claude
// 专属假设），它们证明的正是「核心不属于任何一个宿主」。真正的宿主适配器仍待实机门禁。

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { createCommandServer, DEFAULT_AUTHORITY_TOKEN } = require("../src/authority/command-server.cjs");
const { stackedDeck } = require("../src/game/holdem.cjs");
const { TABLE_LIFECYCLE_V1 } = require("../src/authority/room-store.cjs");
const { confirmAllSeatsViaSurface, confirmParams } = require("../test-support/public-scope.cjs");

const PLAYER_SCRIPT = path.join(__dirname, "..", "test-support", "remote-player.cjs");
const RULES = "table-rules-v1";

function deck() {
  return stackedDeck([
    "As", "Kd", "Qh", "Jc", "Ts", "9d",
    "2c", "3d", "4h", "5s", "6c",
    "7d", "8h", "9s", "Tc", "Jd", "Qs", "Kh", "Ac", "2h", "3s",
  ]);
}

// 子进程会真的轮询，所以这里用真实时钟。牌局的行动时限远长于本测试。
function runPlayer(origin, seat) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PLAYER_SCRIPT], {
      env: {
        ...process.env,
        TOKENGAME_COMMAND_ORIGIN: origin,
        TOKENGAME_AUTHORITY_TOKEN: DEFAULT_AUTHORITY_TOKEN,
        TOKENGAME_SEAT_ID: seat.seat_id,
        TOKENGAME_SEAT_CREDENTIAL: seat.credential,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`玩家进程 ${seat.seat_id} 退出码 ${code}\n${err}`));
        return;
      }
      try {
        resolve(JSON.parse(out.trim().split("\n").pop()));
      } catch (error) {
        reject(new Error(`玩家进程输出不是 JSON: ${out}\n${err}`));
      }
    });
  });
}

test("宿主中立：两个独立进程在同一份权威状态上打完一手牌", async (t) => {
  // 关掉到期驱动：本测试要断言「显式 hand.start_if_due 会开局」，驱动开着会先把手牌
  // 开出去，让这条断言拿到 hand_in_progress。驱动自己开局的能力在 due-work.test.cjs
  // 里用真实 HTTP 服务单独证。
  const service = createCommandServer({ deckFactory: deck, dueWork: false });
  const origin = await service.start({ host: "127.0.0.1", port: 0 });
  t.after(() => service.stop());

  const s = service.surface;
  const created = s.dispatch("room.create", { player_id: "p1", table_rules_version: RULES });
  const joined = s.dispatch("room.join", { player_id: "p2", invite_code: created.invite_code });

  const seats = [
    { seat_id: created.seat.seat_id, credential: created.recovery_credential },
    { seat_id: joined.seat.seat_id, credential: joined.recovery_credential },
  ];
  // F3：确认按席位记账，逐席带凭据确认。
  confirmAllSeatsViaSurface(s, seats);
  for (const seat of seats) {
    // F4：建连也要带本席凭据。
    s.dispatch("seat.connect", {
      seat_id: seat.seat_id, recovery_credential: seat.credential, connection_id: `c-${seat.seat_id}`,
    });
    s.dispatch("ai.set_mode", {
      seat_id: seat.seat_id, recovery_credential: seat.credential, mode: "OFF",
    });
    s.dispatch("seat.ready", {
      seat_id: seat.seat_id, recovery_credential: seat.credential, ready: true,
    });
  }
  s.dispatch("hand.evaluate_start");

  const decision = s.dispatch("hand.evaluate_start");
  assert.equal(decision.ready_count, 2, `两席都应就绪，实得 ${JSON.stringify(decision)}`);

  // 真实时钟下需要等满倒计时；倒计时是毫秒级常量，等待它是确定性的。
  await new Promise((resolve) => setTimeout(resolve, TABLE_LIFECYCLE_V1.readyCountdownMs + 20));
  const started = s.dispatch("hand.start_if_due");
  assert.equal(started.started, true, `应当开局，实得 ${JSON.stringify(started)}`);

  const [first, second] = await Promise.all([
    runPlayer(origin, seats[0]),
    runPlayer(origin, seats[1]),
  ]);

  for (const report of [first, second]) {
    assert.equal(report.final_status, "complete", `${report.seat_id} 应看到牌局结束`);
    assert.equal(report.my_hole_cards.length, 2, `${report.seat_id} 应看见自己的两张牌`);
    assert.deepEqual(
      report.foreign_cards_seen, [],
      `${report.seat_id} 在摊牌前看见了别人的底牌：${JSON.stringify(report.foreign_cards_seen)}`,
    );
  }

  // 两个进程拿到的是不同的牌，且没有重叠——各自只有自己那两张。
  assert.notDeepEqual(first.my_hole_cards, second.my_hole_cards);
  const overlap = first.my_hole_cards.filter((card) => second.my_hole_cards.includes(card));
  assert.deepEqual(overlap, [], `两席底牌不得重叠，重叠了 ${JSON.stringify(overlap)}`);

  // 防空过：若两个进程都在牌局结束后才连上，foreign_cards_seen 会因为跳过摊牌前检查而
  // 天然为空，上面那条断言就什么也没证明。轮询循环一见 complete 就 break，所以
  // polls > 1 恰好证明第一次轮询看到的是一手活牌。
  for (const report of [first, second]) {
    assert.ok(report.polls > 1, `${report.seat_id} 必须在牌局结束前就看到过它`);
    assert.ok(
      report.actions_taken.length > 0,
      `${report.seat_id} 必须真的提交过动作，否则这局是被超时推完的`,
    );
  }

  // 结算权在权威这边：进程退出后，权威仍然是唯一持有最终状态的一方。
  const projection = s.dispatch("view.projection");
  assert.equal(projection.public_hand.status, "complete");
  assert.ok(projection.public_hand.settlement !== null, "权威应持有结算结果");
});

test("宿主中立：远端进程拿错凭据时进程失败，且权威状态不变", async (t) => {
  // 同上：本测试断言权威状态「不变」，驱动会推进状态，两者会互相干扰。
  const service = createCommandServer({ deckFactory: deck, dueWork: false });
  const origin = await service.start({ host: "127.0.0.1", port: 0 });
  t.after(() => service.stop());

  const s = service.surface;
  const created = s.dispatch("room.create", { player_id: "p1", table_rules_version: RULES });
  s.dispatch("room.confirm_public_scope", confirmParams({
    seat_id: created.seat.seat_id,
    credential: created.recovery_credential,
  }));
  const before = JSON.stringify(s.dispatch("view.projection"));

  await assert.rejects(
    () => runPlayer(origin, {
      seat_id: created.seat.seat_id,
      credential: "wrong-credential-of-the-right-length",
    }),
    (error) => {
      assert.match(error.message, /退出码 1/);
      return true;
    },
  );

  assert.equal(JSON.stringify(s.dispatch("view.projection")), before, "权威状态不得改变");
});
