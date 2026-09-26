export type InputErrorCode = "unreadable" | "no_sheet" | "no_rows" | "too_many_rows";

export class InputError extends Error {
  readonly code: InputErrorCode;

  constructor(code: InputErrorCode) {
    super(code);
    this.name = "InputError";
    this.code = code;
  }
}
