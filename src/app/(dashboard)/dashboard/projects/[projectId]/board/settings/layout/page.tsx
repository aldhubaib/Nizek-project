import { redirect } from "next/navigation";

export default async function ProjectBoardLayoutIndexPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/dashboard/projects/${projectId}/board/settings#layout`);
}
