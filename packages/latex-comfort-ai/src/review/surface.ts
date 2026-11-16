import type { ReviewViewState } from "./state";

export type ReviewSurfaceKind = "sidePanel" | "nativeInline" | "editorInset";

export interface ReviewSurface {
  render(state: ReviewViewState): void;
  dispose(): void;
}

export type ReviewSurfaceFactory = () => ReviewSurface;
export type ReviewSurfaceFactories = Partial<
  Record<ReviewSurfaceKind, ReviewSurfaceFactory>
>;

/** Owns the single active review presentation and preserves state when switching. */
export class ReviewSurfaceHost implements ReviewSurface {
  private activeKind: ReviewSurfaceKind | undefined;
  private active: ReviewSurface | undefined;
  private state: ReviewViewState = { status: "idle" };

  constructor(
    private readonly factories: ReviewSurfaceFactories,
    private readonly chooseKind: (state: ReviewViewState) => ReviewSurfaceKind,
  ) {}

  render(state: ReviewViewState): void {
    this.state = state;
    if (state.status === "idle") {
      this.disposeActive();
      return;
    }

    const kind = this.activeKind ?? this.resolveKind(this.chooseKind(state));
    this.activate(kind);
    this.active?.render(state);
  }

  showSidebar(): void {
    if (this.state.status === "idle") return;
    this.activate(this.resolveKind("sidePanel"));
    this.active?.render(this.state);
  }

  dispose(): void {
    this.disposeActive();
    this.state = { status: "idle" };
  }

  private activate(kind: ReviewSurfaceKind): void {
    if (this.active && this.activeKind === kind) return;
    this.disposeActive();
    const factory = this.factories[kind];
    if (!factory) return;
    this.activeKind = kind;
    this.active = factory();
  }

  private resolveKind(kind: ReviewSurfaceKind): ReviewSurfaceKind {
    if (this.factories[kind]) return kind;
    if (this.factories.nativeInline) return "nativeInline";
    if (this.factories.sidePanel) return "sidePanel";
    throw new Error("No review surface is configured.");
  }

  private disposeActive(): void {
    this.active?.dispose();
    this.active = undefined;
    this.activeKind = undefined;
  }
}
