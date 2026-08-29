"use strict";

// 合同版本号，单一来源。
//
// 为什么它住在 shared 而不是 contract：说这个版本号的有两侧。
//
//   适配器侧（src/contract/adapter-contract.cjs）用它构造请求与响应信封。
//   传输侧（src/authority/command-server.cjs）用它校验进来的请求信封。
//
// 让传输 require 合同层会把依赖方向倒过来——权威内核依赖适配器合同，于是改合同能
// 弄坏内核，而内核本该是稳定的那一侧。抄一份常量到传输侧则更糟：两份数字迟早差一，
// 而差一的表现是一次静默的语义漂移，正是这个版本号存在的理由。所以两侧都从这里读。
//
// 单调整数，不用 semver。适配器与宿主的兼容判断只需要「你认得我说的话吗」这一个答案，
// 而 semver 的三段式会诱使人去实现「minor 兼容」那套推断——两边由不同的人在不同时间
// 写，那种推断迟早会错。

const CONTRACT_VERSION = 1;

module.exports = { CONTRACT_VERSION };
