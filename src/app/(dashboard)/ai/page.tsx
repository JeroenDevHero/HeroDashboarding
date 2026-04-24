import { getConversations } from "@/lib/actions/ai";
import { getSuggestedQuestions } from "@/lib/actions/suggestions";
import AIAssistant from "./AIAssistant";

export default async function AIPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [conversations, suggestions] = await Promise.all([
    getConversations(),
    getSuggestedQuestions(6),
  ]);
  const { conversation } = await searchParams;
  const initialConversationId =
    typeof conversation === "string" ? conversation : undefined;

  return (
    <AIAssistant
      initialConversations={conversations}
      initialConversationId={initialConversationId}
      suggestedQuestions={suggestions.map((s) => s.question)}
    />
  );
}
