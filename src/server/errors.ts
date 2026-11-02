export class AppError extends Error {
  constructor(public statusCode: number, public code: string, message: string, public retryable = false, public currentRevision?: number) { super(message); }
}
