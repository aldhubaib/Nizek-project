import { SignUp } from "@clerk/nextjs";
import { AuthLayout } from "@/components/auth/auth-layout";

export default function SignUpPage() {
  return (
    <AuthLayout>
      <SignUp
        appearance={{
          elements: {
            rootBox: "w-full",
            cardBox: "w-full shadow-none bg-transparent",
            card: "w-full bg-transparent shadow-none p-0",
            header: "hidden",
            footer: "hidden",
          },
        }}
      />
    </AuthLayout>
  );
}
