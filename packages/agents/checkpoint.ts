import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

/** Thread memory for follow-ups (SPEC 5.5, rule 5): schema `langgraph`, created once at api start. */
export async function createCheckpointer(connectionString: string): Promise<PostgresSaver> {
  const saver = PostgresSaver.fromConnString(connectionString, { schema: "langgraph" });
  await saver.setup();
  return saver;
}
