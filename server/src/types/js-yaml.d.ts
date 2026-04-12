// Type declarations for js-yaml
declare module 'js-yaml' {
  export function load(s: string, options?: any): unknown;
  export function dump(obj: any, options?: any): string;
}
