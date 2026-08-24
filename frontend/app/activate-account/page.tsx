import {ActivateAccountForm} from "@/components/auth/ActivateAccountForm";
import {AppearanceProvider} from "@/components/ui/AppearanceProvider";

export default async function ActivateAccountPage({
  searchParams,
}: {
  searchParams?: Promise<{token?: string}>;
}) {
  const params = (await searchParams) ?? {};
  return (
    <AppearanceProvider key="activate-account">
      <ActivateAccountForm initialToken={params.token ?? ""} />
    </AppearanceProvider>
  );
}
