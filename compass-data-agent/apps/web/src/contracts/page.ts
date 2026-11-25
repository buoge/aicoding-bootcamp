import type { PageSpec, PageScope } from "../lib/page-catalog";
import type { Permission } from "./authorization";
import type {
  AuditDto,
  BindingDto,
  ListPage,
  MemberDto,
  NotificationDto,
  ProfileDto,
  SessionDto,
  TenantDto,
  WorkspaceDto,
} from "./web";

export type NavigationEntry = PageSpec & { href: string };
export type SessionView = {
  user: ProfileDto;
  sessionId: string;
  isPlatformAdmin: boolean;
  expiresAt: string;
  viewRevision: string;
  authzVersion: string | null;
  capabilities: Permission[];
  tenantCapabilities: Permission[];
  navigation: NavigationEntry[];
  scope: PageScope;
  tenant: { id: string; slug: string; name: string } | null;
  workspace: { id: string; slug: string; name: string; status: string } | null;
};
export type AuditPage = { items: AuditDto[]; total: number; nextCursor: string | null };
export type Overview = {
  workspaceCount: number | null;
  memberCount: number | null;
  recent: AuditDto[];
};
export type PageData = {
  profile?: ProfileDto;
  tenants?: ListPage<TenantDto>;
  workspaces?: ListPage<WorkspaceDto>;
  members?: ListPage<MemberDto>;
  bindings?: ListPage<BindingDto>;
  settings?: TenantDto;
  sessions?: ListPage<SessionDto>;
  audit?: AuditPage;
  canExportAudit?: boolean;
  notifications?: ListPage<NotificationDto>;
  overview?: Overview;
  catalog?: {
    id: Permission;
    label: string;
    scopes: ("tenant" | "workspace")[];
    personalGrantable: boolean;
  }[];
  templates?: Record<string, readonly Permission[]>;
};
export type PagePayload = {
  page: PageSpec;
  session: SessionView;
  pageData: PageData;
  query: { page: number; limit: number; q: string; sort: "name" | "createdAt" };
  viewKey: string;
};
