/**
 * Media API layer (script 06). Flow per file:
 *   1. requestUploadSignature() — backend signs the upload (secret stays server-side)
 *   2. uploadToCloudinary()     — file goes DIRECTLY to Cloudinary (never our API)
 *   3. saveMedia()              — persist the confirmed asset in our DB
 *
 * `deleteMedia()` removes it from both the DB and Cloudinary.
 */
import { apiClient } from "./client";

/** Allowed upload types + size cap — mirrors the backend server-side checks. */
export const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMAGES = 10; // FR-203

export type UploadSignature = {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId?: string;
};

export type CloudinaryUploadResult = {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
};

export type SavedMedia = {
  id: string;
  cloudinaryPublicId: string;
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  format?: string | null;
  bytes?: number | null;
  folder?: string | null;
  position?: number;
  createdAt?: string;
};

export type SaveMediaPayload = {
  cloudinaryPublicId: string;
  url: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  alt?: string;
  folder?: string;
  productId?: string;
};

/** Validate a File client-side before uploading; returns an error string or null. */
export function validateFile(file: File): string | null {
  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return "Unsupported format (use JPEG, PNG, WebP, or AVIF).";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "File is larger than 10 MB.";
  }
  return null;
}

export function requestUploadSignature(folder?: string): Promise<UploadSignature> {
  return apiClient.post<UploadSignature>(
    "/media/upload-signature",
    folder ? { folder } : {},
  );
}

export function saveMedia(payload: SaveMediaPayload): Promise<SavedMedia> {
  return apiClient.post<SavedMedia>("/media", payload);
}

export function deleteMedia(
  publicId: string,
): Promise<{ publicId: string; deleted: boolean; cloudinaryDestroyed: boolean }> {
  // public_ids contain slashes (folder paths) — encode so it stays one segment.
  return apiClient.delete(`/media/${encodeURIComponent(publicId)}`);
}

export function listMedia(search?: string): Promise<SavedMedia[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : "";
  return apiClient.get<SavedMedia[]>(`/media${qs}`);
}

/**
 * POST a file straight to Cloudinary with the backend signature, reporting
 * upload progress (0-100). Uses XHR because fetch has no upload-progress event.
 */
export function uploadToCloudinary(
  file: File,
  sig: UploadSignature,
  onProgress?: (percent: number) => void,
): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", sig.apiKey);
    form.append("timestamp", String(sig.timestamp));
    form.append("folder", sig.folder);
    form.append("signature", sig.signature);
    if (sig.publicId) form.append("public_id", sig.publicId);

    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
    );

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as CloudinaryUploadResult);
        } catch {
          reject(new Error("Malformed Cloudinary response"));
        }
      } else {
        let message = "Cloudinary upload failed";
        try {
          const body = JSON.parse(xhr.responseText) as {
            error?: { message?: string };
          };
          if (body.error?.message) message = body.error.message;
        } catch {
          /* keep default */
        }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}
