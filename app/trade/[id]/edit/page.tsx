import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TradeEditRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/trade/write?id=${encodeURIComponent(id)}`);
}
