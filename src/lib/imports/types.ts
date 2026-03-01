export type ImportSourceFormat =
  | "csv"
  | "board_json"
  | "workspace_zip"
  | "ics"
  | "plain_text"
  | "dispatch_roundtrip";

export type ImportDuplicateMode = "skip" | "create_copy" | "merge";
export type ImportEntityType = "task" | "project" | "note" | "dispatch";
export type ImportSessionStatus = "previewed" | "committed" | "failed";

export interface ImportFieldMapping {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  project?: string;
  completed?: string;
  notes?: string;
  sourceId?: string;
  dispatchDate?: string;
}

export interface ImportOptions {
  duplicateMode: ImportDuplicateMode;
  includeCompleted: boolean;
  includeArchived: boolean;
  includeComments: boolean;
  includeAttachments: boolean;
}

export interface ImportRequestPayload {
  format: ImportSourceFormat;
  fileName: string;
  mimeType?: string | null;
  contentBase64: string;
  options?: Partial<ImportOptions>;
  fieldMapping?: ImportFieldMapping;
  previewSessionId?: string | null;
  testForceFailureAt?: "after_projects" | null;
}

export interface CanonicalImportTask {
  sourceKey: string;
  externalId: string | null;
  title: string;
  description: string;
  status: "open" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  dueDate: string | null;
  projectName: string | null;
  metadata: Record<string, unknown>;
  archived: boolean;
}

export interface CanonicalImportProject {
  sourceKey: string;
  externalId: string | null;
  name: string;
  description: string;
  status: "active" | "paused" | "completed";
  metadata: Record<string, unknown>;
  archived: boolean;
}

export interface CanonicalImportNote {
  sourceKey: string;
  externalId: string | null;
  title: string;
  content: string;
  relatedProjectName: string | null;
  metadata: Record<string, unknown>;
}

export interface CanonicalImportDispatch {
  sourceKey: string;
  externalId: string | null;
  date: string;
  summary: string;
  metadata: Record<string, unknown>;
}

export interface CanonicalImportBatch {
  tasks: CanonicalImportTask[];
  projects: CanonicalImportProject[];
  notes: CanonicalImportNote[];
  dispatches: CanonicalImportDispatch[];
  warnings: string[];
  inferredMappings: string[];
  skipped: Array<{ sourceKey: string; reason: string }>;
  mappingSuggestions?: {
    availableColumns: string[];
    fieldMapping: ImportFieldMapping;
    requiredFields: string[];
  } | null;
  sourceMetadata: {
    formatVersion: string;
    fingerprint: string;
    fileName: string;
    detectedVariant?: string | null;
  };
}

export interface ImportAdapterContext {
  fileName: string;
  mimeType: string | null;
  buffer: Buffer;
  text: string;
  userTimeZone: string | null;
  options: ImportOptions;
  fieldMapping: ImportFieldMapping | null;
}

export interface ImportAdapterDefinition {
  format: ImportSourceFormat;
  label: string;
  description: string;
  expectedStructure: string;
  sampleHint: string;
  compatibility: {
    exact: string[];
    approximate: string[];
    unsupported: string[];
  };
  parse: (context: ImportAdapterContext) => Promise<CanonicalImportBatch>;
}

export interface ImportPreviewResponse {
  sessionId: string;
  format: ImportSourceFormat;
  fileName: string;
  counts: {
    tasks: number;
    projects: number;
    notes: number;
    dispatches: number;
    skipped: number;
  };
  warnings: string[];
  inferredMappings: string[];
  mappingSuggestions: CanonicalImportBatch["mappingSuggestions"];
  sample: {
    tasks: Array<Pick<CanonicalImportTask, "title" | "status" | "priority" | "dueDate" | "projectName">>;
    projects: Array<Pick<CanonicalImportProject, "name" | "status">>;
    notes: Array<Pick<CanonicalImportNote, "title">>;
    dispatches: Array<Pick<CanonicalImportDispatch, "date">>;
  };
  guide: {
    label: string;
    description: string;
    expectedStructure: string;
    sampleHint: string;
    compatibility: ImportAdapterDefinition["compatibility"];
  };
}

export interface ImportCommitResponse {
  sessionId: string;
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
  links: {
    tasks: string;
    notes: string;
    projects: string;
    dispatches: string;
  };
  details: Array<{
    entityType: ImportEntityType;
    title: string;
    action: "created" | "updated" | "skipped";
  }>;
}
