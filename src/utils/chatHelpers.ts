export function isChatBlockedByUser(chat: unknown, userId: string): boolean {
  if (!chat || !userId || typeof chat !== "object") return false;

  const data = chat as Record<string, unknown>;
  const blockedByUsers = data.blockedByUsers;
  let nestedValue: boolean | undefined;
  if (blockedByUsers && typeof blockedByUsers === "object") {
    const value = (blockedByUsers as Record<string, unknown>)[userId];
    if (typeof value === "boolean") nestedValue = value;
  }

  const flatValue = data[`blockedByUsers.${userId}`];
  // A legacy flat `true` must win over a stale nested `false`; writes remove
  // the flat key, but this keeps old documents behaviorally consistent.
  if (flatValue === true) return true;
  return nestedValue ?? (flatValue === false ? false : false);
}

export function isChatBlockedForEither(chat: unknown, userA: string, userB: string): boolean {
  return isChatBlockedByUser(chat, userA) || isChatBlockedByUser(chat, userB);
}
