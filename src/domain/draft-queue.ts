import type { Attempt, SaveAttempt } from "../shared/schemas.js";
export type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";
export interface RecoveryDraft {
  id: string;
  environmentId: string;
  baseRevision: number;
  text: string;
  updatedAt: string;
}
export interface DraftQueueOptions {
  attempt: Attempt;
  environmentId: string;
  send: (input: SaveAttempt) => Promise<Attempt>;
  putRecovery: (draft: RecoveryDraft) => Promise<void>;
  clearRecovery: (text: string) => Promise<void>;
  onStatus: (status: SaveStatus, message?: string) => void;
  onAck: (attempt: Attempt) => void;
  onBufferError: () => void;
}
// One in-flight write. An uncertain response retains the exact mutation for retry.
export class DraftQueue {
  private text: string;
  private savedText: string;
  private revision: number;
  private pending: SaveAttempt | null = null;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private recoveryChain: Promise<void> = Promise.resolve();
  private conflict = false;
  constructor(private options: DraftQueueOptions) {
    this.text = this.savedText = options.attempt.currentText;
    this.revision = options.attempt.revision;
  }
  get currentRevision() {
    return this.revision;
  }
  get dirty() {
    return this.text !== this.savedText || this.pending !== null;
  }
  setText(text: string): void {
    this.text = text;
    this.persistRecovery();
    clearTimeout(this.timer);
    this.options.onStatus(
      this.conflict ? "conflict" : this.dirty ? "dirty" : "saved",
    );
    if (!this.conflict && this.dirty)
      this.timer = setTimeout(() => {
        void this.flush().catch(() => {});
      }, 600);
  }
  private persistRecovery(): void {
    const draft: RecoveryDraft = {
      id: this.options.attempt.id,
      environmentId: this.options.environmentId,
      baseRevision: this.revision,
      text: this.text,
      updatedAt: new Date().toISOString(),
    };
    this.recoveryChain = this.recoveryChain
      .then(() => this.options.putRecovery(draft))
      .catch(() => {
        this.options.onBufferError();
      });
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) {
      await this.running;
      if (this.dirty) return this.flush();
      return;
    }
    if (this.conflict)
      throw new Error("Najpierw zachowaj swoją wersję obok wersji serwera.");
    if (!this.dirty) return;
    this.running = this.drain();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }
  private async drain(): Promise<void> {
    while (this.dirty) {
      this.pending ??= {
        text: this.text,
        expectedRevision: this.revision,
        clientMutationId: crypto.randomUUID(),
      };
      this.options.onStatus("saving");
      try {
        const saved = await this.options.send(this.pending);
        this.savedText = saved.currentText;
        this.revision = saved.revision;
        this.pending = null;
        this.options.onAck(saved);
        if (this.text === this.savedText) {
          const confirmedText = this.savedText;
          this.recoveryChain = this.recoveryChain
            .then(() => this.options.clearRecovery(confirmedText))
            .catch(() => {
              this.options.onBufferError();
            });
        } else this.persistRecovery();
      } catch (error) {
        this.conflict =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error.code === "revision_conflict" ||
            error.code === "attempt_closed");
        this.persistRecovery();
        this.options.onStatus(
          this.conflict ? "conflict" : "error",
          error instanceof Error ? error.message : "Nie udało się zapisać.",
        );
        throw error;
      }
    }
    this.options.onStatus("saved");
  }
  acceptRevision(attempt: Attempt): void {
    if (this.dirty || this.running)
      throw new Error("Zapisz szkic przed kolejną operacją.");
    this.revision = attempt.revision;
    this.savedText = attempt.currentText;
    this.text = attempt.currentText;
    this.options.onAck(attempt);
  }
  async settleRecovery(): Promise<void> {
    await this.recoveryChain;
  }
  dispose(): void {
    clearTimeout(this.timer);
  }
}
