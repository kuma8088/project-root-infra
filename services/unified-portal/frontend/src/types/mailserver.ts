/**
 * Mailserver Type Definitions
 *
 * TypeScript interfaces for Mailserver API integration
 */

/**
 * Mail User
 */
export interface MailUser {
  id: number;
  email: string;
  domain_id: number;
  domain_name: string;
  quota: number;
  enabled: boolean;
  is_admin: boolean;
  created_at: string;
}

/**
 * Mail User Creation Request
 */
export interface MailUserCreate {
  email: string;
  password: string;
  domain_id: number;
  quota?: number;
  enabled?: boolean;
}

/**
 * Mail User Update Request
 */
export interface MailUserUpdate {
  password?: string;
  quota?: number;
  enabled?: boolean;
}

/**
 * Mail Domain
 */
export interface MailDomain {
  id: number;
  name: string;
  description: string | null;
  default_quota: number;
  enabled: boolean;
  user_count: number;
  total_quota_used: number;
  created_at: string;
}

/**
 * Mail Domain Creation Request
 */
export interface MailDomainCreate {
  name: string;
  description?: string | null;
  default_quota?: number;
  enabled?: boolean;
}

/**
 * Mail Domain Update Request
 */
export interface MailDomainUpdate {
  description?: string | null;
  default_quota?: number;
  enabled?: boolean;
}

/**
 * Audit Log
 */
export interface AuditLog {
  id: number;
  action_type: string;
  target_type: string;
  target_id: number | null;
  user_id: number | null;
  changes: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/**
 * Audit Log Query Parameters
 */
export interface AuditLogQuery {
  action_type?: string;
  target_type?: string;
  user_id?: number;
  skip?: number;
  limit?: number;
}

/**
 * API Response: Mail User List
 */
export interface MailUserListResponse {
  users: MailUser[];
  total: number;
  skip: number;
  limit: number;
}

/**
 * API Response: Mail Domain List
 */
export interface MailDomainListResponse {
  domains: MailDomain[];
  total: number;
  skip: number;
  limit: number;
}

/**
 * API Response: Audit Log List
 */
export interface AuditLogListResponse {
  logs: AuditLog[];
  total: number;
  skip: number;
  limit: number;
}

/**
 * API Error Response
 */
export interface ApiError {
  detail: string;
  status_code?: number;
}
