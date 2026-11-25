import type {
  Actor,
  AuditWriter,
  NotificationWriter,
  Preferences,
  PageQuery,
  ListPage,
} from "../../../platform/application-types";

export type Profile = {
  id: string;
  loginName: string;
  displayName: string;
  preferences: Preferences;
  version: string;
};
export type UserRecord = Profile & {
  passwordHash: string;
  status: "active" | "disabled";
  isPlatformAdmin: boolean;
};
export type SessionSummary = {
  id: string;
  deviceLabel: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};
export interface IdentityStore {
  findByLogin(login: string): Promise<UserRecord | null>;
  findUserSummary(login: string): Promise<{ id: string; status: string } | null>;
  locateSessionUser(token: string): Promise<string | null>;
  lockUsers(ids: readonly string[]): Promise<Map<string, { status: string }>>;
  requireActor(token: string, lock?: boolean): Promise<Actor>;
  user(id: string): Promise<UserRecord>;
  profile(id: string): Promise<Profile>;
  createSession(input: {
    id: string;
    userId: string;
    tokenHash: Uint8Array;
    expiresAt: Date;
    deviceLabel: string;
  }): Promise<void>;
  revokeSession(userId: string, id: string): Promise<boolean>;
  sessions(userId: string, query: PageQuery): Promise<ListPage<SessionSummary>>;
  updateProfile(
    userId: string,
    patch: { displayName?: string; preferences?: Preferences },
    expectedVersion: string,
  ): Promise<Profile>;
}
export type IdentityContext = {
  identity: IdentityStore;
  audit: AuditWriter;
  notifications: NotificationWriter;
};
