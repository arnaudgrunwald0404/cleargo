import { normalizePivotApiResponse, pickValue, type AhaPivotCell } from "../pivotNormalizer";

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
