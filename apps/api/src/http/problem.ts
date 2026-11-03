// Errors the domain raises on purpose; the error handler turns them into RFC 9457 Problem Details.
export class HttpError extends Error {
  readonly status: number;
  readonly title: string;

  constructor(status: number, title: string, detail?: string) {
    super(detail ?? title);
    this.status = status;
    this.title = title;
  }
}

export const unauthorized = () => new HttpError(401, "Não autenticado", "Sessão ausente, expirada ou revogada.");
export const forbidden = (detail = "Seu papel não permite esta ação.") => new HttpError(403, "Sem permissão", detail);
/** Also used when revealing that something exists would leak it. */
export const notFound = () => new HttpError(404, "Não encontrado");
export const conflict = (detail: string) => new HttpError(409, "Conflito de estado", detail);
export const invalid = (detail: string) => new HttpError(422, "Dados inválidos", detail);
