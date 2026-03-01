// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const previewMock = vi.fn();
const commitMock = vi.fn();
const toast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  undo: vi.fn(),
};

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: unknown; [key: string]: unknown }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/client", () => ({
  api: {
    imports: {
      preview: previewMock,
      commit: commitMock,
    },
  },
}));

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ toast }),
}));

vi.mock("@/components/CustomSelect", () => ({
  CustomSelect: ({
    label,
    value,
    onChange,
    options,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
  }) => (
    <label>
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));

const { ImportsPage } = await import("@/components/ImportsPage");

function createFile(name: string, content: string, type: string) {
  const file = new File([content], name, { type });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new TextEncoder().encode(content).buffer,
  });
  return file;
}

describe("ImportsPage", () => {
  beforeEach(() => {
    previewMock.mockReset();
    commitMock.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    toast.info.mockReset();
    toast.undo.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the guide state and shows preview warnings after analyzing a file", async () => {
    previewMock.mockResolvedValue({
      sessionId: "preview-1",
      format: "csv",
      fileName: "tasks.csv",
      counts: {
        tasks: 1,
        projects: 1,
        notes: 0,
        dispatches: 0,
        skipped: 2,
      },
      warnings: ["Archived rows were skipped."],
      inferredMappings: ["Mapped title to \"Title\"."],
      mappingSuggestions: null,
      sample: {
        tasks: [{ title: "Plan migration", status: "open", priority: "medium", dueDate: null, projectName: "Platform" }],
        projects: [{ name: "Platform", status: "active" }],
        notes: [],
        dispatches: [],
      },
      guide: {
        label: "Structured CSV / Spreadsheet",
        description: "CSV imports",
        expectedStructure: "Columns",
        sampleHint: "Use a spreadsheet export",
        compatibility: {
          exact: ["Task title"],
          approximate: ["Comments become metadata"],
          unsupported: ["Attachments"],
        },
      },
    });

    render(<ImportsPage />);
    expect(screen.getByText("Choose a source format")).toBeTruthy();

    const user = userEvent.setup();
    const input = screen.getByLabelText(/choose an export file/i);
    await user.upload(input, createFile("tasks.csv", "Title\nPlan migration", "text/csv"));
    await user.click(screen.getByRole("button", { name: "Analyze File" }));

    await screen.findByText("Dry-Run Preview");
    expect(screen.getByText("Archived rows were skipped.")).toBeTruthy();
    expect(screen.getByText("Mapped title to \"Title\".")).toBeTruthy();
    expect(previewMock).toHaveBeenCalledWith(expect.objectContaining({
      format: "csv",
      fileName: "tasks.csv",
      options: expect.objectContaining({
        duplicateMode: "skip",
        includeCompleted: true,
        includeArchived: false,
        includeComments: true,
        includeAttachments: false,
      }),
    }));
  });

  it("walks through mapping, preview, and commit success flow", async () => {
    previewMock
      .mockResolvedValueOnce({
        sessionId: "preview-2",
        format: "csv",
        fileName: "tasks.csv",
        counts: {
          tasks: 2,
          projects: 1,
          notes: 0,
          dispatches: 0,
          skipped: 0,
        },
        warnings: [],
        inferredMappings: ["Mapped title to \"Task\"."],
        mappingSuggestions: {
          availableColumns: ["Task", "Details"],
          fieldMapping: { title: "Task", description: "Details" },
          requiredFields: ["title"],
        },
        sample: {
          tasks: [{ title: "Plan migration", status: "open", priority: "medium", dueDate: null, projectName: "Platform" }],
          projects: [{ name: "Platform", status: "active" }],
          notes: [],
          dispatches: [],
        },
        guide: {
          label: "Structured CSV / Spreadsheet",
          description: "CSV imports",
          expectedStructure: "Columns",
          sampleHint: "Use a spreadsheet export",
          compatibility: {
            exact: ["Task title"],
            approximate: [],
            unsupported: [],
          },
        },
      })
      .mockResolvedValueOnce({
        sessionId: "preview-2",
        format: "csv",
        fileName: "tasks.csv",
        counts: {
          tasks: 2,
          projects: 1,
          notes: 0,
          dispatches: 0,
          skipped: 0,
        },
        warnings: [],
        inferredMappings: ["Mapped title to \"Task\"."],
        mappingSuggestions: null,
        sample: {
          tasks: [{ title: "Plan migration", status: "open", priority: "medium", dueDate: null, projectName: "Platform" }],
          projects: [{ name: "Platform", status: "active" }],
          notes: [],
          dispatches: [],
        },
        guide: {
          label: "Structured CSV / Spreadsheet",
          description: "CSV imports",
          expectedStructure: "Columns",
          sampleHint: "Use a spreadsheet export",
          compatibility: {
            exact: ["Task title"],
            approximate: [],
            unsupported: [],
          },
        },
      });
    commitMock.mockResolvedValue({
      sessionId: "preview-2",
      created: 3,
      updated: 0,
      skipped: 0,
      warnings: ["Assets were imported as manifest references."],
      links: {
        tasks: "/tasks",
        notes: "/notes",
        projects: "/projects",
        dispatches: "/dispatch",
      },
      details: [
        { entityType: "project", title: "Platform", action: "created" },
        { entityType: "task", title: "Plan migration", action: "created" },
      ],
    });

    render(<ImportsPage />);

    const user = userEvent.setup();
    const input = screen.getByLabelText(/choose an export file/i);
    await user.upload(input, createFile("tasks.csv", "Task,Details\nPlan migration,Review exports", "text/csv"));
    await user.click(screen.getByRole("button", { name: "Analyze File" }));

    await screen.findByText("Field Mapping");
    await user.click(screen.getByRole("button", { name: "Preview Import" }));

    await screen.findByText("Dry-Run Preview");
    await user.click(screen.getByRole("button", { name: "Commit Import" }));

    await screen.findByText("Import Complete");
    expect(screen.getByText("Assets were imported as manifest references.")).toBeTruthy();
    expect(commitMock).toHaveBeenCalledWith(expect.objectContaining({
      previewSessionId: "preview-2",
      fieldMapping: expect.objectContaining({ title: "Task", description: "Details" }),
    }));
    expect(toast.success).toHaveBeenCalledWith("Imported 3 item(s)");
  });

  it("shows a recoverable failure banner when analysis fails", async () => {
    previewMock.mockRejectedValue(new Error("Import exceeds 5000 rows. Split the spreadsheet into smaller files."));

    render(<ImportsPage />);

    const user = userEvent.setup();
    const input = screen.getByLabelText(/choose an export file/i);
    await user.upload(input, createFile("large.csv", "Title\nOverflow", "text/csv"));
    await user.click(screen.getByRole("button", { name: "Analyze File" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Import exceeds 5000 rows. Split the spreadsheet into smaller files.");
    });
    expect(screen.getByText("Import issue")).toBeTruthy();
    expect(screen.getByText("Write-stage failures roll back cleanly, so Dispatch does not keep partial imports.")).toBeTruthy();
  });
});
