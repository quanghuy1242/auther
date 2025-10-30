import { notFound } from "next/navigation";
import { getUserById } from "./actions";
import { UserDetailClient } from "./user-detail-client";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function UserDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getUserById(id);

  if (!user) {
    notFound();
  }

  return (
    <div className="max-w-6xl mx-auto">
      <UserDetailClient user={user} />
    </div>
  );
}
