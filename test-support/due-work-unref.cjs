"use strict";

// 证明到期驱动的定时器不持有进程。
//
// 这件事只能用独立进程证：同进程里的测试总会调 stop()，而 stop() 之后 unref 有没有都一样，
// 所以「去掉 unref」这个变异在进程内测试里是活的。这里故意**不调 stop()**，把驱动开着就
// 结束脚本主体——unref 生效则进程自然退出，不生效则挂死到父进程超时。
//
// 退出码 0 且有 STARTED 输出 = unref 生效。

const { createDueWorkDriver } = require("../src/authority/due-work.cjs");
const { TableOrchestrator } = require("../src/authority/table-orchestrator.cjs");

const orchestrator = new TableOrchestrator();
// 间隔取小值：若定时器真的持有进程，父进程能更快看出它没退出，而不是误判成启动慢。
const driver = createDueWorkDriver({ orchestrator, intervalMs: 20 });

driver.start();
if (driver.running !== true) {
  console.log("NOT_RUNNING");
  process.exit(3);
}

// 先让定时器真的走几次表，确保它已被注册进事件循环——否则「进程退出」可能只是因为
// 定时器还没来得及生效，那样就算漏掉 unref 也会误判成通过。
let seen = 0;
const probe = setInterval(() => {
  seen += 1;
  if (seen < 3) return;
  clearInterval(probe);
  if (driver.ticks < 1) {
    console.log("NEVER_TICKED");
    process.exit(4);
  }
  // 关键：不调 driver.stop()。此后事件循环里只剩下这个被 unref 的定时器。
  console.log(`STARTED ticks=${driver.ticks}`);
}, 25);
