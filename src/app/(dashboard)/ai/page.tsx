import { getConversations } from "@/lib/actions/ai";
import AIAssistant from "./AIAssistant";

export default async function AIPage() {
  const conversations = await getConversations();
  return <AIAssistant initialConversations={conversations} />;
}
