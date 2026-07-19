import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account access",
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[calc(100vh-8rem)] bg-[#f7f6f2] px-4 py-8 sm:px-6 sm:py-14">
      <div className="mx-auto grid min-h-[620px] max-w-5xl overflow-hidden rounded-[2rem] border border-black/[0.07] bg-white shadow-[0_24px_70px_rgba(23,23,20,0.08)] lg:grid-cols-[0.86fr_1.14fr]">
        <aside className="relative hidden overflow-hidden bg-[#191916] px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-sm font-black tracking-[-0.08em] text-primary-foreground">
                BFS
              </span>
              <div>
                <p className="text-sm font-bold tracking-tight">beFitBeStrong</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
                  Built for the work
                </p>
              </div>
            </div>
            <p className="mt-16 max-w-xs text-4xl font-semibold leading-[1.05] tracking-tight">
              Keep every session moving forward.
            </p>
            <p className="mt-5 max-w-sm text-sm leading-6 text-white/60">
              One account for your orders, saved products, rewards, and the gear
              that supports your next session.
            </p>
          </div>
        </aside>
        <main className="flex items-center px-5 py-10 sm:px-10 sm:py-14 lg:px-16">
          <div className="mx-auto w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  );
}
