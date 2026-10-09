import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl?: string; // Optional custom domain or worker URL
}

/**
 * Ensures a compliant DOM Level 2 DOMParser and Node object are available globally.
 * Cloudflare Workers / Pages functions run in a V8 isolate (workerd) without browser DOM APIs.
 * In worker/browser package targets, @aws-sdk/xml-builder invokes `new DOMParser()` and references
 * `Node.TEXT_NODE` and `Node.ELEMENT_NODE` to deserialize XML responses from S3/R2.
 * Without this polyfill, any XML response from S3 triggers:
 * "ReferenceError: DOMParser is not defined (Deserialization error)".
 */
export function ensureDOMParser(): void {
  const g = globalThis as any;

  if (typeof g.Node === 'undefined') {
    g.Node = {
      ELEMENT_NODE: 1,
      ATTRIBUTE_NODE: 2,
      TEXT_NODE: 3,
      CDATA_SECTION_NODE: 4,
      ENTITY_REFERENCE_NODE: 5,
      ENTITY_NODE: 6,
      PROCESSING_INSTRUCTION_NODE: 7,
      COMMENT_NODE: 8,
      DOCUMENT_NODE: 9,
      DOCUMENT_TYPE_NODE: 10,
      DOCUMENT_FRAGMENT_NODE: 11,
      NOTATION_NODE: 12,
    };
  }

  if (typeof g.DOMParser === 'undefined') {
    g.DOMParser = class PolyfillDOMParser {
      parseFromString(xmlString: string, _type = 'application/xml') {
        return parseXmlToDom(xmlString);
      }
    };
  }
}

/**
 * High-performance, zero-dependency XML DOM tree builder tailored for S3 XML schemas.
 */
function parseXmlToDom(rawXml: string) {
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;

  function parseString(xml: string) {
    xml = (xml || '')
      .trim()
      .replace(/<\?xml[^>]*\?>/i, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();

    if (!xml) {
      return {
        nodeType: ELEMENT_NODE,
        nodeName: 'root',
        attributes: [],
        childNodes: [],
        textContent: '',
      };
    }

    function parseTokens(str: string): any {
      str = str.trim();
      const openMatch = str.match(
        /^<([a-zA-Z0-9_:-]+)((?:\s+[a-zA-Z0-9_:-]+(?:\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/
      );

      if (!openMatch) {
        return {
          nodeType: TEXT_NODE,
          nodeName: '#text',
          textContent: str,
          attributes: [],
          childNodes: [],
        };
      }

      const tagName = openMatch[1];
      const attrRaw = openMatch[2] || '';
      const isSelfClosing = openMatch[3] === '/' || str.endsWith('/>');

      const attrs: Array<{ name: string; value: string }> = [];
      const attrRe = /([a-zA-Z0-9_:-]+)\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+))/g;
      let am: RegExpExecArray | null;
      while ((am = attrRe.exec(attrRaw)) !== null) {
        attrs.push({ name: am[1], value: am[2] ?? am[3] ?? am[4] ?? '' });
      }

      if (isSelfClosing) {
        return {
          nodeType: ELEMENT_NODE,
          nodeName: tagName,
          attributes: attrs,
          childNodes: [],
          textContent: '',
        };
      }

      const closeTag = '</' + tagName + '>';
      const lastClose = str.lastIndexOf(closeTag);
      const inner = lastClose !== -1 ? str.slice(openMatch[0].length, lastClose) : str.slice(openMatch[0].length);

      const childNodes: any[] = [];
      let cursor = 0;
      let textBuf = '';

      while (cursor < inner.length) {
        if (inner[cursor] === '<') {
          if (textBuf.trim()) {
            childNodes.push({
              nodeType: TEXT_NODE,
              nodeName: '#text',
              textContent: textBuf,
              attributes: [],
              childNodes: [],
            });
            textBuf = '';
          }
          const subMatch = inner
            .slice(cursor)
            .match(
              /^<([a-zA-Z0-9_:-]+)((?:\s+[a-zA-Z0-9_:-]+(?:\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/
            );
          if (subMatch) {
            if (subMatch[3] === '/' || subMatch[0].endsWith('/>')) {
              childNodes.push(parseTokens(subMatch[0]));
              cursor += subMatch[0].length;
              continue;
            }
            const subTag = subMatch[1];
            const subClose = '</' + subTag + '>';
            let depth = 1;
            let scan = cursor + subMatch[0].length;
            let foundEnd = -1;
            while (scan < inner.length) {
              const nextOpen = inner.indexOf('<' + subTag, scan);
              const nextClose = inner.indexOf(subClose, scan);
              if (nextClose === -1) break;
              if (nextOpen !== -1 && nextOpen < nextClose) {
                depth++;
                scan = nextOpen + subTag.length + 1;
              } else {
                depth--;
                if (depth === 0) {
                  foundEnd = nextClose + subClose.length;
                  break;
                }
                scan = nextClose + subClose.length;
              }
            }
            if (foundEnd !== -1) {
              const childStr = inner.slice(cursor, foundEnd);
              childNodes.push(parseTokens(childStr));
              cursor = foundEnd;
              continue;
            }
          }
        }
        textBuf += inner[cursor];
        cursor++;
      }

      if (textBuf.trim()) {
        childNodes.push({
          nodeType: TEXT_NODE,
          nodeName: '#text',
          textContent: textBuf,
          attributes: [],
          childNodes: [],
        });
      }

      const textContent = childNodes.map((c) => c.textContent).join('');

      return {
        nodeType: ELEMENT_NODE,
        nodeName: tagName,
        attributes: attrs,
        childNodes: childNodes,
        textContent,
      };
    }

    return parseTokens(xml);
  }

  const root = parseString(rawXml);
  return {
    documentElement: root,
    getElementsByTagName: () => [],
  };
}

// Automatically ensure DOMParser is ready upon module import
ensureDOMParser();

/**
 * Extracts clear, human-readable S3 / R2 error messages from AWS SDK error envelopes.
 */
export function extractS3ErrorMessage(error: any): string {
  if (!error) return 'Unknown Cloudflare R2 error';

  if (
    error.Code === 'SignatureDoesNotMatch' ||
    error.name === 'SignatureDoesNotMatch' ||
    error.message?.includes('SignatureDoesNotMatch')
  ) {
    return 'SignatureDoesNotMatch: The Secret Access Key does not match Cloudflare R2. Please re-enter your actual Secret Access Key in the Storage & DB tab.';
  }

  if (error.Code && error.Message) {
    return `${error.Code}: ${error.Message}`;
  }

  if (error.name && error.message && error.name !== 'Error') {
    return `${error.name}: ${error.message}`;
  }

  if (error.$response) {
    const status = error.$response.statusCode;
    if (status === 403) return 'Cloudflare R2 Access Denied (Check Access Key & Secret Permissions)';
    if (status === 404) return 'Cloudflare R2 Bucket Not Found (Check Bucket Name)';
    if (status === 401) return 'Cloudflare R2 Unauthorized (Invalid Account ID or Credentials)';
  }

  return error.message || 'Failed to interact with Cloudflare R2';
}

export function validateR2Config(config: R2Config): { valid: boolean; error?: string } {
  if (!config.accountId?.trim() || !config.accessKeyId?.trim() || !config.bucketName?.trim()) {
    return { valid: false, error: 'Missing required R2 credentials (Account ID, Access Key ID, or Bucket Name)' };
  }
  const secret = (config.secretAccessKey || '').trim();
  if (!secret || secret === '••••••••••••••••' || secret.includes('•')) {
    return {
      valid: false,
      error:
        'Cloudflare R2 Secret Access Key is invalid or set to masked placeholder (••••). Please re-enter your actual Secret Access Key in the Storage & DB tab.',
    };
  }
  return { valid: true };
}

export function getR2Client(config: R2Config): S3Client {
  ensureDOMParser();
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
    const validation = validateR2Config(config);
    if (!validation.valid) {
      return { success: false, message: validation.error || 'Invalid R2 credentials' };
    }

    ensureDOMParser();
    const client = getR2Client(config);
    const command = new ListObjectsV2Command({
      Bucket: config.bucketName.trim(),
      MaxKeys: 1,
    });

    await client.send(command);
    return { success: true, message: 'R2 connection verified successfully' };
  } catch (error: any) {
    return { success: false, message: extractS3ErrorMessage(error) };
  }
}

export async function uploadToR2(
  config: R2Config,
  key: string,
  content: string | Uint8Array,
  contentType = 'text/csv'
): Promise<{ success: boolean; url?: string; signedUrl?: string; key?: string; error?: string }> {
  try {
    const validation = validateR2Config(config);
    if (!validation.valid) {
      return { success: false, error: validation.error || 'Invalid R2 credentials' };
    }

    ensureDOMParser();
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
      signedUrl = await getSignedUrl(client, getCommand, { expiresIn: 604800 }); // 7 days fallback
    } catch {
      // Ignored if presigner fails
    }

    // Permanent URL: If a custom domain / publicUrl is configured, use it.
    // Otherwise, generate a permanent backend proxy URL (/api/public/assets/${key})
    // to prevent images from breaking after 7 days when presigned URLs expire!
    const publicUrl = config.publicUrl
      ? `${config.publicUrl.replace(/\/$/, '')}/${key}`
      : `/api/public/assets/${key}`;

    return {
      success: true,
      url: publicUrl,
      signedUrl,
      key,
    };
  } catch (error: any) {
    return {
      success: false,
      error: extractS3ErrorMessage(error),
    };
  }
}

export async function getR2Object(
  config: R2Config,
  key: string
): Promise<{ success: boolean; data?: Uint8Array; contentType?: string; error?: string }> {
  try {
    const validation = validateR2Config(config);
    if (!validation.valid) {
      return { success: false, error: validation.error || 'Invalid R2 credentials' };
    }

    ensureDOMParser();
    const client = getR2Client(config);
    const command = new GetObjectCommand({
      Bucket: config.bucketName.trim(),
      Key: key,
    });

    const response = await client.send(command);
    if (!response.Body) {
      return { success: false, error: 'Empty object returned from R2' };
    }

    const data = await response.Body.transformToByteArray();
    return {
      success: true,
      data,
      contentType: response.ContentType || 'application/octet-stream',
    };
  } catch (error: any) {
    return {
      success: false,
      error: extractS3ErrorMessage(error),
    };
  }
}
