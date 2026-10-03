import { MemoryRunsRepo } from "./memory";
import { runsServiceSuite } from "./suite";

runsServiceSuite("the memory repo", () => new MemoryRunsRepo());
