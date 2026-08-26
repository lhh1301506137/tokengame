"use strict";

const { createAuthorityServer } = require("./authority/server.cjs");
const { createBridgeServer } = require("./bridge/server.cjs");

async function main() {
  const authorityPort = Number(process.env.TOKENGAME_AUTHORITY_PORT || 43110);
  const bridgePort = Number(process.env.TOKENGAME_BRIDGE_PORT || 43111);
  const authority = createAuthorityServer({ bootstrap: true });
  const authorityUrl = await authority.start({ port: authorityPort });
  const bridge = createBridgeServer({ authorityUrl });

  try {
    const bridgeUrl = await bridge.start({ port: bridgePort });
    console.log("TokenGame fixed four-seat table is running (local test tokens only).");
    console.log(`Observer table:  ${authorityUrl}`);
    for (const player of authority.playerUrls(authorityUrl)) {
      console.log(`Player ${player.player_id.toUpperCase()} table: ${player.url}`);
    }
    console.log(`Plugin bridge:   ${bridgeUrl}`);
    console.log("Public prompt:   $tokengame public <message>");
    console.log("Press Ctrl+C to stop.");
  } catch (error) {
    await authority.stop();
    throw error;
  }

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await bridge.stop();
    await authority.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
