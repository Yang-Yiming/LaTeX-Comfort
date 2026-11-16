import type { ResolvedReference, TitleCandidate } from "./resolver";

export type CandidateQuickPickRow = {
  label: string;
  description: string;
  detail: string;
  candidate: TitleCandidate;
};

export function candidateQuickPick(candidates: readonly TitleCandidate[]): CandidateQuickPickRow[] {
  return candidates.map((candidate) => ({
    label: candidate.title,
    description: [candidate.authors, candidate.year].filter(Boolean).join(" · "),
    detail: [candidate.venue, `https://doi.org/${candidate.doi}`].filter(Boolean).join(" · "),
    candidate,
  }));
}

export function addConfirmationText(reference: Pick<ResolvedReference, "title" | "authors" | "year" | "key">): string {
  return [
    reference.title,
    [reference.authors, reference.year].filter(Boolean).join(" · "),
    `Citation key: ${reference.key}`,
  ].join("\n");
}
