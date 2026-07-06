import { supabaseAdmin } from "./supabase-admin";

// Bucket the CRM uploads outbound message attachments into. Must exist in
// Supabase Storage and be public-read so provider APIs (SendGrid, Twilio) can
// fetch by URL. Create via Supabase dashboard → Storage → New bucket.
const BUCKET = "attachments";

const MAX_BYTES = 15 * 1024 * 1024;

export async function uploadAttachmentsFromForm(
  form: FormData,
  fieldName = "attachments",
): Promise<string[]> {
  const raw = form.getAll(fieldName);
  const files = raw.filter(
    (v): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v && (v as File).size > 0,
  );
  if (files.length === 0) return [];

  const sb = supabaseAdmin();
  const urls: string[] = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      throw new Error(`Attachment "${file.name}" exceeds 15 MB.`);
    }
    const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error } = await sb.storage.from(BUCKET).upload(key, buf, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (error) throw new Error(`Attachment upload failed: ${error.message}`);
    const { data } = sb.storage.from(BUCKET).getPublicUrl(key);
    urls.push(data.publicUrl);
  }
  return urls;
}

// Fetch a remote URL and return it as a base64 string + content-type. Used by
// providers that require inline attachments (SendGrid) rather than URLs.
export async function fetchAsBase64(
  url: string,
): Promise<{ base64: string; contentType: string; filename: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch attachment: ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const buf = Buffer.from(await res.arrayBuffer());
  const filename = url.split("/").pop()?.split("?")[0] ?? "attachment";
  return { base64: buf.toString("base64"), contentType, filename };
}
