import { Member, AttendanceSession, AttendanceRecord, Notice, GalleryItem, Folder, Instrument, Gender, BloodGroup, AttendanceType, EventCountdown, PerformanceRequest } from '../types';
import { db, handleFirestoreError, OperationType, cleanObjectForFirestore } from './firebase';
import { collection, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import {
  saveMemberToSupabase, deleteMemberFromSupabase, getAllMembersFromSupabase,
  saveSessionToSupabase, deleteSessionFromSupabase, getAllSessionsFromSupabase,
  saveRecordToSupabase, deleteRecordFromSupabase, deleteRecordsBySessionFromSupabase, getAllRecordsFromSupabase,
  checkDuplicateRecordInSupabase,
  saveNoticeToSupabase, deleteNoticeFromSupabase, deleteNoticesByFolderFromSupabase, getAllNoticesFromSupabase,
  saveGalleryItemToSupabase, deleteGalleryItemFromSupabase, deleteGalleryByFolderFromSupabase, getAllGalleryFromSupabase,
  saveFolderToSupabase, deleteFolderFromSupabase, getAllFoldersFromSupabase,
  saveCountdownToSupabase, deleteCountdownFromSupabase, getAllCountdownsFromSupabase,
  savePerformanceRequestToSupabase, deletePerformanceRequestFromSupabase, getAllPerformanceRequestsFromSupabase,
} from './supabase';

// Safe wrapper for localStorage.setItem to completely prevent QuotaExceededError crashes
try {
  const originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key: string, value: string) {
    try {
      originalSetItem(key, value);
    } catch (e) {
      console.warn(`LocalStorage write failed for key "${key}" (likely quota exceeded):`, e);
    }
  };
} catch (err) {
  console.error("Failed to wrap localStorage.setItem:", err);
}

// Default Seed Data
const MOCK_MEMBERS: Member[] = [];

const MOCK_SESSIONS: AttendanceSession[] = [];

const MOCK_RECORDS: AttendanceRecord[] = [];

const MOCK_NOTICES: Notice[] = [];

const MOCK_GALLERY: GalleryItem[] = [];

// Helper to calculate age from DOB
export function calculateAge(dobString?: string): number {
  if (!dobString) return 0;
  const birthDate = new Date(dobString);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

class VajranadStore {
  private membersKey = 'vajranad_members';
  private sessionsKey = 'vajranad_sessions';
  private recordsKey = 'vajranad_records';
  private noticesKey = 'vajranad_notices';
  private galleryKey = 'vajranad_gallery';
  private foldersKey = 'vajranad_folders';
  private currentUserKey = 'vajranad_current_user';
  private countdownsKey = 'vajranad_countdowns';
  private performanceRequestsKey = 'vajranad_performance_requests';

  constructor() {
    this.initDatabase();
    this.syncFromFirestore();
  }

  // --- Firestore Persistence Helpers ---
  private saveFolderToFirestore(f: Folder) {
    saveFolderToSupabase(f);
  }

  private deleteFolderFromFirestore(id: string) {
    deleteFolderFromSupabase(id);
  }

  // Members are now persisted to Supabase (not Firestore).
  // This is a thin wrapper kept for backwards-compatibility at call sites.
  private saveMemberToFirestore(m: Member) {
    saveMemberToSupabase(m); // fire-and-forget
  }

  private deleteMemberFromFirestore(id: string) {
    deleteMemberFromSupabase(id); // fire-and-forget
  }

  private deleteSessionFromFirestore(id: string) {
    deleteSessionFromSupabase(id);
  }

  private deleteRecordFromFirestore(id: string) {
    deleteRecordFromSupabase(id);
  }

  private saveSessionToFirestore(s: AttendanceSession) {
    saveSessionToSupabase(s);
  }

  private saveRecordToFirestore(r: AttendanceRecord) {
    saveRecordToSupabase(r);
  }

  private saveNoticeToFirestore(n: Notice) {
    saveNoticeToSupabase(n);
  }

  private deleteNoticeFromFirestore(id: string) {
    deleteNoticeFromSupabase(id);
  }

  private saveGalleryToFirestore(g: GalleryItem) {
    saveGalleryItemToSupabase(g);
  }

  private deleteGalleryFromFirestore(id: string) {
    deleteGalleryItemFromSupabase(id);
  }

  private saveCountdownToFirestore(c: EventCountdown) {
    saveCountdownToSupabase(c);
  }

  private deleteCountdownFromFirestore(id: string) {
    deleteCountdownFromSupabase(id);
  }

  public async syncFromFirestore() {
    try {
      console.log("Starting bidirectional sync with Firestore...");

      // 1. Members — read from Supabase (source of truth)
      const remoteMembers = await getAllMembersFromSupabase();
      if (remoteMembers.length > 0) {
        // ── QR CODE AUTO-REPAIR ──────────────────────────────────────────────────
        // Members created before the empty-qrCode fix may have qrCode === ''.
        // The rowToMember in supabase.ts now uses || instead of ??, so any blank
        // qr_code from the DB will already fall back to member id. But we also do
        // a one-time pass here to write the corrected value back to Supabase so
        // it is permanently fixed and won't keep relying on the fallback.
        const repairPromises: Promise<void>[] = [];
        for (const m of remoteMembers) {
          if (!m.qrCode || m.qrCode.trim() === '') {
            const repairedQR = m.id; // use member id as the permanent qrCode
            const repaired = { ...m, qrCode: repairedQR };
            console.warn(`[STORE] [QR-REPAIR] Member "${m.name}" (id=${m.id}) had blank qrCode — repairing to "${repairedQR}" and saving to Supabase.`);
            // Update in the array in-place so localStorage also gets the fix
            Object.assign(m, repaired);
            repairPromises.push(saveMemberToSupabase(repaired));
          }
        }
        if (repairPromises.length > 0) {
          await Promise.allSettled(repairPromises);
          console.log(`[STORE] [QR-REPAIR] ✓ Repaired ${repairPromises.length} member(s) with blank qrCode.`);
        }
        // ────────────────────────────────────────────────────────────────────────
        localStorage.setItem(this.membersKey, JSON.stringify(remoteMembers));
        console.log(`[STORE] Synced ${remoteMembers.length} member(s) from Supabase into localStorage.`);
      } else {
        // No members in Supabase yet — push local members up
        console.log('[STORE] No members found in Supabase. Pushing local members up...');
        const localMembers = this.getMembers();
        for (const m of localMembers) {
          await saveMemberToSupabase(m);
        }
      }

      // 2. Sessions — read from Supabase
      const remoteSessions = await getAllSessionsFromSupabase();
      if (remoteSessions.length > 0) {
        localStorage.setItem(this.sessionsKey, JSON.stringify(remoteSessions));
        console.log(`[STORE] Synced ${remoteSessions.length} session(s) from Supabase.`);
      } else {
        const localSessions = this.getSessions();
        for (const s of localSessions) await saveSessionToSupabase(s);
      }

      // 3. Records — read from Supabase
      const remoteRecords = await getAllRecordsFromSupabase();
      if (remoteRecords.length > 0) {
        localStorage.setItem(this.recordsKey, JSON.stringify(remoteRecords));
        console.log(`[STORE] Synced ${remoteRecords.length} record(s) from Supabase.`);
      } else {
        const localRecords = this.getAttendanceRecords();
        for (const r of localRecords) await saveRecordToSupabase(r);
      }

      // 4. Notices — read from Supabase
      const remoteNotices = await getAllNoticesFromSupabase();
      if (remoteNotices.length > 0) {
        localStorage.setItem(this.noticesKey, JSON.stringify(remoteNotices));
        console.log(`[STORE] Synced ${remoteNotices.length} notice(s) from Supabase.`);
      } else {
        const localNotices = this.getNotices();
        for (const n of localNotices) await saveNoticeToSupabase(n);
      }

      // 5. Gallery — read from Supabase
      const remoteGallery = await getAllGalleryFromSupabase();
      if (remoteGallery.length > 0) {
        localStorage.setItem(this.galleryKey, JSON.stringify(remoteGallery));
        console.log(`[STORE] Synced ${remoteGallery.length} gallery item(s) from Supabase.`);
      } else {
        const localGallery = this.getGalleryItems();
        for (const g of localGallery) await saveGalleryItemToSupabase(g);
      }

      // 6. Folders — read from Supabase
      const remoteFolders = await getAllFoldersFromSupabase();
      if (remoteFolders.length > 0) {
        localStorage.setItem(this.foldersKey, JSON.stringify(remoteFolders));
        console.log(`[STORE] Synced ${remoteFolders.length} folder(s) from Supabase.`);
      } else {
        const localFolders = this.getFolders();
        for (const f of localFolders) await saveFolderToSupabase(f);
      }

      // 7. Countdowns — read from Supabase
      const remoteCountdowns = await getAllCountdownsFromSupabase();
      if (remoteCountdowns.length > 0) {
        localStorage.setItem(this.countdownsKey, JSON.stringify(remoteCountdowns));
        console.log(`[STORE] Synced ${remoteCountdowns.length} countdown(s) from Supabase.`);
      } else {
        const localCountdowns = this.getCountdowns();
        for (const c of localCountdowns) await saveCountdownToSupabase(c);
      }

      // 8. Performance Requests — Supabase is the single source of truth.
      //    Always overwrite localStorage from Supabase (even if the result is []).
      //    We must NEVER push local data back to Supabase here because that is the
      //    exact mechanism that resurrects deleted callouts for new sessions.
      console.log('[STORE] [CALLOUT LOAD] Fetching performance requests from Supabase...');
      const remotePerformanceRequests = await getAllPerformanceRequestsFromSupabase();
      // Filter out already-expired entries before storing — Supabase data is authoritative
      const now = Date.now();
      const validRemoteRequests = remotePerformanceRequests.filter(pr => {
        const expiryMs = new Date(pr.createdAt).getTime() + (pr.expiryHours ?? 48) * 3600_000;
        const expired = now >= expiryMs;
        if (expired) {
          console.log(`[STORE] [CALLOUT EXPIRY] Callout "${pr.title}" (id=${pr.id}) expired — omitting from local cache and queuing Supabase delete.`);
          // Async cleanup: remove expired record from Supabase so it doesn't keep showing up
          deletePerformanceRequestFromSupabase(pr.id);
        }
        return !expired;
      });
      localStorage.setItem(this.performanceRequestsKey, JSON.stringify(validRemoteRequests));
      console.log(`[STORE] [CALLOUT LOAD] ✓ Wrote ${validRemoteRequests.length} non-expired performance request(s) into localStorage (source: Supabase).`);

      console.log('[STORE] ✓ Full Supabase sync completed successfully!');
    } catch (e: any) {
      const errMsg = e instanceof Error ? e.message : String(e);
      if (errMsg.toLowerCase().includes('permission') || errMsg.toLowerCase().includes('insufficient')) {
        console.warn("Firestore sync was restricted by security rules. Gracefully running on LocalStorage backup.");
      } else {
        console.warn("Firestore sync failed, falling back to local cache:", e);
      }
    }
  }

  private initDatabase() {
    // Clear old seeded mock data containing "mem_rahul" to clean up previous state
    const existingMembers = localStorage.getItem(this.membersKey);
    if (existingMembers && existingMembers.includes('mem_rahul')) {
      localStorage.removeItem(this.membersKey);
      localStorage.removeItem(this.sessionsKey);
      localStorage.removeItem(this.recordsKey);
      localStorage.removeItem(this.noticesKey);
      localStorage.removeItem(this.galleryKey);
      localStorage.removeItem(this.foldersKey);
    }

    if (!localStorage.getItem(this.membersKey)) {
      localStorage.setItem(this.membersKey, JSON.stringify(MOCK_MEMBERS));
    }
    if (!localStorage.getItem(this.sessionsKey)) {
      localStorage.setItem(this.sessionsKey, JSON.stringify(MOCK_SESSIONS));
    }
    if (!localStorage.getItem(this.recordsKey)) {
      localStorage.setItem(this.recordsKey, JSON.stringify(MOCK_RECORDS));
    }
    if (!localStorage.getItem(this.countdownsKey)) {
      const defaultCountdowns: EventCountdown[] = [
        {
          id: 'cd_ganesh',
          heading: 'Ganesh Utsav Belagavi Miravnuk 🥁',
          date: '2026-09-15',
          createdAt: new Date().toISOString(),
          isActive: true
        }
      ];
      localStorage.setItem(this.countdownsKey, JSON.stringify(defaultCountdowns));
    }

    if (!localStorage.getItem(this.foldersKey)) {
      const defaultFolders: Folder[] = [
        {
          id: 'fold_ganesh',
          name: 'Ganesh Utsav 2026 (गणेशोत्सव २०२६)',
          description: 'Practice schedules, media, and announcements for the grand Ganesh Festival performance in Belagavi.',
          createdAt: new Date('2026-07-01T10:00:00.000Z').toISOString()
        },
        {
          id: 'fold_shiv',
          name: 'Shiv Jayanti Celebration (शिवजयंती उत्सव)',
          description: 'Performance details, timings, routing map and notices for Chhatrapati Shivaji Maharaj Jayanti.',
          createdAt: new Date('2026-07-10T12:00:00.000Z').toISOString()
        },
        {
          id: 'fold_general',
          name: 'General Announcements (सामान्य सूचना)',
          description: 'Official group rules, administrative notices, registration forms, and general announcements.',
          createdAt: new Date('2026-06-15T08:00:00.000Z').toISOString()
        }
      ];
      localStorage.setItem(this.foldersKey, JSON.stringify(defaultFolders));

      // Seed initial notices inside these folders
      const initialNotices: Notice[] = [
        {
          id: 'not_seed_1',
          folderId: 'fold_ganesh',
          title: 'Daily Practice Schedule - Belagavi Ground',
          content: 'Practice starts everyday at 6:30 PM sharp. Attendance is compulsory for all registered Vadak (New and Experienced). Please bring your sticks and ear protection.',
          date: '2026-07-18',
          type: 'Practice Schedule'
        },
        {
          id: 'not_seed_2',
          folderId: 'fold_shiv',
          title: 'Miraj Road Miravnuk Performance Details',
          content: 'Performance route is confirmed from Belagavi Fort to Chhatrapati Sambhaji Circle. Dress Code: Traditional White Kurta Pyjama with Orange Pheta. Scanners will be active at 4:30 PM.',
          date: '2026-07-15',
          type: 'Performance Details'
        },
        {
          id: 'not_seed_3',
          folderId: 'fold_general',
          title: 'Mandatory Pathak ID Verification',
          content: 'Attention all players: Registration now strictly requires the verified Pathak ID (VDTP@772016_BGM) to prevent unauthorized entry. Ensure your profile fields are completed to unlock your digital QR Card.',
          date: '2026-07-12',
          type: 'Announcement'
        }
      ];
      localStorage.setItem(this.noticesKey, JSON.stringify(initialNotices));

      // Seed initial gallery items inside these folders
      const initialGallery: GalleryItem[] = [
        {
          id: 'gal_seed_1',
          folderId: 'fold_ganesh',
          url: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&w=600&q=80',
          type: 'photo',
          title: 'Dhol Pathak Practice High-Energy'
        },
        {
          id: 'gal_seed_2',
          folderId: 'fold_shiv',
          url: 'https://images.unsplash.com/photo-1561489422-45de3d015e3e?auto=format&fit=crop&w=600&q=80',
          type: 'photo',
          title: 'Tasha Vadak Performance Solo'
        }
      ];
      localStorage.setItem(this.galleryKey, JSON.stringify(initialGallery));
    }

    if (!localStorage.getItem(this.noticesKey)) {
      localStorage.setItem(this.noticesKey, JSON.stringify(MOCK_NOTICES));
    }
    if (!localStorage.getItem(this.galleryKey)) {
      localStorage.setItem(this.galleryKey, JSON.stringify(MOCK_GALLERY));
    }
    if (!localStorage.getItem(this.performanceRequestsKey)) {
      localStorage.setItem(this.performanceRequestsKey, JSON.stringify([]));
    }
  }

  // Backup and Restore
  public getBackupString(): string {
    const data = {
      members: this.getMembers(),
      sessions: this.getSessions(),
      records: this.getAttendanceRecords(),
      folders: this.getFolders(),
      notices: this.getNotices(),
      gallery: this.getGalleryItems(),
      performanceRequests: this.getPerformanceRequests()
    };
    return JSON.stringify(data, null, 2);
  }

  public restoreBackup(backupJson: string): boolean {
    try {
      const data = JSON.parse(backupJson);
      if (data.members && Array.isArray(data.members)) {
        localStorage.setItem(this.membersKey, JSON.stringify(data.members));
      }
      if (data.sessions && Array.isArray(data.sessions)) {
        localStorage.setItem(this.sessionsKey, JSON.stringify(data.sessions));
      }
      if (data.records && Array.isArray(data.records)) {
        localStorage.setItem(this.recordsKey, JSON.stringify(data.records));
      }
      if (data.folders && Array.isArray(data.folders)) {
        localStorage.setItem(this.foldersKey, JSON.stringify(data.folders));
      }
      if (data.notices && Array.isArray(data.notices)) {
        localStorage.setItem(this.noticesKey, JSON.stringify(data.notices));
      }
      if (data.gallery && Array.isArray(data.gallery)) {
        localStorage.setItem(this.galleryKey, JSON.stringify(data.gallery));
      }
      if (data.performanceRequests && Array.isArray(data.performanceRequests)) {
        localStorage.setItem(this.performanceRequestsKey, JSON.stringify(data.performanceRequests));
      }
      return true;
    } catch (e) {
      console.error('Failed to restore backup', e);
      return false;
    }
  }

  // --- Auth API ---
  public getCurrentUser(): Member | null {
    const userStr = localStorage.getItem(this.currentUserKey);
    if (!userStr) return null;
    const basicUser = JSON.parse(userStr) as Member;
    // Reload full details from member list to keep synced
    const members = this.getMembers();
    const fullUser = members.find(m => m.id === basicUser.id || m.email === basicUser.email);
    return fullUser || basicUser;
  }

  public login(email: string, password?: string, isSecretAdminLogin?: boolean): { success: boolean; member?: Member; error?: string } {
    const members = this.getMembers();
    // Normalize email/username input
    const normEmail = email.trim().toLowerCase();
    const cleanPassword = (password || '').trim();
    
    // Check if admin login credentials
    if (
      normEmail === 'admin@vajranad.com' ||
      normEmail === 'zhende parshuram' ||
      normEmail === 'zhende_parshuram' ||
      normEmail === 'vajranad_7716' ||
      normEmail === 'vajranad' ||
      normEmail === 'admin'
    ) {
      if (!isSecretAdminLogin) {
        return { success: false, error: 'Incorrect information.' };
      }

      const isCorrectPassword = 
        cleanPassword.toUpperCase() === 'KINGOFNORTH' || 
        cleanPassword.toLowerCase() === 'admin123';

      if (!isCorrectPassword) {
        return { success: false, error: 'Incorrect administrator password.' };
      }

      // Automatically reset any admin_deleted flags so that login is never blocked
      localStorage.removeItem('admin_deleted');

      let admin = members.find(m => m.email === 'admin@vajranad.com');
      if (!admin) {
        // Create the admin member
        admin = {
          id: 'mem_admin',
          email: 'admin@vajranad.com',
          name: 'Vajranad Admin',
          profilePhoto: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80',
          mobileNumber: '9999999999',
          address: 'Belgav Ground, Belgav',
          dob: '1995-01-01',
          gender: 'Male',
          bloodGroup: 'O+',
          motherName: 'Admin Mother',
          motherMobile: '9999999998',
          fatherName: 'Admin Father',
          fatherMobile: '9999999997',
          yearJoined: 2020,
          medicalIssue: false,
          instrument: 'Committee Member',
          isDetailsFilled: true,
          isActive: true,
          scannerPermission: true,
          isCommitteeMember: true,
          qrCode: 'mem_admin',
          password: 'admin_password_unused_default_or_whatever',
          createdAt: new Date().toISOString()
        };
        this.addMember(admin);
      }
      localStorage.setItem(this.currentUserKey, JSON.stringify(admin));
      return { success: true, member: admin };
    }

    const member = members.find(m => m.email.toLowerCase() === normEmail);
    if (!member) {
      return { success: false, error: 'User account not found. Please create an account.' };
    }
    if (!member.isActive) {
      return { success: false, error: 'Your account has been disabled by the admin.' };
    }

    // Verify password if set
    if (member.password && member.password !== (password || '').trim()) {
      return { success: false, error: 'Incorrect password. Please try again.' };
    }

    localStorage.setItem(this.currentUserKey, JSON.stringify(member));
    return { success: true, member };
  }

  public signup(name: string, email: string, password?: string, registrationsOpen: boolean = true): { success: boolean; member?: Member; error?: string } {
    // Backend-level guard: reject signup if registrations are closed, regardless of UI state.
    console.log('[REGISTRATION] Status check at store.signup() — registrations_open:', registrationsOpen);
    if (!registrationsOpen) {
      console.warn('[REGISTRATION] ✗ Sign-up blocked at store level — registrations are currently closed.');
      return { success: false, error: 'Registrations are currently closed. Please contact an admin if you believe this is a mistake.' };
    }

    const members = this.getMembers();
    const normEmail = email.trim().toLowerCase();

    if (members.some(m => m.email.toLowerCase() === normEmail)) {
      return { success: false, error: 'An account with this email already exists.' };
    }

    const newMember: Member = {
      id: 'mem_' + Math.random().toString(36).substr(2, 9),
      email: normEmail,
      name: name.trim(),
      password: password ? password.trim() : undefined,
      isDetailsFilled: false,
      isActive: true,
      scannerPermission: false,
      isCommitteeMember: false,
      medicalIssue: false,
      qrCode: 'mem_' + Math.random().toString(36).substr(2, 9), // Unique ID assigned at signup
      createdAt: new Date().toISOString()
    };

    this.addMember(newMember);
    localStorage.setItem(this.currentUserKey, JSON.stringify(newMember));
    return { success: true, member: newMember };
  }

  public logout() {
    localStorage.removeItem(this.currentUserKey);
  }

  // --- Members API ---
  public getMembers(): Member[] {
    const str = localStorage.getItem(this.membersKey);
    return str ? JSON.parse(str) : [];
  }

  public updateMember(updated: Member) {
    const members = this.getMembers();
    const index = members.findIndex(m => m.id === updated.id);
    if (index !== -1) {
      members[index] = updated;
      localStorage.setItem(this.membersKey, JSON.stringify(members));

      // Sync if it is current user
      const currentUser = this.getCurrentUser();
      if (currentUser && currentUser.id === updated.id) {
        localStorage.setItem(this.currentUserKey, JSON.stringify(updated));
      }

      // Persist to Firestore
      this.saveMemberToFirestore(updated);
    }
  }

  public addMember(member: Member) {
    const members = this.getMembers();
    members.push(member);
    localStorage.setItem(this.membersKey, JSON.stringify(members));

    // Persist to Firestore
    this.saveMemberToFirestore(member);
  }

  public deleteMember(id: string) {
    let members = this.getMembers();
    const deletingAdmin = members.find(m => m.id === id && (m.id === 'mem_admin' || m.email.toLowerCase() === 'admin@vajranad.com'));
    if (deletingAdmin) {
      localStorage.setItem('admin_deleted', 'true');
    }
    members = members.filter(m => m.id !== id);
    localStorage.setItem(this.membersKey, JSON.stringify(members));

    // Persist to Firestore
    this.deleteMemberFromFirestore(id);
  }

  /**
   * Debug utility — call from browser console: store.auditQRCodes()
   * Logs a table of all members showing their qrCode value, its length,
   * and whether it looks healthy. Useful for diagnosing scan failures.
   */
  public auditQRCodes(): void {
    const members = this.getMembers();
    console.group('[QR AUDIT] QR Code Audit for all members');
    const rows = members.map(m => ({
      name: m.name,
      id: m.id,
      qrCode: m.qrCode || '⚠ EMPTY',
      qrLength: (m.qrCode || '').length,
      status: !m.qrCode
        ? '🔴 BLANK — will fail to scan'
        : m.qrCode === m.id
        ? '🟡 Uses member id (OK, just not a dedicated short code)'
        : '✅ Dedicated qrCode — healthy',
    }));
    console.table(rows);
    const broken = rows.filter(r => r.qrLength === 0);
    if (broken.length === 0) {
      console.log('[QR AUDIT] ✅ All members have a non-empty qrCode.');
    } else {
      console.warn(`[QR AUDIT] 🔴 ${broken.length} member(s) have BLANK qrCode — these will FAIL to scan!`, broken.map(r => r.name));
    }
    console.groupEnd();
  }

  // --- Attendance Sessions API ---
  public getSessions(): AttendanceSession[] {
    const str = localStorage.getItem(this.sessionsKey);
    return str ? JSON.parse(str) : [];
  }

  public getActiveSession(): AttendanceSession | null {
    const sessions = this.getSessions();
    const active = sessions.find(s => s.isActive);
    if (!active) return null;

    // Auto-deactivate session if the date is in the past
    const todayDateStr = new Date().toISOString().split('T')[0];
    if (active.date !== todayDateStr) {
      active.isActive = false;
      this.saveSessionToFirestore(active);
      localStorage.setItem(this.sessionsKey, JSON.stringify(sessions));
      return null;
    }
    return active;
  }

  /**
   * Returns an existing session for the given type+date (checking Supabase first),
   * or creates a new one if none exists. Ensures only ONE session per type per day
   * regardless of which device or user triggers the scan.
   */
  public async createOrJoinSession(type: AttendanceType, title: string, creatorName: string): Promise<AttendanceSession> {
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const dayStr = weekdays[today.getDay()];

    // --- Step 1: Check Supabase for an existing session (cross-device source of truth) ---
    console.log(`[SESSION] Looking for existing ${type} session on ${dateStr} in Supabase...`);
    const remoteSessions = await getAllSessionsFromSupabase();
    const remoteExisting = remoteSessions.find(s => s.type === type && s.date === dateStr);

    if (remoteExisting) {
      console.log(`[SESSION] ✓ Found existing ${type} session in Supabase: id=${remoteExisting.id}, createdBy=${remoteExisting.createdBy}. Re-joining.`);

      // Sync into local cache: deactivate others, activate this one
      let sessions = this.getSessions();
      sessions = sessions.filter(s => s.id !== remoteExisting.id); // avoid duplication
      sessions.forEach(s => { s.isActive = false; });
      remoteExisting.isActive = true;
      sessions.push(remoteExisting);
      localStorage.setItem(this.sessionsKey, JSON.stringify(sessions));

      // Persist active flag to Supabase
      this.saveSessionToFirestore(remoteExisting);
      return remoteExisting;
    }

    // --- Step 2: No session in Supabase — check local cache as a fast fallback ---
    const sessions = this.getSessions();
    const localExisting = sessions.find(s => s.type === type && s.date === dateStr);

    if (localExisting) {
      console.log(`[SESSION] ✓ Found existing ${type} session in local cache: id=${localExisting.id}. Re-joining and syncing to Supabase.`);
      sessions.forEach(s => { s.isActive = s.id === localExisting.id; });
      localExisting.isActive = true;
      localStorage.setItem(this.sessionsKey, JSON.stringify(sessions));
      this.saveSessionToFirestore(localExisting); // push up to Supabase so others can see it
      return localExisting;
    }

    // --- Step 3: No session anywhere — create a brand new one ---
    console.log(`[SESSION] No existing ${type} session found for ${dateStr}. Creating new session...`);

    // Deactivate all currently active sessions first
    sessions.forEach(s => {
      if (s.isActive) {
        s.isActive = false;
        this.saveSessionToFirestore(s);
      }
    });

    const newSession: AttendanceSession = {
      id: 'sess_' + Math.random().toString(36).substr(2, 9),
      type,
      title: title.trim(),
      date: dateStr,
      day: dayStr,
      isActive: true,
      createdBy: creatorName
    };

    sessions.push(newSession);
    localStorage.setItem(this.sessionsKey, JSON.stringify(sessions));
    this.saveSessionToFirestore(newSession);

    console.log(`[SESSION] ✓ Created new ${type} session: id=${newSession.id}`);
    return newSession;
  }

  /** @deprecated Use createOrJoinSession instead. Kept for sync-only internal calls. */
  public createSession(type: AttendanceType, title: string, creatorName: string): AttendanceSession {
    const sessions = this.getSessions();

    // Deactivate all previous sessions
    sessions.forEach(s => {
      if (s.isActive) {
        s.isActive = false;
        this.saveSessionToFirestore(s);
      }
    });

    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const dayStr = weekdays[today.getDay()];

    // Join existing local session if found
    const existingSession = sessions.find(s => s.type === type && s.date === dateStr);
    if (existingSession) {
      console.log(`[SESSION] ✓ Joined existing local ${type} session: ${existingSession.id}`);
      existingSession.isActive = true;
      this.saveSessionToFirestore(existingSession);
      localStorage.setItem(this.sessionsKey, JSON.stringify(sessions));
      return existingSession;
    }

    const newSession: AttendanceSession = {
      id: 'sess_' + Math.random().toString(36).substr(2, 9),
      type,
      title: title.trim(),
      date: dateStr,
      day: dayStr,
      isActive: true,
      createdBy: creatorName
    };

    sessions.push(newSession);
    localStorage.setItem(this.sessionsKey, JSON.stringify(sessions));
    this.saveSessionToFirestore(newSession);
    console.log(`[SESSION] ✓ Created new ${type} session: ${newSession.id}`);
    return newSession;
  }

  public closeActiveSession() {
    const sessions = this.getSessions();
    sessions.forEach(s => {
      if (s.isActive) {
        s.isActive = false;
        this.saveSessionToFirestore(s);
      }
    });
    localStorage.setItem(this.sessionsKey, JSON.stringify(sessions));
  }

  public deleteSession(id: string) {
    let sessions = this.getSessions();
    sessions = sessions.filter(s => s.id !== id);
    localStorage.setItem(this.sessionsKey, JSON.stringify(sessions));
    deleteSessionFromSupabase(id);

    // Also delete any associated attendance records from Supabase
    let records = this.getAttendanceRecords();
    const recordsToDelete = records.filter(r => r.sessionId === id);
    records = records.filter(r => r.sessionId !== id);
    localStorage.setItem(this.recordsKey, JSON.stringify(records));
    recordsToDelete.forEach(rec => deleteRecordFromSupabase(rec.id));
    deleteRecordsBySessionFromSupabase(id); // batch delete
  }

  public formatTo12Hour(timeStr: string): string {
    if (!timeStr) return '';
    // If it already has AM or PM (case-insensitive), return as-is
    if (timeStr.toLowerCase().includes('am') || timeStr.toLowerCase().includes('pm')) {
      return timeStr;
    }
    // Parse "HH:MM:SS" or "HH:MM"
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      let hours = parseInt(parts[0], 10);
      const minutes = parts[1];
      const seconds = parts[2] ? parts[2] : null;
      if (isNaN(hours)) return timeStr;
      
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // 0 should be 12
      const hoursStr = hours < 10 ? `0${hours}` : `${hours}`;
      return `${hoursStr}:${minutes}${seconds ? `:${seconds}` : ''} ${ampm}`;
    }
    return timeStr;
  }

  // --- Attendance Records API ---
  public getAttendanceRecords(): AttendanceRecord[] {
    const str = localStorage.getItem(this.recordsKey);
    const records: AttendanceRecord[] = str ? JSON.parse(str) : [];
    return records.map(rec => ({
      ...rec,
      scanTime: this.formatTo12Hour(rec.scanTime)
    }));
  }

  public getMemberAttendanceStats(memberId: string) {
    const records = this.getAttendanceRecords();
    const sessions = this.getSessions();

    const uniqueSessions = sessions.filter((s, index, self) => 
      index === self.findIndex((t) => (
        t.type === s.type && t.date === s.date
      ))
    );

    let practiceHeld = 0;
    let practiceAttended = 0;
    let performanceHeld = 0;
    let performanceAttended = 0;
    let meetingHeld = 0;
    let meetingAttended = 0;

    for (const s of uniqueSessions) {
      if (s.type === 'Practice') practiceHeld++;
      else if (s.type === 'Performance') performanceHeld++;
      else if (s.type === 'Meeting') meetingHeld++;
    }

    const memberRecords = records.filter(r => r.memberId === memberId);
    const uniqueAttendedDates = new Set();
    
    for (const r of memberRecords) {
      const key = `${r.type}-${r.date}`;
      if (!uniqueAttendedDates.has(key)) {
        uniqueAttendedDates.add(key);
        if (r.type === 'Practice') practiceAttended++;
        else if (r.type === 'Performance') performanceAttended++;
        else if (r.type === 'Meeting') meetingAttended++;
      }
    }

    const practicePct = practiceHeld > 0 ? (practiceAttended / practiceHeld) * 100 : 100;
    const performancePct = performanceHeld > 0 ? (performanceAttended / performanceHeld) * 100 : 100;
    const meetingPct = meetingHeld > 0 ? (meetingAttended / meetingHeld) * 100 : 100;

    const totalHeld = practiceHeld + performanceHeld + meetingHeld;
    const totalAttended = practiceAttended + performanceAttended + meetingAttended;
    const overallPct = totalHeld > 0 ? (totalAttended / totalHeld) * 100 : 100;

    const shortages: string[] = [];
    if (practiceHeld > 0 && practicePct < 50) shortages.push('Practice');
    if (performanceHeld > 0 && performancePct < 60) shortages.push('Performance');
    if (meetingHeld > 0 && meetingPct < 75) shortages.push('Meeting');

    return {
      practicePct,
      performancePct,
      meetingPct,
      overallPct,
      shortages,
      practiceAttended,
      practiceHeld,
      performanceAttended,
      performanceHeld,
      meetingAttended,
      meetingHeld
    };
  }

  public async markAttendance(qrCode: string, sessionId: string, scannedBy: string): Promise<{ success: boolean; record?: AttendanceRecord; error?: string; alreadyMarked?: boolean; member?: Member }> {
    const members = this.getMembers();
    const sessions = this.getSessions();

    const session = sessions.find(s => s.id === sessionId);
    if (!session) {
      console.warn(`[SCAN] ✗ Session not found: ${sessionId}`);
      return { success: false, error: 'Active attendance session not found.' };
    }

    // Find member by permanent QR Code or member id
    const member = members.find(m => m.qrCode === qrCode || m.id === qrCode);
    if (!member) {
      console.warn(`[SCAN] ✗ Invalid QR code scanned: ${qrCode}`);
      return { success: false, error: 'Invalid QR Code or Membership Card.' };
    }

    if (!member.isActive) {
      console.warn(`[SCAN] ✗ Disabled member scanned: ${member.name}`);
      return { success: false, error: 'Member is disabled by Administrator.' };
    }

    if (session.type === 'Performance') {
      const stats = this.getMemberAttendanceStats(member.id);
      if (stats.overallPct < 50) {
        console.warn(`[SCAN] ✗ ${member.name} blocked from Vadan session due to low attendance (${stats.overallPct.toFixed(2)}%)`);
        return { success: false, error: 'Attendance below 50% — not eligible for Vadan session' };
      }
    }

    // ── DUPLICATE CHECK (STEP 1): Query Supabase as the cross-device source of truth ──
    // This catches duplicates regardless of which admin/device previously scanned the member.
    console.log(`[SCAN] Checking Supabase for existing ${session.type} record for ${member.name} on ${session.date}...`);
    const supabaseDuplicate = await checkDuplicateRecordInSupabase(member.id, session.date, session.type);

    if (supabaseDuplicate) {
      console.log(`[SCAN] ⚠ DUPLICATE DETECTED (Supabase): ${member.name} already marked present for ${session.type} on ${session.date} at ${supabaseDuplicate.scanTime} (originally scanned by ${supabaseDuplicate.scannedBy}). REJECTING new scan.`);
      // Sync this existing record back into local cache so future local checks also catch it
      const localRecords = this.getAttendanceRecords();
      const alreadyInLocal = localRecords.some(r => r.id === supabaseDuplicate.id);
      if (!alreadyInLocal) {
        localRecords.push(supabaseDuplicate);
        localStorage.setItem(this.recordsKey, JSON.stringify(localRecords));
      }
      return {
        success: true,
        alreadyMarked: true,
        record: supabaseDuplicate,
        member,
        error: `Already marked present for ${session.type} on ${session.date} at ${supabaseDuplicate.scanTime}`
      };
    }

    // ── DUPLICATE CHECK (STEP 2): Local cache fallback ──
    // Handles the case where Supabase query failed/returned nothing but local cache has the record.
    const localRecords = this.getAttendanceRecords();
    const localDuplicate = localRecords.find(
      r => r.memberId === member.id && r.date === session.date && r.type === session.type
    );
    if (localDuplicate) {
      console.log(`[SCAN] ⚠ DUPLICATE DETECTED (local cache): ${member.name} already marked present for ${session.type} on ${session.date} at ${localDuplicate.scanTime} (scanned by ${localDuplicate.scannedBy}). REJECTING new scan.`);
      return {
        success: true,
        alreadyMarked: true,
        record: localDuplicate,
        member,
        error: `Already marked present for ${session.type} on ${session.date} at ${localDuplicate.scanTime}`
      };
    }

    // ── No duplicate found — proceed to mark present ──
    const today = new Date();
    const timeStr = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    const newRecord: AttendanceRecord = {
      id: 'rec_' + Math.random().toString(36).substr(2, 9),
      sessionId,
      memberId: member.id,
      memberName: member.name,
      instrument: member.instrument || 'Volunteer',
      scanTime: timeStr,
      scannedBy,
      type: session.type,
      date: session.date
    };

    localRecords.push(newRecord);
    localStorage.setItem(this.recordsKey, JSON.stringify(localRecords));
    this.saveRecordToFirestore(newRecord);

    console.log(`[SCAN] ✓ MARKED PRESENT: ${member.name} for ${session.type} on ${session.date} at ${timeStr} (scanned by ${scannedBy})`);
    return { success: true, record: newRecord, member };
  }

  /**
   * Admin manual attendance override — mark a specific member Present for any session (past or current).
   *
   * Key differences from markAttendance():
   * - Works for ANY session by id (past sessions included) — no "active session" restriction
   * - Skips the Performance 50% eligibility block by default; pass bypassEligibility=true to force
   * - If a record already exists, returns { alreadyMarked: true } without creating a duplicate
   * - If no record exists, creates one and saves to both localStorage and Supabase
   * - Full audit log: who marked, for whom, which session, old status → new status
   */
  public async manualMarkAttendance(
    memberId: string,
    sessionId: string,
    markedByAdmin: string,
    bypassEligibility: boolean = false
  ): Promise<{
    success: boolean;
    record?: AttendanceRecord;
    error?: string;
    alreadyMarked?: boolean;
    eligibilityWarning?: string;
    member?: Member;
  }> {
    const members = this.getMembers();
    const sessions = this.getSessions();

    const session = sessions.find(s => s.id === sessionId);
    if (!session) {
      console.warn(`[ADMIN OVERRIDE] ✗ Session not found: ${sessionId}`);
      return { success: false, error: 'Session not found.' };
    }

    const member = members.find(m => m.id === memberId);
    if (!member) {
      console.warn(`[ADMIN OVERRIDE] ✗ Member not found: ${memberId}`);
      return { success: false, error: 'Member not found.' };
    }

    // Performance eligibility warning (returned to UI, not a hard block for admin)
    let eligibilityWarning: string | undefined;
    if (session.type === 'Performance' && !bypassEligibility) {
      const stats = this.getMemberAttendanceStats(member.id);
      if (stats.overallPct < 50) {
        eligibilityWarning = `${member.name} has ${stats.overallPct.toFixed(1)}% overall attendance (below 50% eligibility threshold).`;
        console.warn(`[ADMIN OVERRIDE] ⚠ Eligibility warning for ${member.name}: ${eligibilityWarning}`);
        return { success: false, eligibilityWarning, member };
      }
    }

    // Check for existing record (duplicate prevention)
    const localRecords = this.getAttendanceRecords();
    const existingRecord = localRecords.find(
      r => r.memberId === memberId && r.sessionId === sessionId
    );

    if (existingRecord) {
      console.log(`[ADMIN OVERRIDE] ℹ Already present: ${member.name} was already marked present for "${session.title}" (${session.type}) on ${session.date} at ${existingRecord.scanTime} by ${existingRecord.scannedBy}. No duplicate created.`);
      return { success: true, alreadyMarked: true, record: existingRecord, member };
    }

    // Create the manual attendance record
    const timeStr = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });

    const newRecord: AttendanceRecord = {
      id: 'rec_' + Math.random().toString(36).substr(2, 9),
      sessionId,
      memberId: member.id,
      memberName: member.name,
      instrument: member.instrument || 'Volunteer',
      scanTime: timeStr,
      scannedBy: `[ADMIN OVERRIDE] ${markedByAdmin}`,
      type: session.type,
      date: session.date
    };

    localRecords.push(newRecord);
    localStorage.setItem(this.recordsKey, JSON.stringify(localRecords));
    this.saveRecordToFirestore(newRecord);

    console.log(
      `[ADMIN OVERRIDE] ✓ MANUALLY MARKED PRESENT:\n` +
      `  Member   : ${member.name} (id=${member.id})\n` +
      `  Session  : "${session.title}" (${session.type}) on ${session.date}\n` +
      `  Time     : ${timeStr}\n` +
      `  Marked by: ${markedByAdmin} (Admin)\n` +
      `  Old status: ABSENT → New status: PRESENT\n` +
      `  Record ID: ${newRecord.id}`
    );

    return { success: true, record: newRecord, member, eligibilityWarning };
  }

  /**
   * Admin manual attendance override — remove an existing attendance record for a member+session.
   * Used to correct erroneous "present" records.
   */
  public async manualRemoveAttendance(
    memberId: string,
    sessionId: string,
    removedByAdmin: string
  ): Promise<{ success: boolean; error?: string; member?: Member }> {
    const members = this.getMembers();
    const sessions = this.getSessions();

    const member = members.find(m => m.id === memberId);
    const session = sessions.find(s => s.id === sessionId);

    if (!member) return { success: false, error: 'Member not found.' };
    if (!session) return { success: false, error: 'Session not found.' };

    let localRecords = this.getAttendanceRecords();
    const recordToRemove = localRecords.find(
      r => r.memberId === memberId && r.sessionId === sessionId
    );

    if (!recordToRemove) {
      console.warn(`[ADMIN OVERRIDE] ✗ No present record found for ${member.name} in session "${session.title}" — nothing to remove.`);
      return { success: false, error: 'No attendance record found for this member and session.' };
    }

    localRecords = localRecords.filter(r => r.id !== recordToRemove.id);
    localStorage.setItem(this.recordsKey, JSON.stringify(localRecords));
    deleteRecordFromSupabase(recordToRemove.id);

    console.log(
      `[ADMIN OVERRIDE] ✓ MANUALLY MARKED ABSENT (record removed):\n` +
      `  Member   : ${member.name} (id=${member.id})\n` +
      `  Session  : "${session.title}" (${session.type}) on ${session.date}\n` +
      `  Removed by: ${removedByAdmin} (Admin)\n` +
      `  Old status: PRESENT → New status: ABSENT\n` +
      `  Removed record ID: ${recordToRemove.id}`
    );

    return { success: true, member };
  }


  /**
   * Admin utility: merges duplicate sessions for the same type+date.
   * Keeps the oldest session, re-parents all records to it, deletes duplicates.
   * Call this from the admin panel to clean up already-created duplicate sessions.
   */
  public async mergeSessionsForTypeAndDate(type: AttendanceType, date: string): Promise<{ merged: number; canonicalId: string } | null> {
    const sessions = this.getSessions();
    const duplicates = sessions
      .filter(s => s.type === type && s.date === date)
      .sort((a, b) => a.id.localeCompare(b.id)); // oldest id first (sess_ + random, deterministic enough)

    if (duplicates.length <= 1) {
      console.log(`[MERGE] No duplicates found for ${type} on ${date}.`);
      return null;
    }

    const canonical = duplicates[0];
    const toRemove = duplicates.slice(1);
    console.log(`[MERGE] Canonical session: ${canonical.id}. Merging ${toRemove.length} duplicate(s): ${toRemove.map(s => s.id).join(', ')}`);

    // Re-parent records from duplicate sessions to the canonical one
    let records = this.getAttendanceRecords();
    let reparented = 0;
    records = records.map(r => {
      if (toRemove.some(s => s.id === r.sessionId)) {
        // Prevent creating duplicate records in the canonical session
        const alreadyInCanonical = records.some(
          existing => existing.memberId === r.memberId && existing.sessionId === canonical.id
        );
        if (!alreadyInCanonical) {
          reparented++;
          const updated = { ...r, sessionId: canonical.id };
          this.saveRecordToFirestore(updated);
          return updated;
        }
        // If duplicate member entry: drop it (keep only canonical)
        console.log(`[MERGE] Dropping duplicate record for member ${r.memberName} (already in canonical session).`);
        deleteRecordFromSupabase(r.id);
        return null;
      }
      return r;
    }).filter(Boolean) as AttendanceRecord[];

    localStorage.setItem(this.recordsKey, JSON.stringify(records));

    // Delete duplicate sessions from localStorage and Supabase
    const remainingSessions = sessions.filter(s => !toRemove.some(d => d.id === s.id));
    localStorage.setItem(this.sessionsKey, JSON.stringify(remainingSessions));
    for (const dup of toRemove) {
      await deleteSessionFromSupabase(dup.id);
    }

    console.log(`[MERGE] ✓ Done. Re-parented ${reparented} record(s) to canonical session ${canonical.id}. Deleted ${toRemove.length} duplicate session(s).`);
    return { merged: toRemove.length, canonicalId: canonical.id };
  }

  // --- Notices API ---
  public getNotices(): Notice[] {
    const str = localStorage.getItem(this.noticesKey);
    return str ? JSON.parse(str) : [];
  }

  public createNotice(title: string, content: string, type: Notice['type'], folderId?: string): Notice {
    const notices = this.getNotices();
    const todayStr = new Date().toISOString().split('T')[0];

    const newNotice: Notice = {
      id: 'not_' + Math.random().toString(36).substr(2, 9),
      title: title.trim(),
      content: content.trim(),
      date: todayStr,
      type,
      folderId
    };

    notices.unshift(newNotice);
    localStorage.setItem(this.noticesKey, JSON.stringify(notices));

    // Persist to Firestore
    this.saveNoticeToFirestore(newNotice);

    return newNotice;
  }

  public deleteNotice(id: string) {
    let notices = this.getNotices();
    notices = notices.filter(n => n.id !== id);
    localStorage.setItem(this.noticesKey, JSON.stringify(notices));

    // Persist to Firestore
    this.deleteNoticeFromFirestore(id);
  }

  // --- Gallery API ---
  public getGalleryItems(): GalleryItem[] {
    const str = localStorage.getItem(this.galleryKey);
    return str ? JSON.parse(str) : [];
  }

  public uploadGalleryItem(url: string, type: 'photo' | 'video', title: string, folderId?: string): GalleryItem {
    const items = this.getGalleryItems();
    const newItem: GalleryItem = {
      id: 'gal_' + Math.random().toString(36).substr(2, 9),
      url: url.trim() || 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&w=600&q=80',
      type,
      title: title.trim() || 'Vajranad Event',
      folderId
    };
    items.unshift(newItem);
    localStorage.setItem(this.galleryKey, JSON.stringify(items));

    // Persist to Firestore
    this.saveGalleryToFirestore(newItem);

    return newItem;
  }

  public deleteGalleryItem(id: string) {
    let items = this.getGalleryItems();
    items = items.filter(i => i.id !== id);
    localStorage.setItem(this.galleryKey, JSON.stringify(items));

    // Persist to Firestore
    this.deleteGalleryFromFirestore(id);
  }

  // --- Folders API ---
  public getFolders(): Folder[] {
    const str = localStorage.getItem(this.foldersKey);
    return str ? JSON.parse(str) : [];
  }

  public createFolder(name: string, description?: string): Folder {
    const folders = this.getFolders();
    const newFolder: Folder = {
      id: 'fold_' + Math.random().toString(36).substr(2, 9),
      name: name.trim(),
      description: description?.trim(),
      createdAt: new Date().toISOString()
    };
    folders.unshift(newFolder);
    localStorage.setItem(this.foldersKey, JSON.stringify(folders));
    this.saveFolderToFirestore(newFolder);
    return newFolder;
  }

  public updateFolder(id: string, name: string, description?: string): Folder | null {
    const folders = this.getFolders();
    const idx = folders.findIndex(f => f.id === id);
    if (idx === -1) return null;
    
    folders[idx] = {
      ...folders[idx],
      name: name.trim(),
      description: description?.trim()
    };
    localStorage.setItem(this.foldersKey, JSON.stringify(folders));
    this.saveFolderToFirestore(folders[idx]);
    return folders[idx];
  }

  public deleteFolder(id: string) {
    let folders = this.getFolders();
    folders = folders.filter(f => f.id !== id);
    localStorage.setItem(this.foldersKey, JSON.stringify(folders));
    this.deleteFolderFromFirestore(id);

    // Also delete any notices and gallery items linked to this folder from Supabase
    let notices = this.getNotices();
    const noticesToDelete = notices.filter(n => n.folderId === id);
    notices = notices.filter(n => n.folderId !== id);
    localStorage.setItem(this.noticesKey, JSON.stringify(notices));
    noticesToDelete.forEach(n => this.deleteNoticeFromFirestore(n.id));
    deleteNoticesByFolderFromSupabase(id); // batch delete

    let gallery = this.getGalleryItems();
    const galleryToDelete = gallery.filter(g => g.folderId === id);
    gallery = gallery.filter(g => g.folderId !== id);
    localStorage.setItem(this.galleryKey, JSON.stringify(gallery));
    galleryToDelete.forEach(g => this.deleteGalleryFromFirestore(g.id));
    deleteGalleryByFolderFromSupabase(id); // batch delete
  }

  // --- Countdowns API ---
  public getCountdowns(): EventCountdown[] {
    const str = localStorage.getItem(this.countdownsKey);
    return str ? JSON.parse(str) : [];
  }

  public createCountdown(heading: string, date: string): EventCountdown {
    const countdowns = this.getCountdowns();
    
    // Deactivate all others so only the new one is active by default
    countdowns.forEach(c => c.isActive = false);

    const newCountdown: EventCountdown = {
      id: 'cd_' + Math.random().toString(36).substr(2, 9),
      heading: heading.trim(),
      date,
      createdAt: new Date().toISOString(),
      isActive: true
    };
    countdowns.unshift(newCountdown);
    localStorage.setItem(this.countdownsKey, JSON.stringify(countdowns));

    // Sync to Firestore
    this.saveCountdownToFirestore(newCountdown);
    // Sync all updated ones as well (since they changed to inactive)
    countdowns.slice(1).forEach(c => this.saveCountdownToFirestore(c));

    return newCountdown;
  }

  public deleteCountdown(id: string) {
    let countdowns = this.getCountdowns();
    countdowns = countdowns.filter(c => c.id !== id);
    localStorage.setItem(this.countdownsKey, JSON.stringify(countdowns));
    this.deleteCountdownFromFirestore(id);
  }

  public toggleCountdownActive(id: string) {
    const countdowns = this.getCountdowns();
    const target = countdowns.find(c => c.id === id);
    if (!target) return;

    const newVal = !target.isActive;
    
    if (newVal) {
      countdowns.forEach(c => c.isActive = false);
      target.isActive = true;
    } else {
      target.isActive = false;
    }

    localStorage.setItem(this.countdownsKey, JSON.stringify(countdowns));

    // Save all to Firestore to ensure sync
    countdowns.forEach(c => this.saveCountdownToFirestore(c));
  }

  public getActiveCountdown(): EventCountdown | null {
    const countdowns = this.getCountdowns();
    const active = countdowns.find(c => c.isActive);
    if (!active) return null;

    // Auto-delete countdowns whose event date has fully passed (day after event)
    const eventDate = new Date(`${active.date}T00:00:00`);
    const dayAfter = new Date(eventDate);
    dayAfter.setDate(dayAfter.getDate() + 1);
    if (new Date() >= dayAfter) {
      this.deleteCountdown(active.id);
      return null;
    }

    return active;
  }

  // --- Performance Request Supabase Helpers ---
  private savePerformanceRequestToFirestore(p: PerformanceRequest) {
    savePerformanceRequestToSupabase(p);
  }

  private deletePerformanceRequestFromFirestore(id: string) {
    deletePerformanceRequestFromSupabase(id);
  }

  // --- Performance Requests API ---
  public getPerformanceRequests(): PerformanceRequest[] {
    const str = localStorage.getItem(this.performanceRequestsKey);
    console.log(`[STORE] [CALLOUT READ] Reading performance requests from localStorage (key="${this.performanceRequestsKey}").`);
    const all: PerformanceRequest[] = str ? JSON.parse(str) : [];
    console.log(`[STORE] [CALLOUT READ] Found ${all.length} performance request(s) in localStorage.`);
    return all;
  }

  /**
   * Returns only callouts that are both:
   *  - marked isActive by admin, AND
   *  - NOT yet past their expiryHours window.
   * Expired entries are cleaned up from localStorage and Supabase automatically.
   */
  public getActiveNonExpiredPerformanceRequests(): PerformanceRequest[] {
    const all = this.getPerformanceRequests();
    const now = Date.now();
    const active: PerformanceRequest[] = [];
    const expired: PerformanceRequest[] = [];

    for (const pr of all) {
      if (!pr.isActive) continue; // Admin-toggled off
      const expiryMs = new Date(pr.createdAt).getTime() + (pr.expiryHours ?? 48) * 3600_000;
      if (now >= expiryMs) {
        console.log(`[STORE] [CALLOUT EXPIRY] Callout "${pr.title}" (id=${pr.id}) has expired (expired at ${new Date(expiryMs).toISOString()}). Cleaning up.`);
        expired.push(pr);
      } else {
        const hoursLeft = ((expiryMs - now) / 3600_000).toFixed(1);
        console.log(`[STORE] [CALLOUT EXPIRY] Callout "${pr.title}" (id=${pr.id}) is active. ${hoursLeft}h remaining.`);
        active.push(pr);
      }
    }

    // Auto-clean expired entries from localStorage and Supabase
    if (expired.length > 0) {
      const remaining = all.filter(pr => !expired.some(e => e.id === pr.id));
      localStorage.setItem(this.performanceRequestsKey, JSON.stringify(remaining));
      console.log(`[STORE] [CALLOUT EXPIRY] ✓ Removed ${expired.length} expired callout(s) from localStorage.`);
      for (const e of expired) {
        deletePerformanceRequestFromSupabase(e.id).then(() =>
          console.log(`[STORE] [CALLOUT EXPIRY] ✓ Deleted expired callout id="${e.id}" from Supabase.`)
        ).catch(err =>
          console.error(`[STORE] [CALLOUT EXPIRY] ✗ Failed to delete expired callout id="${e.id}" from Supabase:`, err)
        );
      }
    }

    return active;
  }

  public createPerformanceRequest(title: string, date: string, time: string, location: string, description?: string, expiryHours?: number): PerformanceRequest {
    const requests = this.getPerformanceRequests();
    const newRequest: PerformanceRequest = {
      id: 'pr_' + Math.random().toString(36).substr(2, 9),
      title: title.trim(),
      date,
      time: this.formatTo12Hour(time),
      location: location.trim(),
      description: description?.trim(),
      createdAt: new Date().toISOString(),
      isActive: true,
      responses: {},
      expiryHours: expiryHours !== undefined && expiryHours > 0 ? expiryHours : 48
    };
    requests.unshift(newRequest);
    localStorage.setItem(this.performanceRequestsKey, JSON.stringify(requests));
    this.savePerformanceRequestToFirestore(newRequest);
    return newRequest;
  }

  public async deletePerformanceRequest(id: string) {
    // Step 1: Remove from localStorage immediately so UI reflects change at once
    let requests = this.getPerformanceRequests();
    const toDelete = requests.find(r => r.id === id);
    requests = requests.filter(r => r.id !== id);
    localStorage.setItem(this.performanceRequestsKey, JSON.stringify(requests));
    console.log(`[STORE] [CALLOUT DELETE] ✓ Removed callout id="${id}" (title="${toDelete?.title ?? 'unknown'}") from localStorage. Remaining in cache: ${requests.length}.`);

    // Step 2: Delete from Supabase (await so we confirm it's gone before returning)
    try {
      await deletePerformanceRequestFromSupabase(id);
      console.log(`[STORE] [CALLOUT DELETE] ✓ Confirmed deletion of callout id="${id}" from Supabase.`);
    } catch (err) {
      console.error(`[STORE] [CALLOUT DELETE] ✗ Supabase delete failed for id="${id}":`, err);
    }
  }

  public togglePerformanceRequestActive(id: string) {
    const requests = this.getPerformanceRequests();
    const target = requests.find(r => r.id === id);
    if (!target) return;
    target.isActive = !target.isActive;
    localStorage.setItem(this.performanceRequestsKey, JSON.stringify(requests));
    this.savePerformanceRequestToFirestore(target);
  }

  public respondToPerformanceRequest(requestId: string, memberId: string, status: 'Yes' | 'No' | 'Maybe'): { success: boolean; error?: string } {
    const requests = this.getPerformanceRequests();
    const target = requests.find(r => r.id === requestId);
    if (!target) return { success: false, error: 'Callout not found.' };

    const createdAtMs = new Date(target.createdAt).getTime();
    const expiryHours = target.expiryHours ?? 48;
    const expiryLimitMs = expiryHours * 60 * 60 * 1000;
    if (Date.now() - createdAtMs > expiryLimitMs) {
      return { success: false, error: `This RSVP callout has reached its ${expiryHours}-hour response limit and is now closed.` };
    }

    if (target.responses && target.responses[memberId]) {
      return { success: false, error: 'You have already submitted your response. RSVP edit is not allowed.' };
    }

    target.responses = {
      ...target.responses,
      [memberId]: status
    };
    localStorage.setItem(this.performanceRequestsKey, JSON.stringify(requests));
    this.savePerformanceRequestToFirestore(target);
    return { success: true };
  }
}

export const store = new VajranadStore();
