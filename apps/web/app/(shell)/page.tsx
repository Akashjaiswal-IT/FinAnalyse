import { redirect } from "next/navigation";
import { Dashboard } from "~/components/dashboard/dashboard";

// Links made before the dashboard existed (`/?mode=replay&preset=...&run=...`) belong to the analysis page.
const ANALYZE_KEYS = ["mode", "preset", "asOf", "run", "q"];

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (ANALYZE_KEYS.some((k) => params[k] !== undefined)) {
    const query = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    redirect(`/analyze?${query.toString()}`);
  }
  return <Dashboard />;
}
