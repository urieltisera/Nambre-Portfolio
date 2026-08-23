import {ForgotPasswordForm} from "@/components/auth/ForgotPasswordForm";
import {AppearanceProvider} from "@/components/ui/AppearanceProvider";

export default function ForgotPasswordPage() {
  return (
    <AppearanceProvider key="forgot-password">
      <ForgotPasswordForm />
    </AppearanceProvider>
  );
}
