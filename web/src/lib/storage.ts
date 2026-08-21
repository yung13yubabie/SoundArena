import "server-only";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function region(): string {
  // https://s3.us-east-005.backblazeb2.com → us-east-005
  const host = new URL(process.env.B2_ENDPOINT!).hostname;
  return host.split(".")[1];
}

function client(): S3Client {
  return new S3Client({
    endpoint: process.env.B2_ENDPOINT!,
    region: region(),
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.B2_KEY_ID!,
      secretAccessKey: process.env.B2_APPLICATION_KEY!,
    },
  });
}

export async function uploadAudioObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await client().send(
    new PutObjectCommand({ Bucket: process.env.B2_BUCKET!, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function getPlaybackUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: process.env.B2_BUCKET!, Key: key });
  return getSignedUrl(client(), command, { expiresIn: expiresInSeconds });
}

// 讓瀏覽器直接 PUT 到 B2,不繞道我們自己的伺服器——音檔可能有幾十 MB,不適合
// 塞進 Server Action 的 body size 限制。B2 的密鑰只在這裡簽章時用到,從頭到尾
// 不會傳到瀏覽器。
export async function createUploadUrl(key: string, contentType: string, expiresInSeconds = 600): Promise<string> {
  const command = new PutObjectCommand({ Bucket: process.env.B2_BUCKET!, Key: key, ContentType: contentType });
  return getSignedUrl(client(), command, { expiresIn: expiresInSeconds });
}

export async function deleteAudioObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: process.env.B2_BUCKET!, Key: key }));
}
