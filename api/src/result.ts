export type Ok<T> = { ok: true } & T;
export type Err = { ok: false; error: string; code: string };
export type Result<T> = Ok<T> | Err;

export const err = (code: string, error: string): Err => ({ ok: false, error, code });
