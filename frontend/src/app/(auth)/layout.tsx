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
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-16">
      {children}
    </div>
  );
}
