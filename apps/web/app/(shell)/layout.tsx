import { TopBar } from "~/components/shell/top-bar";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <TopBar />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
