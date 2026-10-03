import { api } from "~/trpc/server";
import { LiveHeartbeat } from "~/components/terminal/live-heartbeat";

export const dynamic = "force-dynamic";

async function apiStatus(): Promise<string> {
  try {
    const { status } = await api.health.getHealth.query();
    return status;
  } catch {
    return "unreachable";
  }
}

export default async function Home() {
  const status = await apiStatus();
  return (
    <main className="min-h-screen min-w-screen flex justify-center items-center">
      <div className="space-y-2">
        <h1 className="text-3xl">Tempest</h1>
        <h2>Server Status: {status}</h2>
        <LiveHeartbeat />
      </div>
    </main>
  );
}
