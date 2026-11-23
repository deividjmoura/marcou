export const SOCIAL_QUERY_BUDGETS = {
  discovery: {
    defaultLimit: 24,
    maxLimit: 48,
    cursor: ["ranking", "published_at", "id"],
  },
  feed: {
    defaultLimit: 20,
    maxLimit: 40,
    cursor: ["rank_bucket", "published_at", "id"],
  },
  comments: {
    defaultLimit: 30,
    maxLimit: 60,
    cursor: ["created_at", "id"],
  },
  connections: {
    defaultLimit: 30,
    maxLimit: 60,
    cursor: ["created_at", "id"],
  },
  messages: {
    defaultLimit: 40,
    maxLimit: 100,
    cursor: ["created_at", "id"],
  },
  moderation: {
    defaultLimit: 50,
    maxLimit: 100,
    cursor: ["priority", "created_at", "id"],
  },
} as const;

export type SocialQuerySurface = keyof typeof SOCIAL_QUERY_BUDGETS;

/**
 * Normaliza limites antes de qualquer consulta social. Offset e limites livres
 * não fazem parte do contrato; cada consulta deve usar o cursor documentado.
 */
export function socialPageLimit(
  surface: SocialQuerySurface,
  requested: number | null | undefined,
): number {
  const budget = SOCIAL_QUERY_BUDGETS[surface];
  if (!Number.isSafeInteger(requested) || Number(requested) <= 0) {
    return budget.defaultLimit;
  }
  return Math.min(Number(requested), budget.maxLimit);
}
