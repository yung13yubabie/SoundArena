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
//
// contentLength 綁進簽章(SA-003 資安複查真實 PoC 確認的修法):S3 相容簽章一旦
// 把 ContentLength 包進 PutObjectCommand,實際 PUT 的 body 大小跟簽章時宣告的值
// 只要有一絲落差,B2 就會回 403 SignatureDoesNotMatch——原本只在核發 URL「之前」
// 檢查 client 宣稱的檔案大小,實際上傳可以是任意大小;現在檔案大小變成簽章的一部分,
// 偽造大小會直接讓整個簽章失效,不是應用層的軟性檢查。
export async function createUploadUrl(key: string, contentType: string, contentLength: number, expiresInSeconds = 600): Promise<string> {
  const command = new PutObjectCommand({ Bucket: process.env.B2_BUCKET!, Key: key, ContentType: contentType, ContentLength: contentLength });
  return getSignedUrl(client(), command, { expiresIn: expiresInSeconds });
}

export async function deleteAudioObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: process.env.B2_BUCKET!, Key: key }));
}

// SA-003 剩餘項目:只驗證宣稱的 Content-Type(已經綁進簽章,不能偽造 header)不夠——
// 實際 byte 內容可能根本不是那個格式。只抓開頭幾十個 bytes(Range GET,不用整個
// 下載)給呼叫端做 magic bytes 比對,見 audioUpload.ts 的 matchesAudioMagicBytes()。
export async function getObjectHeadBytes(key: string, byteCount = 64): Promise<Buffer> {
  const command = new GetObjectCommand({ Bucket: process.env.B2_BUCKET!, Key: key, Range: `bytes=0-${byteCount - 1}` });
  const response = await client().send(command);
  const chunks: Buffer[] = [];
  // Node runtime 下 Body 是 Node.js Readable stream。
  for await (const chunk of response.Body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
