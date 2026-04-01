import { resolve } from "node:path";

export function loadRootModule<T>(relativePath: string): T {
  const absolutePath = resolve(__dirname, "../../../", relativePath);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(absolutePath) as T;
}
