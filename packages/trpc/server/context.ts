import type { IncomingMessage } from "node:http";

/** The demo token is checked only by procedures that require it (runs.create, system.ingestNow). */
export async function createContext({ req }: { req: Pick<IncomingMessage, "headers"> }) {
  const header = req.headers["x-demo-token"];
  return { demoToken: Array.isArray(header) ? header[0] : header };
}
export type Context = Awaited<ReturnType<typeof createContext>>;
