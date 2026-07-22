import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[SUPABASE INIT] Missing environment variables! ' +
    'Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.'
  );
}

console.log('[SUPABASE INIT] Initializing client with URL:', supabaseUrl || 'UNDEFINED');

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Uploads a Base64 data URL to Supabase Storage bucket 'profiles'.
 * Returns the public URL on success, or throws a descriptive error on failure.
 * Has a 20-second timeout to prevent infinite hangs.
 */
export async function uploadProfilePhoto(memberId: string, base64DataUrl: string): Promise<string> {
  console.log('[UPLOAD] Upload started: converting Base64 to Blob...');

  // Convert base64 data URL to a Blob
  const res = await fetch(base64DataUrl);
  const blob = await res.blob();
  const ext = blob.type === 'image/png' ? 'png' : 'jpg';
  const filePath = `profile_${memberId}_${Date.now()}.${ext}`;

  console.log(`[UPLOAD] Upload progress: uploading ${filePath} (${(blob.size / 1024).toFixed(1)} KB) to Supabase Storage...`);

  const uploadPromise = supabase.storage
    .from('profiles')
    .upload(filePath, blob, { upsert: true, contentType: blob.type });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => {
      console.error('[UPLOAD] Upload failed: 20-second timeout reached. Supabase Storage is not responding.');
      reject(new Error('Upload timed out after 20 seconds. Check your Supabase bucket policy and internet connection.'));
    }, 20000)
  );

  const { error } = await Promise.race([uploadPromise, timeoutPromise]) as Awaited<ReturnType<typeof uploadPromise>>;

  if (error) {
    console.error('[UPLOAD] Upload failed with Supabase error:', error.message);
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage.from('profiles').getPublicUrl(filePath);
  const publicUrl = urlData.publicUrl;

  console.log('[UPLOAD] Upload complete! Public URL:', publicUrl);
  return publicUrl;
}

/**
 * Uploads any Blob to Supabase Storage bucket 'gallery'.
 * Returns the public URL on success, or throws a descriptive error.
 * Calls onProgress(0-100) as upload progresses.
 */
export async function uploadGalleryFile(
  file: Blob,
  fileName: string,
  onProgress: (pct: number) => void
): Promise<string> {
  console.log(`[UPLOAD] Gallery upload started: ${fileName} (${(file.size / 1024).toFixed(1)} KB)`);
  onProgress(0);

  const filePath = `gallery/${Date.now()}_${fileName}`;

  // Supabase JS v2 doesn't support real progress, so we fake 50% while uploading
  onProgress(30);

  const { error } = await supabase.storage
    .from('profiles')  // reusing the same bucket; rename to 'gallery' if you create a separate one
    .upload(filePath, file, { upsert: true, contentType: file.type });

  if (error) {
    console.error('[UPLOAD] Gallery upload failed:', error.message);
    throw new Error(`Supabase gallery upload failed: ${error.message}`);
  }

  onProgress(100);

  const { data: urlData } = supabase.storage.from('profiles').getPublicUrl(filePath);
  const publicUrl = urlData.publicUrl;

  console.log('[UPLOAD] Gallery upload complete! Public URL:', publicUrl);
  return publicUrl;
}
