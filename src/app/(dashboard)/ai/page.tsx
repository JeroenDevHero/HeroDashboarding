import { getConversations } from "@/lib/actions/ai";
import AIAssistant from "./AIAssistant";

export default async function AIPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const conversations = await getConversations();
  const { conversation } = await searchParams;
  const initialConversationId =
    typeof conversation === "string" ? conversation : undefined;

  return (
    <AIAssistant
      initialConversations={conversations}
      initialConversationId={initialConversationId}
    />
  );
}
