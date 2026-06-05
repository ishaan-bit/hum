import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

export function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export default {};", shortCircuit: true };
  }

  if (specifier.startsWith("@/")) {
    return nextResolve(toTypeScriptUrl(resolvePath(process.cwd(), specifier.slice(2))), context);
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const resolvedPath = resolvePath(dirname(parentPath), specifier);
    if (existsSync(`${resolvedPath}.ts`)) {
      return nextResolve(pathToFileURL(`${resolvedPath}.ts`).href, context);
    }
  }

  return nextResolve(specifier, context);
}

function toTypeScriptUrl(path) {
  if (existsSync(path)) return pathToFileURL(path).href;
  if (existsSync(`${path}.ts`)) return pathToFileURL(`${path}.ts`).href;
  if (existsSync(`${path}.tsx`)) return pathToFileURL(`${path}.tsx`).href;
  return pathToFileURL(path).href;
}
