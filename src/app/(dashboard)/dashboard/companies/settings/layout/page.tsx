import { redirect } from "next/navigation";

export default function CompaniesLayoutIndexPage() {
  redirect("/dashboard/companies/settings#layout");
}
