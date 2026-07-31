export type DiscussionMessage = {
  message_id: string;
  author: string;
  author_role: "student" | "ta" | "staff";
  created_at: string;
  content: string;
};

export type DiscussionThread = {
  thread_id: string;
  channel: string;
  topic: string;
  scope: "learning" | "logistics" | "off_topic" | "restricted";
  resolved: boolean;
  official_answer: boolean;
  permalink: string;
  messages: DiscussionMessage[];
};

export type RetrievalCandidate = DiscussionThread & {
  searchText: string;
  semanticScore: number | null;
  lexicalScore: number;
  score: number;
};

export type ResolverStatus =
  | "resolved"
  | "clarify"
  | "escalated"
  | "out_of_scope";

export type ResolverSource = {
  id: string;
  threadId: string;
  channel: string;
  author: string;
  time: string;
  excerpt: string;
  relevance: number;
  permalink: string;
};

export type ResolverTrace = {
  mode: "demo" | "live";
  embeddingModel: string | null;
  resolverModel: string | null;
  retrieved: Array<{
    threadId: string;
    topic: string;
    score: number;
    semanticScore: number | null;
    lexicalScore: number;
  }>;
  validatedSourceIds: string[];
  rejectedSourceIds: string[];
  latencyMs: number;
};

export type ResolverResponse = {
  status: ResolverStatus;
  understoodAs: string;
  answer: string;
  confidence: number;
  foundCount: number;
  sources: ResolverSource[];
  missing?: string;
  taTicket?: string;
  clarifyingQuestion?: string;
  scopeMessage?: string;
  trace: ResolverTrace;
};

export type ModelResolverOutput = {
  understood_as: string;
  decision: "resolved" | "clarify" | "escalate" | "out_of_scope";
  confidence: number;
  answer: string | null;
  source_message_ids: string[];
  missing_information: string | null;
  clarification_question: string | null;
  reason: string;
};
