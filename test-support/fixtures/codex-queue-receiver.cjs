"use strict";

// Local process fixture, not Codex: never calls a model, reads a credential or
// contacts the game. Tests translate the pinned spawn to this script explicitly.
const assert = require("node:assert/strict");
const [mode, ...args] = process.argv.slice(2);
assert.equal(args.length, 5);
assert.equal(args[0], "queue");
assert.equal(args[1], "--thread");
assert.equal(args[3], "--message");
assert.match(args[4], /^\[LOCAL_CONTROL:tokengame-managed-wake\]/);
process.stdout.write(`${JSON.stringify({ received: true, args })}\n`);
if (mode === "reject") process.exitCode = 17;
else if (mode === "hold") setInterval(() => {}, 1000);
else if (mode === "flood") {
  process.stderr.write("x".repeat(8192));
  setInterval(() => {}, 1000);
} else assert.equal(mode, "accept");
