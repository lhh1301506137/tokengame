"use strict";

// F3：默认公开确认按席位记账，所以测试 harness 要逐席确认，不能整桌按一次。
//
// 抽成共用助手是因为八个 harness 都要这么做。各写一遍的风险不是重复，而是某个 harness
// 为了省事只确认第一席、再把断言改成「反正它能发言」——那就把刚修掉的洞又测回来了。

// 编排层内的逐席确认。凭据在进程内不需要：编排层是可信的，把关在命令面。
function confirmAllSeats(orchestrator, seatIds) {
  return seatIds.map((seatId) => orchestrator.confirmPublicScope({
    seatId,
    acknowledged: true,
  }));
}

// 命令面的逐席确认。seats 里每项要有 seat_id 与 credential——凭据是这一层的门。
function confirmAllSeatsViaSurface(surface, seats) {
  return seats.map((seat) => surface.dispatch("room.confirm_public_scope", {
    seat_id: seat.seat_id,
    recovery_credential: seat.credential ?? seat.recovery_credential,
    acknowledged: true,
  }));
}

// 命令面单参形状，给只需要一席的调用点。
function confirmParams(seat) {
  return {
    seat_id: seat.seat_id,
    recovery_credential: seat.credential ?? seat.recovery_credential,
    acknowledged: true,
  };
}

module.exports = { confirmAllSeats, confirmAllSeatsViaSurface, confirmParams };
