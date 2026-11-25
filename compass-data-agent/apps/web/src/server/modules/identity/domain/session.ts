export function sessionIsLive(
  userStatus: string,
  expiresAt: Date,
  revokedAt: Date | null,
  now: Date,
): boolean {
  return userStatus === "active" && revokedAt === null && expiresAt.getTime() > now.getTime();
}

export function normalizeLoginName(value: string): string {
  return value.trim().toLowerCase();
}
