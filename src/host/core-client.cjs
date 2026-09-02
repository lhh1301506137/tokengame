"use strict";

// 到牌桌核心的客户端。宿主中立：不引用 Codex / Claude / MCP / 浏览器。
//
// 存在的理由是 L0 根合同那句「不由任一玩家宿主掌握牌堆、对手底牌或结算权」。命令面本身
// 是一个进程内对象，谁 require 它谁就把整副牌装进了自己的进程。所以想让「宿主只是客户端」
// 这件事成立，宿主侧必须有一个只会说 dispatch 的东西——就是这里。
//
// 两种实现，同一个接口：
//
//   HttpCoreClient      走 command-server 的 /command。真实部署形态，也是唯一能证明
//                       「核心在另一个进程」的那种。
//   InProcessCoreClient 直接调 CommandSurface.dispatch。给测试用：注入冻结时钟与
//                       固定牌堆后，整条链路可确定性重放。
//
// 三条自我约束：
//   1. 不新增产品语义。这一层只做「搬运 + 错误归一」，一条命令都不解释。
//   2. 不缓存投影。缓存等于在宿主侧持有一份可能过期的牌桌状态，而「谁是权威」是 L0
//      的核心；读到旧值的 UI 会开始自己推断，那就是第二个 TokenGame 的起点。
//   3. 不持有席位凭据。凭据归 SeatCustody（F6）。本层收到什么参数就发什么参数。
//
// 为什么两种实现都要有、而不是只留 HTTP：注入时钟的测试没法跨进程冻结时间——子进程有
// 自己的 Date.now。而只留进程内实现就回到了「宿主嵌核心」，那正是要否定的形态。所以
// 两个都留，并由 test/table-web-host.test.cjs 对同一批断言各跑一遍。

const { AUTHORITY_TOKEN_HEADER } = require("../authority/command-server.cjs");
const { requestEnvelope } = require("../contract/adapter-contract.cjs");

// 归一后的错误。宿主侧只认这一个类：HTTP 那边错误是 JSON body，进程内那边是 ProbeError
// 实例，两者形状不同。让宿主自己去分辨等于让每个调用点都写两套判断。
class CoreError extends Error {
  constructor(code, status = 400, details = undefined) {
    super(code);
    this.name = "CoreError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function checkCancellation(signal) {
  if (signal !== undefined && !(signal instanceof AbortSignal)) throw new CoreError("invalid_field", 400, { field: "signal" });
  if (signal?.aborted) throw new CoreError("core_request_cancelled", 409);
}

class HttpCoreClient {
  constructor({ origin, token, fetchImpl = fetch } = {}) {
    if (typeof origin !== "string" || origin === "") {
      throw new CoreError("invalid_field", 400, { field: "origin" });
    }
    this.origin = origin.replace(/\/$/, "");
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.transport = "http";
  }

  async dispatch(command, params = {}, { signal } = {}) {
    checkCancellation(signal);
    let response;
    try {
      response = await this.fetchImpl(`${this.origin}/command`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [AUTHORITY_TOKEN_HEADER]: this.token,
        },
        // 请求信封由合同层构造，不在这里拼字面量：两处各写一份的话，改合同不会影响
        // 传输，而合同文档描述的是 helper。服务端会校验 contract_version，缺了就 400。
        body: JSON.stringify(requestEnvelope(command, params)),
        // 权威令牌不得由 fetch 自动搬运到 Location 指向的另一 origin。全部重定向失败关闭，
        // 比区分 301/307 或同源/跨源更容易审计，也不会把错误代理伪装成核心响应。
        redirect: "error",
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (cause) {
      checkCancellation(signal);
      // 核心不可达要有自己的错误码。让 fetch 的原始报错穿到浏览器等于把 Node 的
      // 网络实现细节变成 UI 文案，而调用方真正需要判断的只有「核心断了」这一件事。
      throw new CoreError("core_unreachable", 502, { command });
    }

    let body;
    checkCancellation(signal);
    try {
      body = await response.json();
    } catch {
      checkCancellation(signal);
      throw new CoreError("core_response_not_json", 502, { status: response.status });
    }

    checkCancellation(signal);
    if (response.ok === false || body?.ok === false) {
      throw new CoreError(
        body?.code ?? "core_request_failed",
        response.status,
        body?.details,
      );
    }
    return body.result;
  }
}

class InProcessCoreClient {
  constructor({ surface } = {}) {
    if (surface === null || typeof surface?.dispatch !== "function") {
      throw new CoreError("invalid_field", 400, { field: "surface" });
    }
    this.surface = surface;
    this.transport = "in_process";
  }

  // 仍然是 async。调用方不该因为换了传输就要改写 await——那会让「两种实现可互换」
  // 变成一句空话，也会让测试走的代码路径和真实部署的不一样。
  async dispatch(command, params = {}, { signal } = {}) {
    checkCancellation(signal);
    try {
      const result = await this.surface.dispatch(command, params);
      checkCancellation(signal);
      return result;
    } catch (error) {
      // ProbeError 有 code/status/details，形状与 HTTP 那边归一后一致。其它异常是真 bug，
      // 不套壳：套上 CoreError 会让编程错误看起来像一个可处理的业务失败。
      if (error?.name === "ProbeError") {
        throw new CoreError(error.code, error.status ?? 400, error.details);
      }
      throw error;
    }
  }
}

module.exports = { CoreError, HttpCoreClient, InProcessCoreClient };
