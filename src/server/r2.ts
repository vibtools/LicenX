import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl?: string; // Optional custom domain or worker URL
}

export function getR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId.trim()}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId.trim(),
      secretAccessKey: config.secretAccessKey.trim(),
    },
  });
}

export async function testR2Connection(config: R2Config): Promise<{ success: boolean; message: string }> {
  try {
    if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
      return { success: false, message: 'Missing required R2 credentials' };
    }

    const client = getR2Client(config);
    const command = new ListObjectsV2Command({
      Bucket: config.bucketName.trim(),
      MaxKeys: 1,
    });

    await client.send(command);
    return { success: true, message: 'R2 connection verified successfully' };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Failed to connect to Cloudflare R2' };
  }
}

export async function uploadToR2(
  config: R2Config,
  key: string,
  content: string | Buffer,
  contentType = 'text/csv'
): Promise<{ success: boolean; url?: string; signedUrl?: string; error?: string }> {
  try {
    const client = getR2Client(config);
    const bodyBuffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;

    const command = new PutObjectCommand({
      Bucket: config.bucketName.trim(),
      Key: key,
      Body: bodyBuffer,
      ContentType: contentType,
    });

    await client.send(command);

    let signedUrl = '';
    try {
      const getCommand = new GetObjectCommand({
        Bucket: config.bucketName.trim(),
        Key: key,
      });
      signedUrl = await getSignedUrl(client, getCommand, { expiresIn: 604800 }); // 7 days
    } catch {
      // Ignored if presigner fails
    }

    const publicUrl = config.publicUrl ? `${config.publicUrl.replace(/\/$/, '')}/${key}` : signedUrl;

    return {
      success: true,
      url: publicUrl,
      signedUrl,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to upload object to R2',
    };
  }
}
