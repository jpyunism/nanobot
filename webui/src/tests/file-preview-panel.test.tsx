import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FilePreviewPanel } from "@/components/FilePreviewPanel";
import { downloadWorkspaceFile, fetchFilePreview } from "@/lib/api";

vi.mock("@/components/CodeBlock", () => ({
  CodeBlock: ({
    code,
    language,
    highlight,
  }: {
    code: string;
    language?: string;
    highlight?: boolean;
  }) => (
    <pre
      data-testid="mock-code-block"
      data-language={language}
      data-highlight={String(highlight)}
    >
      {code}
    </pre>
  ),
}));

vi.mock("@/components/MarkdownText", () => ({
  MarkdownText: ({ children }: { children: string }) => (
    <div data-testid="mock-markdown-text">{children}</div>
  ),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    fetchFilePreview: vi.fn(),
    downloadWorkspaceFile: vi.fn(),
  };
});

describe("FilePreviewPanel", () => {
  beforeEach(() => {
    vi.mocked(fetchFilePreview).mockReset();
    vi.mocked(downloadWorkspaceFile).mockReset();
  });

  it("shows a compact breadcrumb with one file name and a visible close action", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    vi.mocked(fetchFilePreview).mockResolvedValue({
      path: "/Users/hr/workspace/quicksort.py",
      display_path: "quicksort.py",
      language: "python",
      content: "print('ok')",
      truncated: false,
    });

    render(
      <FilePreviewPanel
        sessionKey="websocket:chat-1"
        path="quicksort.py"
        token="tok"
        onClose={onClose}
      />,
    );

    const codeBlock = await screen.findByTestId("mock-code-block");
    expect(codeBlock).toHaveTextContent("print('ok')");
    expect(codeBlock).toHaveAttribute("data-language", "python");
    expect(codeBlock).toHaveAttribute("data-highlight", "true");
    expect(screen.getByTestId("file-preview-breadcrumb")).toHaveTextContent("...");
    expect(screen.getByTestId("file-preview-breadcrumb")).toHaveTextContent("workspace");
    expect(screen.getByTestId("file-preview-title")).toHaveTextContent("quicksort.py");
    expect(screen.getAllByText("quicksort.py")).toHaveLength(1);

    const closeButton = screen.getByRole("button", { name: "Close file preview" });
    expect(closeButton).toBeVisible();

    await user.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders markdown files as markdown instead of code", async () => {
    vi.mocked(fetchFilePreview).mockResolvedValue({
      path: "/Users/hr/workspace/README.md",
      display_path: "README.md",
      language: "markdown",
      content: "# Title\n\nsome **bold** text",
      truncated: false,
    });

    render(
      <FilePreviewPanel
        sessionKey="websocket:chat-1"
        path="README.md"
        token="tok"
        onClose={vi.fn()}
      />,
    );

    const markdown = await screen.findByTestId("mock-markdown-text");
    expect(markdown).toHaveTextContent("# Title");
    expect(markdown).toHaveTextContent("some **bold** text");
    expect(screen.queryByTestId("mock-code-block")).toBeNull();
  });

  it("downloads the file when the download button is clicked", async () => {
    const user = userEvent.setup();
    const createObjectUrl = vi.fn(() => "blob:mock");
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });
    vi.mocked(fetchFilePreview).mockResolvedValue({
      path: "/Users/hr/workspace/README.md",
      display_path: "README.md",
      language: "markdown",
      content: "# Title",
      truncated: false,
    });
    vi.mocked(downloadWorkspaceFile).mockResolvedValue(new Blob(["# Title"]));

    render(
      <FilePreviewPanel
        sessionKey="websocket:chat-1"
        path="README.md"
        token="tok"
        onClose={vi.fn()}
      />,
    );

    const downloadButton = await screen.findByTestId("file-preview-download");
    await user.click(downloadButton);

    expect(downloadWorkspaceFile).toHaveBeenCalledWith(
      "tok",
      "websocket:chat-1",
      "/Users/hr/workspace/README.md",
    );
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
  });
});
