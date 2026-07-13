import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "neutral";

const styles: Record<Tone, string> = {
  success:
    "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  warning: "bg-orange-500/10 text-orange-600 ring-orange-500/20",
  neutral: "bg-muted text-muted-foreground ring-border",
};

export function StatusPill({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs ring-1 ring-inset",
        styles[tone],
      )}
    >
      {children}
    </span>
  );
}
