export type ErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation_failed"
  | "rate_limited"
  | "unavailable";

export class ApplicationError extends Error {
  code: ErrorCode;
  currentVersion?: string;
  constructor(code: ErrorCode, message: string, currentVersion?: string) {
    super(message);
    this.name = "ApplicationError";
    this.code = code;
    this.currentVersion = currentVersion;
  }
}

export function reject(code: ErrorCode, message?: string): never {
  const messages: Record<ErrorCode, string> = {
    unauthenticated: "登录已过期，请重新登录。",
    forbidden: "当前账号无权访问此页面。",
    not_found: "未找到可访问的记录。",
    conflict: "内容已变化，请重新读取并核对后提交。",
    validation_failed: "请检查输入内容。",
    rate_limited: "尝试过于频繁，请稍后重试。",
    unavailable: "服务暂时不可用，请稍后重试。",
  };
  throw new ApplicationError(code, message ?? messages[code]);
}

export function assertVersion(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new ApplicationError("conflict", "内容已被其他人更新，请重新核对。", actual);
  }
}
