import { handleCloudflareApi } from '../../src/server/cloudflareHandler';

interface Env {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  DATABASE_URL?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  return handleCloudflareApi(context.request, context.env);
};
