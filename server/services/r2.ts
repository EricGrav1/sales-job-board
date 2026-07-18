import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv } from "../config/env";

export const SIGNED_URL_EXPIRES_IN_SECONDS = 15 * 60;

export function createR2Client() {
  const env = getEnv();
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY
    }
  });
}

let cachedClient: S3Client | undefined;

function getR2Client() {
  if (!cachedClient) {
    cachedClient = createR2Client();
  }

  return cachedClient;
}

export async function createPresignedUploadUrl(key: string, contentType: string, sizeBytes: number) {
  const env = getEnv();
  return getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes
    }),
    { expiresIn: SIGNED_URL_EXPIRES_IN_SECONDS }
  );
}

export async function createSignedGetUrl(key: string) {
  const env = getEnv();
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key
    }),
    { expiresIn: SIGNED_URL_EXPIRES_IN_SECONDS }
  );
}

export async function getObjectBuffer(key: string) {
  const env = getEnv();
  const response = await getR2Client().send(
    new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key
    })
  );

  if (!response.Body) {
    throw new Error(`Object ${key} has no body`);
  }

  return Buffer.from(await response.Body.transformToByteArray());
}

export async function putObjectBuffer(key: string, body: Buffer, contentType: string) {
  const env = getEnv();
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType
    })
  );
}

export async function deleteObjects(keys: Array<string | null | undefined>) {
  const env = getEnv();

  for (const key of keys) {
    if (!key) {
      continue;
    }

    try {
      await getR2Client().send(
        new DeleteObjectCommand({
          Bucket: env.R2_BUCKET,
          Key: key
        })
      );
    } catch (error) {
      console.error(`Failed to delete R2 object ${key}`, error);
    }
  }
}
