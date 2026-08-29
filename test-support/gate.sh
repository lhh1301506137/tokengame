#!/usr/bin/env bash
# 转发壳。判定住在 test-support/gate.cjs，这里不复制一份。
#
# 原来这个文件自己就是门禁。问题是 `npm run gate` 于是必须先找到一个能用的 bash：在原生
# PowerShell 里 PATH 上的 bash 解析到 C:\WINDOWS\system32\bash.exe（WSL，不是 Git Bash），
# 本机 WSL 又坏在 localhost 代理上——同一条命令在 Git Bash 里绿、在 PowerShell 里跑不起来。
# 判定口径不该由 PATH 的先后顺序决定，所以搬到了 node。
#
# 保留这个文件，是因为已经有证据文档写了 `bash test-support/gate.sh` 这条命令；壳保证那条
# 命令继续指向同一个判定。壳里不放任何判断——两份判定逻辑迟早分叉，而分叉的那天两边都会
# 声称自己是门禁。
set -u
exec node test-support/gate.cjs "$@"
