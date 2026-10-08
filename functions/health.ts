import { handleCloudflareApi } from '../src/server/cloudflareHandler';

export const onRequest: PagesFunction = async (context) => {
  return handleCloudflareApi(context.request, context.env);
};
