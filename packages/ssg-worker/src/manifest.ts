export const POLICY = "sorane-workers-content-v1";
export type Manifest = { schema: 1; policy: string; engine: string; repository: string;
  commit: string; tree: string; baseUrl: string; draft?: {schema:1; digest:string}; contact?: {schema:1;page:string};
  files: { path: string; digest: string; bytes: number; type: string }[] };
