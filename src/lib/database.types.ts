// Minimal typed subset of the Supabase schema for use with the JS client.
// Extend as new tables are added.

export type CustomFieldType =
  | "text"
  | "longtext"
  | "number"
  | "date"
  | "dropdown"
  | "checkbox"
  | "phone"
  | "email";

export type StageKind = "open" | "won" | "lost";
export type LeadSource =
  | "manual"
  | "csv"
  | "web_form"
  | "webflow"
  | "razorpay"
  | "fb_ads"
  | "indiamart"
  | "missed_call"
  | "chatbot"
  | "api";
export type CommChannel = "call" | "whatsapp" | "email";
export type CommDirection = "inbound" | "outbound";
export type CallOutcome =
  | "interested"
  | "callback"
  | "not_interested"
  | "wrong_number"
  | "busy"
  | "no_answer"
  | "dnc";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: "admin" | "manager" | "member";
  is_active: boolean;
  permissions: Record<string, boolean>;
  pipeline_ids: string[];
  phone: string | null;
  incentive_percent: number;
  incentive_rules: IncentiveRule[];
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadAmountRow {
  id: string;
  lead_id: string;
  actor_id: string | null;
  amount: number;
  note: string | null;
  cohort_number: string | null;
  created_at: string;
}

export interface CohortRow {
  id: string;
  number: string;
  label: string | null;
  lms_cohort_id: string | null;
  lms_whatsapp_template_id: string | null;
  lms_email_template_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentPageRow {
  id: string;
  internal_label: string;
  title: string;
  description: string | null;
  image_url: string | null;
  amount_paise: number;
  currency: string;
  mode: "test" | "live";
  cohort_id: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  owner_id: string | null;
  tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeadFieldMappingRow {
  id: string;
  source: "webflow" | "razorpay";
  form_key: string;
  external_field: string;
  crm_target: string;
  created_at: string;
  updated_at: string;
}

export interface LeadRoutingRuleRow {
  id: string;
  source: "razorpay" | "webflow";
  match_value: string;
  stage_id: string;
  is_active: boolean;
  label: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntakeSettingsRow {
  id: number;
  fallback_stage_id: string | null;
  razorpay_require_rule: boolean;
  updated_at: string;
}

export interface LmsSettingsRow {
  id: number;
  whatsapp_template_id: string | null;
  email_template_id: string | null;
  updated_at: string;
}

export interface LeadLmsOnboardingRow {
  id: string;
  lead_id: string;
  cohort_id: string;
  status: "pending" | "sent" | "failed";
  lms_user_id: string | null;
  actor_id: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FaqTemplateRow {
  id: string;
  owner_id: string | null;
  title: string;
  body: string;
  category: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  customer_name: string;
  company_name: string;
  company_address: string;
  gst_number: string;
  pan_number: string | null;
  product_name: string;
  total_amount: number;
  invoice_date: string;
  status: "draft" | "issued" | "paid" | "cancelled";
  created_by: string | null;
  finance_tracker_id: string | null;
  pdf_url: string | null;
  sync_status: "pending" | "synced" | "failed";
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  kind: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface LeadStageRow {
  id: string;
  name: string;
  color: string;
  kind: StageKind;
  position: number;
  is_archived: boolean;
  pipeline_id: string;
  created_at: string;
}

export interface PipelineRow {
  id: string;
  name: string;
  position: number;
  is_archived: boolean;
  created_at: string;
}

export interface CustomFieldRow {
  id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  is_required: boolean;
  position: number;
  is_archived: boolean;
  created_at: string;
}

export interface LeadRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: LeadSource | null;
  stage_id: string | null;
  owner_id: string | null;
  next_callback_at: string | null;
  custom: Record<string, unknown>;
  tags: string[];
  is_dnc: boolean;
  total_fee: number | null;
  created_at: string;
  updated_at: string;
}

export interface LeadNoteRow {
  id: string;
  lead_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface LeadActivityRow {
  id: string;
  lead_id: string;
  actor_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface CommunicationRow {
  id: string;
  lead_id: string;
  channel: CommChannel;
  direction: CommDirection;
  status: string;
  actor_id: string | null;
  subject: string | null;
  body: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  outcome: CallOutcome | null;
  provider: string | null;
  provider_message_id: string | null;
  attachments: unknown[];
  error: string | null;
  created_at: string;
}

export interface EmailTemplateRow {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  is_archived: boolean;
  visible_to_members: boolean;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppTemplateRow {
  id: string;
  name: string;
  language: string;
  category: string | null;
  body: string;
  variables: string[];
  is_active: boolean;
  visible_to_members: boolean;
  template_type: "approved" | "faq";
  approval_status: "draft" | "pending" | "approved" | "rejected";
  provider_content_sid: string | null;
  provider_approval_name: string | null;
  last_status_check_at: string | null;
  submission_error: string | null;
  created_at: string;
}

export interface IncentiveRule {
  from: number;
  to: number | null;
  percent: number;
}

export interface WorkflowRuleRow {
  id: string;
  name: string;
  is_active: boolean;
  trigger_kind: "lead_created" | "stage_changed" | "field_changed" | "callback_due";
  trigger_config: Record<string, unknown>;
  conditions: Array<{ field: string; op: string; value?: unknown }>;
  actions: Array<{ kind: string; config: Record<string, unknown> }>;
  created_at: string;
  updated_at: string;
}

export interface LeadViewRow {
  id: string;
  name: string;
  owner_id: string | null;
  config: {
    filters?: Array<{ field: string; op: string; value?: unknown }>;
    sort?: { field: string; dir: "asc" | "desc" };
  };
  created_at: string;
}

// Minimal Database shape for the Supabase JS client's generic parameter.
// We list tables we actually query — extend as needed.
export type Database = {
  public: {
    Tables: {
      users: { Row: UserRow; Insert: Partial<UserRow>; Update: Partial<UserRow> };
      lead_stages: {
        Row: LeadStageRow;
        Insert: Partial<LeadStageRow>;
        Update: Partial<LeadStageRow>;
      };
      pipelines: {
        Row: PipelineRow;
        Insert: Partial<PipelineRow>;
        Update: Partial<PipelineRow>;
      };
      notifications: {
        Row: NotificationRow;
        Insert: Partial<NotificationRow>;
        Update: Partial<NotificationRow>;
      };
      lead_amounts: {
        Row: LeadAmountRow;
        Insert: Partial<LeadAmountRow>;
        Update: Partial<LeadAmountRow>;
      };
      faq_templates: {
        Row: FaqTemplateRow;
        Insert: Partial<FaqTemplateRow>;
        Update: Partial<FaqTemplateRow>;
      };
      custom_fields: {
        Row: CustomFieldRow;
        Insert: Partial<CustomFieldRow>;
        Update: Partial<CustomFieldRow>;
      };
      leads: { Row: LeadRow; Insert: Partial<LeadRow>; Update: Partial<LeadRow> };
      lead_notes: {
        Row: LeadNoteRow;
        Insert: Partial<LeadNoteRow>;
        Update: Partial<LeadNoteRow>;
      };
      lead_activities: {
        Row: LeadActivityRow;
        Insert: Partial<LeadActivityRow>;
        Update: Partial<LeadActivityRow>;
      };
      communications: {
        Row: CommunicationRow;
        Insert: Partial<CommunicationRow>;
        Update: Partial<CommunicationRow>;
      };
      email_templates: {
        Row: EmailTemplateRow;
        Insert: Partial<EmailTemplateRow>;
        Update: Partial<EmailTemplateRow>;
      };
      whatsapp_templates: {
        Row: WhatsAppTemplateRow;
        Insert: Partial<WhatsAppTemplateRow>;
        Update: Partial<WhatsAppTemplateRow>;
      };
      workflow_rules: {
        Row: WorkflowRuleRow;
        Insert: Partial<WorkflowRuleRow>;
        Update: Partial<WorkflowRuleRow>;
      };
      lead_views: {
        Row: LeadViewRow;
        Insert: Partial<LeadViewRow>;
        Update: Partial<LeadViewRow>;
      };
      integration_settings: {
        Row: {
          id: number;
          email_provider: string;
          whatsapp_provider: string;
          telephony_provider: string;
          config: Record<string, unknown>;
          updated_at: string;
        };
        Insert: Partial<{
          id: number;
          email_provider: string;
          whatsapp_provider: string;
          telephony_provider: string;
          config: Record<string, unknown>;
        }>;
        Update: Partial<{
          email_provider: string;
          whatsapp_provider: string;
          telephony_provider: string;
          config: Record<string, unknown>;
        }>;
      };
    };
  };
};
