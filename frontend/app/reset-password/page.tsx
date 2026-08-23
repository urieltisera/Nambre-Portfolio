import {ResetPasswordForm} from "@/components/auth/ResetPasswordForm";
import {AppearanceProvider} from "@/components/ui/AppearanceProvider";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{token?: string}>;
}) {
  const params = (await searchParams) ?? {};
  return (
    <AppearanceProvider key="reset-password">
      <ResetPasswordForm initialToken={params.token ?? ""} />
    </AppearanceProvider>
  );
}
