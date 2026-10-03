import { httpLink, httpBatchStreamLink, httpSubscriptionLink, splitLink } from "@repo/trpc/client";
import { env } from "~/env.js";

interface CreateTRPCHttpBatchClientClientOpts {
  enableStreaming?: boolean;
}

const url = env.NEXT_PUBLIC_API_URL ?? "/trpc";

export const createTRPCHttpBatchClientClient = (opts?: CreateTRPCHttpBatchClientClientOpts) => {
  const c = opts?.enableStreaming ? httpBatchStreamLink : httpLink;
  return c({ url });
};

/** Subscriptions over SSE, everything else over the template link. */
export const createTRPCSplitLink = () =>
  splitLink({
    condition: (op) => op.type === "subscription",
    true: httpSubscriptionLink({ url }),
    false: createTRPCHttpBatchClientClient(),
  });
