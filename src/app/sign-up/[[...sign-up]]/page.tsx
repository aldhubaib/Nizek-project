import { SignUp } from "@clerk/nextjs";
import { AuthLayout } from "@/components/auth/auth-layout";

export default function SignUpPage() {
  return (
    <AuthLayout>
      <SignUp
        appearance={{
          elements: {
            rootBox: { width: "100%" },
            cardBox: { width: "100%", boxShadow: "none", background: "transparent" },
            card: { width: "100%", background: "transparent", boxShadow: "none", padding: 0 },
            headerTitle: { display: "none" },
            headerSubtitle: { display: "none" },
            header: { display: "none" },
            footer: { display: "none" },
          },
        }}
      />
    </AuthLayout>
  );
}
