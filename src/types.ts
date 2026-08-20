export type Instrument = 'Dhwaja Dharak' | 'Dhol Vadak' | 'Tasha Vadak' | 'Toll Vadak' | 'Volunteer' | 'Committee Member';

export type Gender = 'Male' | 'Female';

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export type AttendanceType = 'Practice' | 'Performance';
// Note: 'Meeting' type still exists in historical Supabase records but is excluded from all new
// UI calculations and data entry. Do NOT delete historical Meeting records from the database.

export interface Member {
  id: string;
  email: string;
  name: string;
  profilePhoto?: string;
  mobileNumber?: string;
  address?: string;
  dob?: string;
  gender?: Gender;
  bloodGroup?: BloodGroup;
  motherName?: string;
  motherMobile?: string;
  fatherName?: string;
  fatherMobile?: string;
  yearJoined?: number;
  medicalIssue: boolean;
  medicalIssueDescription?: string;
  instrument?: Instrument;
  instruments?: Instrument[]; // Registered instruments
  instrumentRequest?: Instrument; // Request for instrument change
  isDetailsFilled: boolean; // Member has filled profile settings
  isActive: boolean; // Can be disabled by admin
  scannerPermission: boolean; // Permission to scan attendance
  isCommitteeMember: boolean; // Flag for committee members
  qrCode: string; // Permanent QR Code (e.g. member ID)
  password?: string; // Optional password for login
  createdAt: string;
}

export interface AttendanceSession {
  id: string;
  type: AttendanceType;
  title: string;
  date: string;
  day: string;
  isActive: boolean;
  createdBy: string;
  /** Weight multiplier for attendance percentage calculations. Default = 1.
   *  e.g. set to 2 for a session that counts double, 0.5 for half-credit.
   *  Legacy sessions without this field are treated as weight 1. */
  weight?: number;
  /** If this session is a duplicate of another, stores the original session's id. */
  duplicateOf?: string;
  /** 1-based index of this duplicate (1, 2, or 3). Unset on original sessions. */
  duplicateIndex?: number;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  memberId: string;
  memberName: string;
  instrument: Instrument;
  scanTime: string;
  scannedBy: string;
  type: AttendanceType;
  date: string;
}

export interface Notice {
  id: string;
  title: string;
  content: string;
  date: string;
  type: 'Practice Schedule' | 'Performance Details' | 'Announcement';
  folderId?: string; // Linked folder ID
}

export interface GalleryItem {
  id: string;
  url: string;
  type: 'photo' | 'video';
  title: string;
  folderId?: string; // Linked folder ID
}

export interface Folder {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface EventCountdown {
  id: string;
  heading: string;
  date: string;
  createdAt: string;
  isActive: boolean;
}

export interface PerformanceRequest {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description?: string;
  createdAt: string;
  isActive: boolean;
  responses: { [memberId: string]: 'Yes' | 'No' | 'Maybe' }; // memberId -> RSVP status
  expiryHours?: number; // custom RSVP response limit in hours
}

