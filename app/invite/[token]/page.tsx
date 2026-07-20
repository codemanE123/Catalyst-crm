import InviteRedeemForm from "@/app/components/InviteRedeemForm";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-4 py-10">
      <InviteRedeemForm token={token} />
    </main>
  );
}
