/**
 * Cloudflare Pages Functions Global Types Definition
 */
declare global {
  interface EventContext<Env = any, P extends string = any, Data = any> {
    request: Request;
    functionPath: string;
    waitUntil: (promise: Promise<any>) => void;
    next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
    env: Env;
    params: Record<P, string | string[]>;
    data: Data;
  }

  type PagesFunction<
    Env = any,
    Params extends string = any,
    Data extends Record<string, unknown> = Record<string, unknown>
  > = (context: EventContext<Env, Params, Data>) => Response | Promise<Response>;
}

export {};
