import {
  normalizePivotApiResponse,
  pickValue,
  sanitizePivotCellString,
  type AhaPivotCell,
} from "../pivotNormalizer";

describe("sanitizePivotCellString", () => {
  it("strips Aha status-pill HTML and decodes entities", () => {
    const html = `<span class="status-pill" style="background-color: #b1c59b;">Talent AI &amp; Agents</span>`;
    expect(sanitizePivotCellString(html)).toBe("Talent AI & Agents");
  });

  it("puts stacked block goals on separate lines instead of gluing text", () => {
    const html = `<div>Delight Customers with Enhanced Features and User Experience</div><div>1. Reduce Churn - 2025/2026</div>`;
    expect(sanitizePivotCellString(html)).toBe(
      "Delight Customers with Enhanced Features and User Experience\n1. Reduce Churn - 2025/2026",
    );
  });

  it("treats br as newline", () => {
    expect(sanitizePivotCellString("Line one<br/>Line two")).toBe("Line one\nLine two");
  });
});

describe("pickValue", () => {
  it("parses Epic progress bar from html_value", () => {
    const cell: AhaPivotCell = {
      html_value: '<div class="x">45%</div>',
    };
    expect(pickValue(cell, "Epic progress bar")).toBe(45);
  });

  it("parses Epic progress bar from text_value", () => {
    const cell: AhaPivotCell = { text_value: "100%" };
    expect(pickValue(cell, "Epic progress bar")).toBe(100);
  });

  it("returns null for Epic progress bar when no percent", () => {
    const cell: AhaPivotCell = { html_value: "<span>—</span>" };
    expect(pickValue(cell, "Epic progress bar")).toBeNull();
  });

  it("strips HTML from rich_value string (e.g. GTM Module status pill)", () => {
    const cell: AhaPivotCell = {
      rich_value: `<span class="status-pill">Talent AI &amp; Agents</span>`,
    };
    expect(pickValue(cell, "GTM Module")).toBe("Talent AI & Agents");
  });

  it("extracts Epic key from first column html link", () => {
    const page = {
      columns: [{ title: "Epic" }, { title: "Epic name" }],
      rows: [
        [
          {
            html_value:
              '<a href="/workspace/foo/epics/CC-PRODUCT-123/epic-name">Epic</a>',
          },
          { text_value: "Hello" },
        ],
      ],
      pagination: [{ current_page: 1, total_pages: 1 }],
    };
    const rows = normalizePivotApiResponse(page);
    expect(rows[0]["Epic key"]).toBe("CC-PRODUCT-123");
    expect(rows[0]["Epic name"]).toBe("Hello");
  });
});
