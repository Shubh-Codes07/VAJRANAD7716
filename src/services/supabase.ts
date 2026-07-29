import { createClient } from '@supabase/supabase-js';
import type { Member, AttendanceSession, AttendanceRecord, Notice, GalleryItem, Folder, EventCountdown, PerformanceRequest } from '../types';

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

// ─────────────────────────────────────────────────────────────
// DATABASE: Sessions
// ─────────────────────────────────────────────────────────────

export async function saveSessionToSupabase(s: AttendanceSession): Promise<void> {
  console.log(`[SUPABASE SAVE] Session "${s.title}" (${s.type}) on ${s.date}`);
  const { error } = await supabase.from('sessions').upsert({
    id: s.id, type: s.type, title: s.title, date: s.date,
    day: s.day, is_active: s.isActive, created_by: s.createdBy,
  }, { onConflict: 'id' });
  if (error) console.error('[SUPABASE SAVE] ✗ Session save failed:', error.message);
  else console.log('[SUPABASE SAVE] ✓ Session saved.');
}

export async function deleteSessionFromSupabase(id: string): Promise<void> {
  const { error } = await supabase.from('sessions').delete().eq('id', id);
  if (error) console.error(`[SUPABASE DELETE] ✗ Session ${id}:`, error.message);
  else console.log(`[SUPABASE DELETE] ✓ Session ${id} deleted.`);
}

export async function getAllSessionsFromSupabase(): Promise<AttendanceSession[]> {
  console.log('[SUPABASE READ] Fetching all sessions...');
  const { data, error } = await supabase.from('sessions').select('*').order('date', { ascending: false });
  if (error) { console.error('[SUPABASE READ] ✗ Sessions:', error.message); return []; }
  const rows = (data ?? []).map((r: any): AttendanceSession => ({
    id: r.id, type: r.type, title: r.title, date: r.date,
    day: r.day, isActive: r.is_active, createdBy: r.created_by,
  }));
  console.log(`[SUPABASE READ] ✓ Fetched ${rows.length} session(s).`);
  return rows;
}

// ─────────────────────────────────────────────────────────────
// DATABASE: Attendance Records
// ─────────────────────────────────────────────────────────────

export async function saveRecordToSupabase(r: AttendanceRecord): Promise<void> {
  console.log(`[SUPABASE SAVE] Record: ${r.memberName} @ session ${r.sessionId}`);
  const { error } = await supabase.from('records').upsert({
    id: r.id, session_id: r.sessionId, member_id: r.memberId,
    member_name: r.memberName, instrument: r.instrument,
    scan_time: r.scanTime, scanned_by: r.scannedBy,
    type: r.type, date: r.date,
  }, { onConflict: 'id' });
  if (error) console.error('[SUPABASE SAVE] ✗ Record save failed:', error.message);
  else console.log('[SUPABASE SAVE] ✓ Record saved.');
}

export async function deleteRecordFromSupabase(id: string): Promise<void> {
  const { error } = await supabase.from('records').delete().eq('id', id);
  if (error) console.error(`[SUPABASE DELETE] ✗ Record ${id}:`, error.message);
}

export async function deleteRecordsBySessionFromSupabase(sessionId: string): Promise<void> {
  const { error } = await supabase.from('records').delete().eq('session_id', sessionId);
  if (error) console.error(`[SUPABASE DELETE] ✗ Records for session ${sessionId}:`, error.message);
  else console.log(`[SUPABASE DELETE] ✓ Records for session ${sessionId} deleted.`);
}

/**
 * Checks Supabase for an existing attendance record for the given member on the
 * given date and session type. Returns the found record, or null if none exists.
 * This is the server-side (cross-device) source of truth for duplicate-scan prevention.
 */
export async function checkDuplicateRecordInSupabase(
  memberId: string,
  date: string,
  sessionType: string
): Promise<AttendanceRecord | null> {
  console.log(`[SUPABASE DUPE-CHECK] Querying records for memberId=${memberId}, date=${date}, type=${sessionType}...`);

  const { data, error } = await supabase
    .from('records')
    .select('*')
    .eq('member_id', memberId)
    .eq('date', date)
    .eq('type', sessionType)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[SUPABASE DUPE-CHECK] ✗ Query failed:', error.message);
    return null; // Fail open: let the local check handle it
  }

  if (data) {
    const record: AttendanceRecord = {
      id: data.id,
      sessionId: data.session_id,
      memberId: data.member_id,
      memberName: data.member_name,
      instrument: data.instrument,
      scanTime: data.scan_time,
      scannedBy: data.scanned_by,
      type: data.type,
      date: data.date,
    };
    console.log(`[SUPABASE DUPE-CHECK] ✓ Found existing record: id=${record.id}, scanTime=${record.scanTime}, scannedBy=${record.scannedBy}`);
    return record;
  }

  console.log(`[SUPABASE DUPE-CHECK] ✓ No existing record found — member not yet marked present.`);
  return null;
}

export async function getAllRecordsFromSupabase(): Promise<AttendanceRecord[]> {
  console.log('[SUPABASE READ] Fetching all records...');
  const { data, error } = await supabase.from('records').select('*').order('date', { ascending: false });
  if (error) { console.error('[SUPABASE READ] ✗ Records:', error.message); return []; }
  const rows = (data ?? []).map((r: any): AttendanceRecord => ({
    id: r.id, sessionId: r.session_id, memberId: r.member_id,
    memberName: r.member_name, instrument: r.instrument,
    scanTime: r.scan_time, scannedBy: r.scanned_by, type: r.type, date: r.date,
  }));
  console.log(`[SUPABASE READ] ✓ Fetched ${rows.length} record(s).`);
  return rows;
}

// ─────────────────────────────────────────────────────────────
// DATABASE: Notices
// ─────────────────────────────────────────────────────────────

export async function saveNoticeToSupabase(n: Notice): Promise<void> {
  console.log(`[SUPABASE SAVE] Notice "${n.title}"`);
  const { error } = await supabase.from('notices').upsert({
    id: n.id, title: n.title, content: n.content,
    date: n.date, type: n.type, folder_id: n.folderId ?? null,
  }, { onConflict: 'id' });
  if (error) console.error('[SUPABASE SAVE] ✗ Notice save failed:', error.message);
  else console.log('[SUPABASE SAVE] ✓ Notice saved.');
}

export async function deleteNoticeFromSupabase(id: string): Promise<void> {
  const { error } = await supabase.from('notices').delete().eq('id', id);
  if (error) console.error(`[SUPABASE DELETE] ✗ Notice ${id}:`, error.message);
  else console.log(`[SUPABASE DELETE] ✓ Notice ${id} deleted.`);
}

export async function deleteNoticesByFolderFromSupabase(folderId: string): Promise<void> {
  const { error } = await supabase.from('notices').delete().eq('folder_id', folderId);
  if (error) console.error(`[SUPABASE DELETE] ✗ Notices for folder ${folderId}:`, error.message);
}

export async function getAllNoticesFromSupabase(): Promise<Notice[]> {
  console.log('[SUPABASE READ] Fetching all notices...');
  const { data, error } = await supabase.from('notices').select('*').order('date', { ascending: false });
  if (error) { console.error('[SUPABASE READ] ✗ Notices:', error.message); return []; }
  const rows = (data ?? []).map((r: any): Notice => ({
    id: r.id, title: r.title, content: r.content,
    date: r.date, type: r.type, folderId: r.folder_id ?? undefined,
  }));
  console.log(`[SUPABASE READ] ✓ Fetched ${rows.length} notice(s).`);
  return rows;
}

// ─────────────────────────────────────────────────────────────
// DATABASE: Gallery
// ─────────────────────────────────────────────────────────────

export async function saveGalleryItemToSupabase(g: GalleryItem): Promise<void> {
  console.log(`[SUPABASE SAVE] Gallery item "${g.title}" (${g.type})`);
  const { error } = await supabase.from('gallery').upsert({
    id: g.id, url: g.url, type: g.type,
    title: g.title, folder_id: g.folderId ?? null,
  }, { onConflict: 'id' });
  if (error) console.error('[SUPABASE SAVE] ✗ Gallery item save failed:', error.message);
  else console.log('[SUPABASE SAVE] ✓ Gallery item saved.');
}

export async function deleteGalleryItemFromSupabase(id: string): Promise<void> {
  const { error } = await supabase.from('gallery').delete().eq('id', id);
  if (error) console.error(`[SUPABASE DELETE] ✗ Gallery ${id}:`, error.message);
  else console.log(`[SUPABASE DELETE] ✓ Gallery item ${id} deleted.`);
}

export async function deleteGalleryByFolderFromSupabase(folderId: string): Promise<void> {
  const { error } = await supabase.from('gallery').delete().eq('folder_id', folderId);
  if (error) console.error(`[SUPABASE DELETE] ✗ Gallery for folder ${folderId}:`, error.message);
}

export async function getAllGalleryFromSupabase(): Promise<GalleryItem[]> {
  console.log('[SUPABASE READ] Fetching all gallery items...');
  const { data, error } = await supabase.from('gallery').select('*').order('created_at', { ascending: false });
  if (error) { console.error('[SUPABASE READ] ✗ Gallery:', error.message); return []; }
  const rows = (data ?? []).map((r: any): GalleryItem => ({
    id: r.id, url: r.url, type: r.type,
    title: r.title, folderId: r.folder_id ?? undefined,
  }));
  console.log(`[SUPABASE READ] ✓ Fetched ${rows.length} gallery item(s).`);
  return rows;
}

// ─────────────────────────────────────────────────────────────
// DATABASE: Folders
// ─────────────────────────────────────────────────────────────

export async function saveFolderToSupabase(f: Folder): Promise<void> {
  console.log(`[SUPABASE SAVE] Folder "${f.name}"`);
  const { error } = await supabase.from('folders').upsert({
    id: f.id, name: f.name, description: f.description ?? null,
    created_at: f.createdAt,
  }, { onConflict: 'id' });
  if (error) console.error('[SUPABASE SAVE] ✗ Folder save failed:', error.message);
  else console.log('[SUPABASE SAVE] ✓ Folder saved.');
}

export async function deleteFolderFromSupabase(id: string): Promise<void> {
  const { error } = await supabase.from('folders').delete().eq('id', id);
  if (error) console.error(`[SUPABASE DELETE] ✗ Folder ${id}:`, error.message);
  else console.log(`[SUPABASE DELETE] ✓ Folder ${id} deleted.`);
}

export async function getAllFoldersFromSupabase(): Promise<Folder[]> {
  console.log('[SUPABASE READ] Fetching all folders...');
  const { data, error } = await supabase.from('folders').select('*').order('created_at', { ascending: true });
  if (error) { console.error('[SUPABASE READ] ✗ Folders:', error.message); return []; }
  const rows = (data ?? []).map((r: any): Folder => ({
    id: r.id, name: r.name,
    description: r.description ?? undefined, createdAt: r.created_at,
  }));
  console.log(`[SUPABASE READ] ✓ Fetched ${rows.length} folder(s).`);
  return rows;
}

// ─────────────────────────────────────────────────────────────
// DATABASE: Countdowns
// ─────────────────────────────────────────────────────────────

export async function saveCountdownToSupabase(c: EventCountdown): Promise<void> {
  console.log(`[SUPABASE SAVE] Countdown "${c.heading}" on ${c.date}`);
  const { error } = await supabase.from('countdowns').upsert({
    id: c.id, heading: c.heading, date: c.date,
    is_active: c.isActive, created_at: c.createdAt,
  }, { onConflict: 'id' });
  if (error) console.error('[SUPABASE SAVE] ✗ Countdown save failed:', error.message);
  else console.log('[SUPABASE SAVE] ✓ Countdown saved.');
}

export async function deleteCountdownFromSupabase(id: string): Promise<void> {
  const { error } = await supabase.from('countdowns').delete().eq('id', id);
  if (error) console.error(`[SUPABASE DELETE] ✗ Countdown ${id}:`, error.message);
  else console.log(`[SUPABASE DELETE] ✓ Countdown ${id} deleted.`);
}

export async function getAllCountdownsFromSupabase(): Promise<EventCountdown[]> {
  console.log('[SUPABASE READ] Fetching all countdowns...');
  const { data, error } = await supabase.from('countdowns').select('*').order('created_at', { ascending: false });
  if (error) { console.error('[SUPABASE READ] ✗ Countdowns:', error.message); return []; }
  const rows = (data ?? []).map((r: any): EventCountdown => ({
    id: r.id, heading: r.heading, date: r.date,
    isActive: r.is_active, createdAt: r.created_at,
  }));
  console.log(`[SUPABASE READ] ✓ Fetched ${rows.length} countdown(s).`);
  return rows;
}

// ─────────────────────────────────────────────────────────────
// DATABASE: Performance Requests (Callouts / RSVP Polls)
// ─────────────────────────────────────────────────────────────

export async function savePerformanceRequestToSupabase(p: PerformanceRequest): Promise<void> {
  console.log(`[SUPABASE SAVE] Performance request "${p.title}" on ${p.date}`);
  const { error } = await supabase.from('performance_requests').upsert({
    id: p.id, title: p.title, date: p.date, time: p.time,
    location: p.location, description: p.description ?? null,
    is_active: p.isActive, responses: p.responses ?? {},
    expiry_hours: p.expiryHours ?? 48, created_at: p.createdAt,
  }, { onConflict: 'id' });
  if (error) console.error('[SUPABASE SAVE] ✗ Performance request save failed:', error.message);
  else console.log('[SUPABASE SAVE] ✓ Performance request saved.');
}

export async function deletePerformanceRequestFromSupabase(id: string): Promise<void> {
  const { error } = await supabase.from('performance_requests').delete().eq('id', id);
  if (error) console.error(`[SUPABASE DELETE] ✗ PR ${id}:`, error.message);
  else console.log(`[SUPABASE DELETE] ✓ Performance request ${id} deleted.`);
}

export async function getAllPerformanceRequestsFromSupabase(): Promise<PerformanceRequest[]> {
  console.log('[SUPABASE READ] Fetching all performance requests...');
  const { data, error } = await supabase.from('performance_requests').select('*').order('created_at', { ascending: false });
  if (error) { console.error('[SUPABASE READ] ✗ Performance requests:', error.message); return []; }
  const rows = (data ?? []).map((r: any): PerformanceRequest => ({
    id: r.id, title: r.title, date: r.date, time: r.time,
    location: r.location, description: r.description ?? undefined,
    isActive: r.is_active, responses: r.responses ?? {},
    expiryHours: r.expiry_hours ?? 48, createdAt: r.created_at,
  }));
  console.log(`[SUPABASE READ] ✓ Fetched ${rows.length} performance request(s).`);
  return rows;
}

// ─────────────────────────────────────────────────────────────
// DATABASE: Cloud Backups (Admin)
// ─────────────────────────────────────────────────────────────

export async function saveCloudBackupToSupabase(backup: { id: string; name: string; url: string; size: string; createdAt: string }): Promise<void> {
  console.log(`[SUPABASE SAVE] Cloud backup "${backup.name}"`);
  const { error } = await supabase.from('cloud_backups').upsert({
    id: backup.id, name: backup.name, url: backup.url,
    size: backup.size, created_at: backup.createdAt,
  }, { onConflict: 'id' });
  if (error) console.error('[SUPABASE SAVE] ✗ Cloud backup save failed:', error.message);
  else console.log('[SUPABASE SAVE] ✓ Cloud backup saved.');
}

export async function deleteCloudBackupFromSupabase(id: string): Promise<void> {
  const { error } = await supabase.from('cloud_backups').delete().eq('id', id);
  if (error) console.error(`[SUPABASE DELETE] ✗ Cloud backup ${id}:`, error.message);
  else console.log(`[SUPABASE DELETE] ✓ Cloud backup ${id} deleted.`);
}

export async function getAllCloudBackupsFromSupabase(): Promise<any[]> {
  console.log('[SUPABASE READ] Fetching cloud backups...');
  const { data, error } = await supabase.from('cloud_backups').select('*').order('created_at', { ascending: false });
  if (error) { console.error('[SUPABASE READ] ✗ Cloud backups:', error.message); return []; }
  return (data ?? []).map((r: any) => ({
    id: r.id, name: r.name, url: r.url, size: r.size, createdAt: r.created_at,
  }));
}
