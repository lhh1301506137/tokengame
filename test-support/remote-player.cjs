"use strict";

// 一名远端玩家进程。它对权威的唯一了解就是一个 HTTP origin 和自己的席位凭据：
// 不 require 任何 src/ 模块，不持有牌堆，不知道对手的牌，也无权裁决。
//
// 存在的理由是 L0 根合同那句「不同宿主的玩家最终可以进入同一场中立权威对局」，
// 以及「不由任一玩家宿主掌握牌堆、对手底牌或结算权」。进程内测试证不了这一条——
// 同一个进程里的两个对象天然共享一切。所以这里真起两个操作系统进程。
//
// 结束时向 stdout 打一行 JSON 作为结论，异常时以非零码退出。

const ORIGIN = process.env.TOKENGAME_COMMAND_ORIGIN;
const TOKEN = process.env.TOKENGAME_AUTHORITY_TOKEN;
const SEAT_ID = process.env.TOKENGAME_SEAT_ID;
const CREDENTIAL = process.env.TOKENGAME_SEAT_CREDENTIAL;

const MAX_POLLS = 200;

async function call(command, params = {}) {
  const response = await fetch(`${ORIGIN}/command`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tokengame-authority-token": TOKEN,
    },
    body: JSON.stringify({ command, params }),
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(`${command} -> ${response.status} ${body.code}`);
    error.code = body.code;
    error.status = response.status;
    throw error;
  }
  return body.result;
}

function seatAuth(extra = {}) {
  return { seat_id: SEAT_ID, recovery_credential: CREDENTIAL, ...extra };
}

// view.hand 的返回是 { hand } 包一层，开局前 hand 为 null。这里统一拆开，
// 免得每个调用点都得记住这层包装。
async function handView() {
  return (await call("view.hand", seatAuth())).hand;
}

async function main() {
  for (const name of ["TOKENGAME_COMMAND_ORIGIN", "TOKENGAME_AUTHORITY_TOKEN",
    "TOKENGAME_SEAT_ID", "TOKENGAME_SEAT_CREDENTIAL"]) {
    if (!process.env[name]) throw new Error(`missing env ${name}`);
  }

  // 本进程自己的 player_id 得从权威问，不能靠猜：席位归属只有权威知道。
  const opening = await handView();
  if (opening === null) throw new Error("开局前启动：权威还没有牌局");
  const myPlayerId = opening.seats
    .filter((seat) => seat.hole_cards !== null)
    .map((seat) => seat.id)[0];

  const report = {
    seat_id: SEAT_ID,
    player_id: myPlayerId ?? null,
    my_hole_cards: null,
    // 只要有任何一刻看见了别人的底牌，就记下来。摊牌前这必须一直是空的。
    foreign_cards_seen: [],
    actions_taken: [],
    final_status: null,
    polls: 0,
  };

  for (let poll = 0; poll < MAX_POLLS; poll += 1) {
    report.polls = poll + 1;
    const hand = await handView();
    if (hand === null) {
      report.final_status = "no_hand";
      break;
    }

    const mine = hand.seats.find((seat) => seat.id === report.player_id);
    if (mine && mine.hole_cards !== null) report.my_hole_cards = mine.hole_cards;

    // 摊牌之前，任何非本席的底牌都不该可见。complete 之后的公开摊牌不算越界。
    if (hand.status !== "complete") {
      for (const seat of hand.seats) {
        if (seat.id !== report.player_id && seat.hole_cards !== null) {
          report.foreign_cards_seen.push({ seat: seat.id, cards: seat.hole_cards });
        }
      }
    }

    if (hand.status === "complete") {
      report.final_status = "complete";
      break;
    }

    if (hand.actor_player_id !== report.player_id) {
      // 不是我的回合。让出时间片让对方进程去动作。
      await new Promise((resolve) => setTimeout(resolve, 5));
      continue;
    }

    const legal = hand.legal_actions.map((action) => action.type);
    const choice = legal.includes("check")
      ? "check"
      : legal.includes("call") ? "call" : "fold";
    await call("hand.act", seatAuth({ action: choice }));
    report.actions_taken.push(choice);
  }

  if (report.final_status === null) report.final_status = "poll_limit_reached";
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
