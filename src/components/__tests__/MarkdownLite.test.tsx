import { render as rtlRender, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MarkdownLite } from "../MarkdownLite";

// Mantine components read theme context via useMantineTheme — every render needs a provider.
function render(ui: React.ReactElement) {
  return rtlRender(<MantineProvider>{ui}</MantineProvider>);
}

describe("MarkdownLite", () => {
  it("normalizes literal backslash-n sequences into real line breaks (bullets)", () => {
    const content =
      "* Matches Greenhouse pricing ($3000/yr).\\n* Directly protects $125k in retained revenue.\\n* Base-case pool of 250 eligible clients.";
    render(<MarkdownLite content={content} />);
    expect(screen.getByText(/Matches Greenhouse pricing/)).toBeInTheDocument();
    expect(screen.getByText(/Directly protects \$125k/)).toBeInTheDocument();
    expect(screen.getByText(/Base-case pool of 250/)).toBeInTheDocument();
    // Should render as list items, not one run-on blob containing literal "\n" text.
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText(/\\n/)).not.toBeInTheDocument();
  });

  it("renders a numbered list from a tactical roadmap section", () => {
    const content =
      "1. Execute At-Risk Churn Rescue: target the pool. (Owner: VP CS, Timing: GA - 15 Days)\\n2. Launch Upsell Motion: attack the eligible pool. (Owner: Director AM, Timing: GA + 15 Days)";
    render(<MarkdownLite content={content} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Execute At-Risk Churn Rescue");
    expect(items[1]).toHaveTextContent("Launch Upsell Motion");
  });

  it("renders a GFM pipe table with header and rows", () => {
    const content =
      "| Risk | Likelihood | ARR Impact | Mitigation |\\n|---|---|---|---|\\n| Failure to retain at-risk cohort | Medium | -$125,000 | Engage at-risk accounts pre-GA |\\n| Penetration stalls at 15% | High | -$112,500 | Bundle with enterprise upgrades |";
    render(<MarkdownLite content={content} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Risk")).toBeInTheDocument();
    expect(screen.getByText("Likelihood")).toBeInTheDocument();
    expect(screen.getByText("Failure to retain at-risk cohort")).toBeInTheDocument();
    expect(screen.getByText("Penetration stalls at 15%")).toBeInTheDocument();
    expect(screen.getByText("-$125,000")).toBeInTheDocument();
  });

  it("renders **bold** inline text without leaking asterisks", () => {
    const content = "This is **very important** context for the reader.";
    render(<MarkdownLite content={content} />);
    expect(screen.getByText("very important").tagName).toBe("B");
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it("handles a plain paragraph with real newlines the same as literal ones", () => {
    const content = "First sentence.\nSecond sentence on its own line.";
    render(<MarkdownLite content={content} />);
    expect(screen.getByText(/First sentence\. Second sentence on its own line\./)).toBeInTheDocument();
  });
});
