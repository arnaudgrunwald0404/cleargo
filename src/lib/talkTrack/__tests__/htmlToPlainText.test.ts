import { htmlToPlainText } from "../htmlToPlainText";

describe("htmlToPlainText", () => {
  it("returns empty string for empty/nullish input", () => {
    expect(htmlToPlainText("")).toBe("");
    // @ts-expect-error exercising defensive runtime guard
    expect(htmlToPlainText(null)).toBe("");
    // @ts-expect-error exercising defensive runtime guard
    expect(htmlToPlainText(undefined)).toBe("");
  });

  it("passes clean plain text through untouched (fast path)", () => {
    expect(htmlToPlainText("Just a simple sentence.")).toBe("Just a simple sentence.");
  });

  it("strips list/paragraph markup and keeps readable bullet lines (CLEARGO-I-21)", () => {
    // The exact shape ClearMAP returns for the 'Before State' script section.
    const html =
      "<ul><li><p><strong>HR Leaders</strong> — Less than 20% of customers are currently " +
      "using embedded career sites, missing out on enhanced candidate engagement.</p></li>" +
      "<li><p><strong>Recruitment Teams</strong> — Manual filtering slows down hiring.</p></li></ul>";
    const out = htmlToPlainText(html);
    expect(out).not.toMatch(/<[^>]+>/); // no tags remain
    expect(out).toBe(
      "• HR Leaders — Less than 20% of customers are currently using embedded career sites, " +
        "missing out on enhanced candidate engagement.\n" +
        "• Recruitment Teams — Manual filtering slows down hiring."
    );
  });

  it("converts <br> to newlines and decodes common entities", () => {
    expect(htmlToPlainText("Line one<br>Line two")).toBe("Line one\nLine two");
    expect(htmlToPlainText("Tom &amp; Jerry &mdash; friends &#39;n foes")).toBe(
      "Tom & Jerry — friends 'n foes"
    );
    expect(htmlToPlainText("a&nbsp;&nbsp;b")).toBe("a b");
  });

  it("collapses stray whitespace and drops empty lines", () => {
    expect(htmlToPlainText("<p>  spaced   out  </p><p></p><p>next</p>")).toBe("spaced out\nnext");
  });
});
