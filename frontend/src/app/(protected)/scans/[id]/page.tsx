import { ScanReviewPage } from "@/components/scans/ScanReviewPage";

export const instant = false;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ScanReviewPage scanId={id} />;
}
