import { describe, expect, it } from "vitest";
import { detectReferenceInput, resolveReference, searchTitleCandidates } from "./resolver";

const signal = new AbortController().signal;

describe("reference input detection", () => {
  it("detects DOI, arXiv, BibTeX and title inputs", () => {
    expect(detectReferenceInput("https://doi.org/10.1038/nature14539")).toBe("doi");
    expect(detectReferenceInput("doi:10.1038/nature14539")).toBe("doi");
    expect(detectReferenceInput("arXiv:1706.03762v7")).toBe("arxiv");
    expect(detectReferenceInput("https://arxiv.org/abs/1706.03762")).toBe("arxiv");
    expect(detectReferenceInput("@article{x, title={X}}")).toBe("bibtex");
    expect(detectReferenceInput("Attention Is All You Need")).toBe("title");
  });
});

describe("reference resolution", () => {
  it("maps a DOI to one normalized record and sends the polite-pool email", async () => {
    let requested = "";
    const fetch = async (input: string | URL | Request) => {
      requested = String(input);
      return new Response([
        "@article{vaswani2017attention,",
        "  title={Attention Is All You Need},",
        "  author={Vaswani, Ashish and Shazeer, Noam},",
        "  year={2017},",
        "  doi={10.48550/arXiv.1706.03762},",
        "  url={https://arxiv.org/abs/1706.03762}",
        "}",
        "",
      ].join("\n"), { status: 200 });
    };

    const result = await resolveReference("10.48550/arXiv.1706.03762", { fetch, contactEmail: "author@example.com", signal });

    expect(requested).toContain("api.crossref.org/works/10.48550%2Farxiv.1706.03762/transform/application/x-bibtex");
    expect(requested).toContain("mailto=author%40example.com");
    expect(result).toMatchObject({
      kind: "doi",
      key: "vaswani2017attention",
      title: "Attention Is All You Need",
      year: "2017",
      doi: "10.48550/arxiv.1706.03762",
      arxivId: "1706.03762",
      url: "https://arxiv.org/abs/1706.03762",
    });
  });

  it("maps an arXiv Atom result to a misc entry", async () => {
    const atom = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <id>http://arxiv.org/abs/1706.03762v7</id>
          <updated>2023-08-02T00:00:00Z</updated>
          <published>2017-06-12T00:00:00Z</published>
          <title>Attention Is All You Need</title>
          <summary>Transformer paper.</summary>
          <author><name>Ashish Vaswani</name></author>
          <author><name>Noam Shazeer</name></author>
        </entry>
      </feed>`;
    const result = await resolveReference("1706.03762v7", {
      fetch: async () => new Response(atom, { status: 200 }),
      signal,
    });

    expect(result).toMatchObject({
      kind: "arxiv",
      key: "vaswani2017attention",
      title: "Attention Is All You Need",
      authors: "Ashish Vaswani and Noam Shazeer",
      year: "2017",
      arxivId: "1706.03762",
      url: "https://arxiv.org/abs/1706.03762",
    });
    expect(result.bibtex).toContain("archivePrefix = {arXiv}");
  });

  it("returns title candidates from Crossref", async () => {
    const payload = {
      message: {
        items: [
          {
            DOI: "10.1/right",
            title: ["Attention Is All You Need"],
            author: [{ given: "Ashish", family: "Vaswani" }],
            published: { "date-parts": [[2017]] },
            "container-title": ["NeurIPS"],
          },
        ],
      },
    };
    const candidates = await searchTitleCandidates("Attention Is All You Need", {
      fetch: async () => new Response(JSON.stringify(payload), { status: 200 }),
      signal,
    });

    expect(candidates).toEqual([{
      doi: "10.1/right",
      title: "Attention Is All You Need",
      authors: "Ashish Vaswani",
      year: "2017",
      venue: "NeurIPS",
    }]);
  });

  it("reports rate limits without writing a record", async () => {
    await expect(resolveReference("10.1/x", {
      fetch: async () => new Response("slow down", { status: 429 }),
      signal,
    })).rejects.toThrow(/rate limit/i);
  });

  it("keeps direct BibTeX input without a network request", async () => {
    let called = false;
    const result = await resolveReference("@misc{x, title={Manual Entry}, author={Ada Lovelace}, year={2024}}", {
      fetch: async () => { called = true; return new Response(""); },
      signal,
    });

    expect(called).toBe(false);
    expect(result).toMatchObject({ kind: "bibtex", key: "x", title: "Manual Entry", year: "2024" });
  });

  it("reports malformed title-search JSON", async () => {
    await expect(searchTitleCandidates("A Paper", {
      fetch: async () => new Response("not json", { status: 200 }),
      signal,
    })).rejects.toThrow(/malformed JSON/i);
  });

  it("reports an empty arXiv result", async () => {
    await expect(resolveReference("1706.03762", {
      fetch: async () => new Response("<feed></feed>", { status: 200 }),
      signal,
    })).rejects.toThrow(/did not find/i);
  });

  it("escapes LaTeX-sensitive characters in generated arXiv BibTeX", async () => {
    const atom = `<feed><entry><id>http://arxiv.org/abs/2401.00001</id><published>2024-01-01T00:00:00Z</published><title>Pixels &amp; Words: 100% Coverage</title><author><name>Ada Lovelace</name></author></entry></feed>`;
    const result = await resolveReference("2401.00001", {
      fetch: async () => new Response(atom, { status: 200 }),
      signal,
    });

    expect(result.bibtex).toContain("Pixels \\& Words: 100\\% Coverage");
  });
});
