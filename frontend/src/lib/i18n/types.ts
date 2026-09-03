// Recursively replaces literal string/array types with `string`/`string[]`
// so bn.ts and it.ts can be typed against en.ts's key structure without
// being forced to match its literal English values.
export type DeepDict<T> = T extends readonly string[]
  ? readonly string[]
  : T extends string
  ? string
  : { [K in keyof T]: DeepDict<T[K]> };
