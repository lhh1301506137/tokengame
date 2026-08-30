"use strict";

// 令牌比较。唯一一份实现。
//
// 为什么值得单独一个文件：这个函数只有九行，而它的两种写坏方式都不会让功能变坏。
//
//   1. 用 === 比较。功能完全正常，比较时间随匹配前缀长度变化，于是持有网络访问的人
//      可以一个字符一个字符地问出令牌。
//   2. 在循环里 return false。同样功能正常，同样按前缀泄漏——而它读起来比 === 更像
//      「已经做了防护」，因为循环和异或都在。
//
// 两份同义实现的漂移方向因此很具体：某一处被改成早返回，而它的调用点从此按前缀泄漏，
// 另一处不会变红。所以调用方都引这一份，测试也按「循环里没有 return」钉住它。

// 逐字符异或累加，无条件走完。
//
// 长度不同时短路是可以的：长度本来就能从别的地方观察到（响应体大小、传输层），而按长度
// 短路避免了「短令牌与长令牌比较时读越界」。真正要保护的是「前 n 个字符对不对」。
function sameToken(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  if (provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}

// 「这个令牌配置能用吗」只有这一个定义。
//
// 空串与 undefined 都算没配。空串特别值得挡：`TOKENGAME_MODEL_TOKEN=` 在 shell 里是
// 一个合法的赋值，而它读出来是空串——如果把空串当成「配了」，那道门就对所有人开着，
// 因为请求方不带这个头时读到的也是空。
function usableToken(value) {
  return typeof value === "string" && value.length > 0;
}

module.exports = { sameToken, usableToken };
