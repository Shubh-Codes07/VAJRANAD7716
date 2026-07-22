import { createClient } from '@supabase/supabase-js';
import type { Member } from '../types';

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

/** Maps a Member object to the snake_case Supabase table row format */
function memberToRow(m: Member): Record<string, unknown> {
  return {
    id:                     m.id,
    email:                  m.email,
    name:                   m.name,
    profile_photo:          m.profilePhoto ?? null,
    mobile_number:          m.mobileNumber ?? null,
    address:                m.address ?? null,
    dob:                    m.dob ?? null,
    gender:                 m.gender ?? null,
    blood_group:            m.bloodGroup ?? null,
    mother_name:            m.motherName ?? null,
    mother_mobile:          m.motherMobile ?? null,
    father_name:            m.fatherName ?? null,
    father_mobile:          m.fatherMobile ?? null,
    year_joined:            m.yearJoined ?? null,
    medical_issue:          m.medicalIssue,
    medical_issue_desc:     m.medicalIssueDescription ?? null,
    instrument:             m.instrument ?? null,
    instruments:            m.instruments ?? [],
    instrument_request:     m.instrumentRequest ?? null,
    is_details_filled:      m.isDetailsFilled,
    is_active:              m.isActive,
    scanner_permission:     m.scannerPermission,
    is_committee_member:    m.isCommitteeMember,
    qr_code:                m.qrCode,
    password:               m.password ?? null,
    created_at:             m.createdAt,
    updated_at:             new Date().toISOString(),
  };
}

/** Maps a Supabase table row back to the Member type */
function rowToMember(row: Record<string, any>): Member {
  return {
    id:                       row.id,
    email:                    row.email,
    name:                     row.name,
    profilePhoto:             row.profile_photo ?? undefined,
    mobileNumber:             row.mobile_number ?? undefined,
    address:                  row.address ?? undefined,
    dob:                      row.dob ?? undefined,
    gender:                   row.gender ?? undefined,
    bloodGroup:               row.blood_group ?? undefined,
    motherName:               row.mother_name ?? undefined,
    motherMobile:             row.mother_mobile ?? undefined,
    fatherName:               row.father_name ?? undefined,
    fatherMobile:             row.father_mobile ?? undefined,
    yearJoined:               row.year_joined ?? undefined,
    medicalIssue:             row.medical_issue ?? false,
    medicalIssueDescription:  row.medical_issue_desc ?? undefined,
    instrument:               row.instrument ?? undefined,
    instruments:              row.instruments ?? [],
    instrumentRequest:        row.instrument_request ?? undefined,
    isDetailsFilled:          row.is_details_filled ?? false,
    isActive:                 row.is_active ?? true,
    scannerPermission:        row.scanner_permission ?? false,
    isCommitteeMember:        row.is_committee_member ?? false,
    qrCode:                   row.qr_code ?? row.id,
    password:                 row.password ?? undefined,
    createdAt:                row.created_at ?? new Date().toISOString(),
  };
}

/**
 * Saves (upserts) a single Member to the Supabase `members` table.
 * This is a fire-and-forget style call — it does not throw.
 * Check console logs for success/failure.
 */
export async function saveMemberToSupabase(member: Member): Promise<void> {
  const row = memberToRow(member);
  console.log(`[SUPABASE SAVE] Upserting member "${member.name}" (id: ${member.id})`, {
    email: member.email,
    isDetailsFilled: member.isDetailsFilled,
    instrument: member.instrument,
    profilePhoto: member.profilePhoto ? '[photo present]' : '[no photo]',
  });

  const { error } = await supabase
    .from('members')
    .upsert(row, { onConflict: 'id' });

  if (error) {
    console.error(`[SUPABASE SAVE] ✗ Failed to save member "${member.name}":`, error.message, error);
  } else {
    console.log(`[SUPABASE SAVE] ✓ Member "${member.name}" saved successfully to Supabase.`);
  }
}

/**
 * Reads ALL members from the Supabase `members` table.
 * Returns an empty array (and logs an error) on failure.
 */
export async function getAllMembersFromSupabase(): Promise<Member[]> {
  console.log('[SUPABASE READ] Fetching all members from Supabase...');

  const { data, error } = await supabase
    .from('members')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[SUPABASE READ] ✗ Failed to fetch members:', error.message, error);
    return [];
  }

  const members = (data ?? []).map(rowToMember);
  console.log(`[SUPABASE READ] ✓ Fetched ${members.length} member(s) from Supabase.`);
  return members;
}

/**
 * Reads a single Member from Supabase by their id.
 * Returns null if not found or on error.
 */
export async function getMemberFromSupabase(memberId: string): Promise<Member | null> {
  console.log(`[SUPABASE READ] Fetching member by id: ${memberId}`);

  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('id', memberId)
    .single();

  if (error) {
    console.error(`[SUPABASE READ] ✗ Failed to fetch member ${memberId}:`, error.message);
    return null;
  }

  const member = rowToMember(data);
  console.log(`[SUPABASE READ] ✓ Fetched member "${member.name}" from Supabase.`);
  return member;
}

/**
 * Deletes a single member from the Supabase `members` table by id.
 */
export async function deleteMemberFromSupabase(memberId: string): Promise<void> {
  console.log(`[SUPABASE DELETE] Deleting member id: ${memberId}`);

  const { error } = await supabase
    .from('members')
    .delete()
    .eq('id', memberId);

  if (error) {
    console.error(`[SUPABASE DELETE] ✗ Failed to delete member ${memberId}:`, error.message);
  } else {
    console.log(`[SUPABASE DELETE] ✓ Member ${memberId} deleted from Supabase.`);
  }
}
