import path from "node:path";
import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "playwright") {
    const moduleRoot = process.env.CODEX_BUNDLED_NODE_MODULES;
    if (!moduleRoot) {
      throw new Error("CODEX_BUNDLED_NODE_MODULES is required for the bundled Playwright client");
    }
    return {
      url: pathToFileURL(path.join(moduleRoot, "playwright", "index.mjs")).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}

