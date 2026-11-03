import type { Attempt, SaveAttempt } from "../shared/schemas.js";
export type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";
export interface RecoveryDraft {
  id: string;
  environmentId: string;
  baseRevision: number;
  text: string;
  updatedAt: string;
  scaffolding?: Record<string, string>;
  title?: string;
}
export interface DraftTarget {
  id: string;
  currentText: string;
  revision: number;
  scaffolding?: Record<string, string>;
  title?: string;
}
export interface DraftQueueOptions<T extends DraftTarget = Attempt> {
  attempt: T;
  environmentId: string;
  send: (input: SaveAttempt & { title?: string }) => Promise<T>;
  putRecovery: (draft: RecoveryDraft) => Promise<void>;
  clearRecovery: (
    text: string,
    scaffolding?: Record<string, string>,
    title?: string,
  ) => Promise<void>;
  onStatus: (status: SaveStatus, message?: string) => void;
  onAck: (attempt: T) => void;
  onBufferError: () => void;
}
// One in-flight write. An uncertain response retains the exact mutation for retry.
export class DraftQueue<T extends DraftTarget = Attempt> {
  private text: string;
  private savedText: string;
  private revision: number;
  private scaffolding: Record<string, string>;
  private savedScaffolding: string;
  private title?: string;
  private savedTitle?: string;
  private pending: (SaveAttempt & { title?: string }) | null = null;
  private recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  private recoveryDirty = false;
  private recoveryMaxTimer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private recoveryChain: Promise<void> = Promise.resolve();
  private conflict = false;
  constructor(private options: DraftQueueOptions<T>) {
    this.text = this.savedText = options.attempt.currentText;
    this.revision = options.attempt.revision;
    this.title = this.savedTitle = options.attempt.title;
    this.scaffolding = options.attempt.scaffolding ?? {};
    this.savedScaffolding = JSON.stringify(this.scaffolding);
  }
  get currentRevision() {
    return this.revision;
  }
  get dirty() {
    return (
      this.title !== this.savedTitle ||
      this.text !== this.savedText ||
      this.pending !== null ||
      JSON.stringify(this.scaffolding) !== this.savedScaffolding
    );
  }
  setText(text: string): void {
    this.text = text;
    this.recoveryDirty = true;
    clearTimeout(this.recoveryTimer);
    this.recoveryTimer = setTimeout(() => this.persistRecovery(), 120);
    this.recoveryMaxTimer ??= setTimeout(() => this.persistRecovery(), 500);
    clearTimeout(this.timer);
    this.options.onStatus(
      this.conflict ? "conflict" : this.dirty ? "dirty" : "saved",
    );
    if (!this.conflict && this.dirty)
      this.timer = setTimeout(() => {
        void this.flush().catch(() => {});
      }, 600);
  }
  setTitle(title: string): void {
    this.title = title;
    this.setText(this.text);
  }
  setScaffolding(fields: Record<string, string>): void {
    this.scaffolding = fields;
    this.setText(this.text);
  }
  private cancelRecoveryTimers(): void {
    clearTimeout(this.recoveryTimer);
    clearTimeout(this.recoveryMaxTimer);
    this.recoveryTimer = undefined;
    this.recoveryMaxTimer = undefined;
  }
  private persistRecovery(): void {
    this.cancelRecoveryTimers();
    this.recoveryDirty = false;
    const draft: RecoveryDraft = {
      id: this.options.attempt.id,
      environmentId: this.options.environmentId,
      baseRevision: this.revision,
      text: this.text,
      updatedAt: new Date().toISOString(),
      scaffolding: this.scaffolding,
      ...(this.title === undefined ? {} : { title: this.title }),
    };
    this.recoveryChain = this.recoveryChain
      .then(() => this.options.putRecovery(draft))
      .catch(() => {
        this.options.onBufferError();
      });
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.recoveryDirty) this.persistRecovery();
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
        scaffolding: this.scaffolding,
        ...(this.title === undefined ? {} : { title: this.title }),
      };
      this.options.onStatus("saving");
      try {
        const saved = await this.options.send(this.pending);
        this.savedText = saved.currentText;
        this.savedTitle = saved.title;
        this.savedScaffolding = JSON.stringify(saved.scaffolding ?? {});
        this.revision = saved.revision;
        this.pending = null;
        this.options.onAck(saved);
        if (
          this.title === this.savedTitle &&
          this.text === this.savedText &&
          JSON.stringify(this.scaffolding) === this.savedScaffolding
        ) {
          this.cancelRecoveryTimers();
          this.recoveryDirty = false;
          const confirmedText = this.savedText;
          this.recoveryChain = this.recoveryChain
            .then(() =>
              this.options.clearRecovery(
                confirmedText,
                saved.scaffolding,
                saved.title,
              ),
            )
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
        if (
          !this.conflict &&
          typeof error === "object" &&
          error !== null &&
          "uncertain" in error &&
          error.uncertain === false
        )
          this.pending = null;
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
  acceptRevision(attempt: T): void {
    if (this.dirty || this.running)
      throw new Error("Zapisz szkic przed kolejną operacją.");
    this.revision = attempt.revision;
    this.title = this.savedTitle = attempt.title;
    this.savedText = attempt.currentText;
    this.text = attempt.currentText;
    this.scaffolding = attempt.scaffolding ?? {};
    this.savedScaffolding = JSON.stringify(attempt.scaffolding ?? {});
    this.options.onAck(attempt);
  }
  async settleRecovery(): Promise<void> {
    if (this.recoveryDirty) this.persistRecovery();
    await this.recoveryChain;
  }
  dispose(): void {
    clearTimeout(this.timer);
    if (this.recoveryDirty) this.persistRecovery();
  }
}
