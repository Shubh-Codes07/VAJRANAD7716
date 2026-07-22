import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Users, Calendar, Megaphone, Image as ImageIcon, BarChart2, ShieldAlert, Search, Edit2, CheckCircle, Trash2, Shield, Settings, Database, Upload, Download, RefreshCw, Star, UserCheck, AlertTriangle, X, Phone, MapPin, Heart, Award, Sparkles, Lock, Grid, List } from 'lucide-react';
import html2canvasSafe from '../services/html2canvasSafe';
import jsPDF from 'jspdf';
import { store, calculateAge } from '../services/store';
import { db } from '../services/firebase';
import { supabase, uploadGalleryFile, saveCloudBackupToSupabase, deleteCloudBackupFromSupabase, getAllCloudBackupsFromSupabase } from '../services/supabase';
import { collection, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { Member, AttendanceSession, AttendanceRecord, Notice, GalleryItem, Folder, Instrument, AttendanceType, EventCountdown, PerformanceRequest } from '../types';
import ReportExporter from './ReportExporter';
import AnalyticsDashboard from './AnalyticsDashboard';
import MemberProfileEdit from './MemberProfileEdit';

// Client-side image compression helper to fit within Firestore/localStorage limits
const compressImage = (base64Str: string, callback: (compressed: string) => void) => {
  const img = new Image();
  img.src = base64Str;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const MAX_WIDTH = 1000;
    const MAX_HEIGHT = 1000;
    let width = img.width;
    let height = img.height;

    if (width > height) {
      if (width > MAX_WIDTH) {
        height *= MAX_WIDTH / width;
        width = MAX_WIDTH;
      }
    } else {
      if (height > MAX_HEIGHT) {
        width *= MAX_HEIGHT / height;
        height = MAX_HEIGHT;
      }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0, width, height);
      // Compress as JPEG with 0.7 quality to get a tiny high-quality base64 string
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      callback(dataUrl);
    } else {
      callback(base64Str);
    }
  };
  img.onerror = () => {
    callback(base64Str);
  };
};

const dataURLtoBlob = (dataurl: string) => {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

interface AdminPortalProps {
  adminUser: Member;
  onLogout: () => void;
}

export default function AdminPortal({ adminUser, onLogout }: AdminPortalProps) {
  const [activeTab, setActiveTab] = useState<'members' | 'attendance' | 'folders' | 'analytics' | 'countdowns' | 'storage' | 'performances'>('members');
  
  // States
  const [members, setMembers] = useState<Member[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [countdowns, setCountdowns] = useState<EventCountdown[]>([]);
  const [countdownHeading, setCountdownHeading] = useState('');
  const [countdownDate, setCountdownDate] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);

  // Performance Count requests states
  const [performanceRequests, setPerformanceRequests] = useState<PerformanceRequest[]>([]);
  const [newPerformanceTitle, setNewPerformanceTitle] = useState('');
  const [newPerformanceDate, setNewPerformanceDate] = useState('');
  const [newPerformanceTime, setNewPerformanceTime] = useState('');
  const [newPerformanceLocation, setNewPerformanceLocation] = useState('');
  const [newPerformanceDescription, setNewPerformanceDescription] = useState('');
  const [newPerformanceExpiry, setNewPerformanceExpiry] = useState('48');
  const [selectedPerformanceRequest, setSelectedPerformanceRequest] = useState<PerformanceRequest | null>(null);
  
  // Folder fields
  const [folderName, setFolderName] = useState('');
  const [folderDescription, setFolderDescription] = useState('');
  const [isEditingFolder, setIsEditingFolder] = useState(false);
  const [editFolderName, setEditFolderName] = useState('');
  const [editFolderDescription, setEditFolderDescription] = useState('');
  
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [instrumentFilter, setInstrumentFilter] = useState('All');
  const [yearFilter, setYearFilter] = useState('All');
  const [membersLayout, setMembersLayout] = useState<'grid' | 'list'>('grid');
  const [gridCols, setGridCols] = useState<2 | 3 | 4>(2);
  
  // Active report viewing
  const [selectedReportSession, setSelectedReportSession] = useState<AttendanceSession | null>(null);
  const [viewingPracticeSessionRecords, setViewingPracticeSessionRecords] = useState<AttendanceSession | null>(null);

  // Form states
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [viewingMemberDetails, setViewingMemberDetails] = useState<Member | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [noticeType, setNoticeType] = useState<Notice['type']>('Practice Schedule');
  
  const [galleryTitle, setGalleryTitle] = useState('');
  const [galleryUrl, setGalleryUrl] = useState('');
  const [galleryType, setGalleryType] = useState<'photo' | 'video'>('photo');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Ref & Export State for PDF/Excel exports of member registries
  const allMembersDocRef = useRef<HTMLDivElement>(null);
  const currentUploadTaskRef = useRef<any>(null);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isExportingImage, setIsExportingImage] = useState(false);

  // Custom Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Load Data
  const loadData = () => {
    setMembers(store.getMembers());
    setSessions(store.getSessions());
    setRecords(store.getAttendanceRecords());
    setFolders(store.getFolders());
    setNotices(store.getNotices());
    setGallery(store.getGalleryItems());
    setCountdowns(store.getCountdowns());
    setPerformanceRequests(store.getPerformanceRequests());
  };

  const handleDownloadExcel = () => {
    const filledMembers = members.filter(m => m.isDetailsFilled);
    if (filledMembers.length === 0) {
      alert("No registered profiles with completed details found yet.");
      return;
    }

    const headers = [
      "Full Name",
      "Email",
      "Mobile Number",
      "Date of Birth",
      "Gender",
      "Blood Group",
      "Mother Name",
      "Mother Mobile",
      "Father Name",
      "Father Mobile",
      "Address",
      "Instrument",
      "Year Joined",
      "Medical Issue Description",
      "Profile Photo Link"
    ];

    const rows = filledMembers.map(m => [
      m.name,
      m.email,
      m.mobileNumber || "",
      m.dob || "",
      m.gender || "",
      m.bloodGroup || "",
      m.motherName || "",
      m.motherMobile || "",
      m.fatherName || "",
      m.fatherMobile || "",
      (m.address || "").replace(/"/g, '""').replace(/\n/g, " "), // escape quotes and newlines
      m.instrument || "Volunteer",
      m.yearJoined || "",
      (m.medicalIssueDescription || "").replace(/"/g, '""').replace(/\n/g, " "),
      m.profilePhoto ? `=HYPERLINK("${m.profilePhoto}", "Click to View Photo")` : ""
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(val => `"${val}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Vajranad_Members_Profiles_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPerformanceRSVPsExcel = (pr: PerformanceRequest) => {
    const responses = pr.responses || {};
    
    const headers = [
      "Member Name",
      "Email Address",
      "Mobile Number",
      "Instrument",
      "Year Joined",
      "RSVP Response Status"
    ];

    const rows = members
      .filter(m => m.isDetailsFilled && m.id !== 'mem_admin' && m.email !== 'admin@vajranad.com')
      .map(m => {
        const resp = responses[m.id];
        let rsvpStatus = "No Response";
        if (resp === 'Yes') {
          rsvpStatus = "Attending (Yes)";
        } else if (resp === 'No') {
          rsvpStatus = "Not Attending (No)";
        } else if (resp === 'Maybe') {
          rsvpStatus = "Maybe";
        }
        return [
          m.name,
          m.email,
          m.mobileNumber || "",
          m.instrument || "Volunteer",
          m.yearJoined || "",
          rsvpStatus
        ];
      });

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""').replace(/\n/g, " ")}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    
    const safeTitle = pr.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.setAttribute("download", `RSVP_${safeTitle}_${pr.date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPDF = async () => {
    if (!allMembersDocRef.current) return;
    setIsExportingPDF(true);
    try {
      const element = allMembersDocRef.current;
      const canvas = await html2canvasSafe(element, {
        scale: 2.0, // High quality scale
        useCORS: true,
        backgroundColor: '#FFFFFF',
        logging: false
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 295; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`Vajranad_Members_Profiles_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (e) {
      console.error("Failed to generate PDF backup report:", e);
      alert("Failed to export PDF. Please check that images are accessible and try again.");
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!allMembersDocRef.current) return;
    setIsExportingImage(true);
    try {
      const element = allMembersDocRef.current;
      const canvas = await html2canvasSafe(element, {
        scale: 2.0, // High quality scale
        useCORS: true,
        backgroundColor: '#FFFFFF',
        logging: false
      });
      const imgData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = imgData;
      link.download = `Vajranad_Members_Profiles_${new Date().toISOString().split('T')[0]}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Failed to generate Image report:", e);
      alert("Failed to export Image. Please check that images are accessible and try again.");
    } finally {
      setIsExportingImage(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered members
  const filteredMembers = members.filter((m) => {
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          m.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesInstrument = instrumentFilter === 'All' || m.instrument === instrumentFilter;
    const matchesYear = yearFilter === 'All' || String(m.yearJoined) === yearFilter;
    return matchesSearch && matchesInstrument && matchesYear;
  }).sort((a, b) => {
    const isAAdmin = a.id === 'mem_admin' || a.email.toLowerCase() === 'admin@vajranad.com';
    const isBAdmin = b.id === 'mem_admin' || b.email.toLowerCase() === 'admin@vajranad.com';
    if (isAAdmin && !isBAdmin) return 1;
    if (!isAAdmin && isBAdmin) return -1;
    return 0;
  });

  // Calculate missed counts for a member
  const getMissedCounts = (memberId: string) => {
    const practiceSessions = sessions.filter(s => s.type === 'Practice');
    const performanceSessions = sessions.filter(s => s.type === 'Performance');
    const meetingSessions = sessions.filter(s => s.type === 'Meeting');

    const practicesMissed = practiceSessions.filter(s => !records.some(r => r.memberId === memberId && r.sessionId === s.id)).length;
    const performancesMissed = performanceSessions.filter(s => !records.some(r => r.memberId === memberId && r.sessionId === s.id)).length;
    const meetingsMissed = meetingSessions.filter(s => !records.some(r => r.memberId === memberId && r.sessionId === s.id)).length;

    return {
      practices: practicesMissed,
      performances: performancesMissed,
      meetings: meetingsMissed,
      total: practicesMissed + performancesMissed + meetingsMissed
    };
  };

  // Toggle member properties
  const handleToggleScanner = (member: Member) => {
    const updated = { ...member, scannerPermission: !member.scannerPermission };
    store.updateMember(updated);
    loadData();
  };

  const handleToggleCommittee = (member: Member) => {
    const updated = { ...member, isCommitteeMember: !member.isCommitteeMember };
    store.updateMember(updated);
    loadData();
  };

  const handleToggleStatus = (member: Member) => {
    const updated = { ...member, isActive: !member.isActive };
    store.updateMember(updated);
    loadData();
  };

  const handleCreateCountdown = (e: React.FormEvent) => {
    e.preventDefault();
    if (!countdownHeading.trim() || !countdownDate) {
      alert("Please provide both event heading and date.");
      return;
    }
    store.createCountdown(countdownHeading, countdownDate);
    setCountdownHeading('');
    setCountdownDate('');
    loadData();
  };

  const handleToggleCountdown = (id: string) => {
    store.toggleCountdownActive(id);
    loadData();
  };

  const handleDeleteCountdown = (id: string) => {
    if (confirm("Are you sure you want to delete this event countdown?")) {
      store.deleteCountdown(id);
      loadData();
    }
  };

  const handleCreatePerformanceRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPerformanceTitle.trim() || !newPerformanceDate || !newPerformanceTime || !newPerformanceLocation.trim()) {
      alert("Please fill in all required fields (Title, Date, Time, Location).");
      return;
    }
    const expiryHrs = parseInt(newPerformanceExpiry, 10) || 48;
    store.createPerformanceRequest(
      newPerformanceTitle,
      newPerformanceDate,
      newPerformanceTime,
      newPerformanceLocation,
      newPerformanceDescription,
      expiryHrs
    );
    setNewPerformanceTitle('');
    setNewPerformanceDate('');
    setNewPerformanceTime('');
    setNewPerformanceLocation('');
    setNewPerformanceDescription('');
    setNewPerformanceExpiry('48');
    loadData();
    alert("✓ Performance callout request successfully created!");
  };

  const handleTogglePerformanceRequest = (id: string) => {
    store.togglePerformanceRequestActive(id);
    loadData();
  };

  const handleDeletePerformanceRequest = (id: string) => {
    if (confirm("Are you sure you want to delete this performance callout request? All responses will be lost.")) {
      store.deletePerformanceRequest(id);
      loadData();
    }
  };

  const handleResetQR = (member: Member) => {
    const newQR = 'mem_qr_' + Math.random().toString(36).substr(2, 9);
    const updated = { ...member, qrCode: newQR };
    store.updateMember(updated);
    alert(`QR Code successfully reset for ${member.name}. New QR Code ID registered: ${newQR}`);
    loadData();
  };

  const handleApproveInstrument = (member: Member) => {
    if (!member.instrumentRequest) return;
    const updated = { 
      ...member, 
      instrument: member.instrumentRequest, 
      instrumentRequest: undefined 
    };
    store.updateMember(updated);
    loadData();
  };

  const handleDeleteMember = (id: string) => {
    const memberToDelete = members.find(m => m.id === id);
    const memberName = memberToDelete ? memberToDelete.name : 'this member';
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Member Account',
      message: `CRITICAL WARNING: Are you sure you want to permanently DELETE the account of "${memberName}"? All profile details, session attendances, and credentials will be permanently erased. This action cannot be undone!`,
      onConfirm: () => {
        store.deleteMember(id);
        setConfirmDialog(null);
        loadData();
      }
    });
  };

  const handleDeleteAllMembers = () => {
    const otherMembers = members.filter(m => m.id !== adminUser.id && m.email.toLowerCase() !== adminUser.email.toLowerCase());
    if (otherMembers.length === 0) {
      alert('No other created member accounts found to delete.');
      return;
    }
    setConfirmDialog({
      isOpen: true,
      title: 'Delete All Member Accounts',
      message: `CRITICAL WARNING: Are you sure you want to permanently delete ALL ${otherMembers.length} created member accounts? This will erase their profiles, attendance records, and cannot be undone.`,
      onConfirm: () => {
        otherMembers.forEach(m => {
          store.deleteMember(m.id);
        });
        setConfirmDialog(null);
        alert('All registered member accounts have been successfully deleted.');
        loadData();
      }
    });
  };

  // Create folder
  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    const newFold = store.createFolder(folderName, folderDescription);
    setFolderName('');
    setFolderDescription('');
    alert(`Folder "${newFold.name}" created successfully!`);
    loadData();
  };

  // Update folder details
  const handleUpdateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFolder) return;
    if (!editFolderName.trim()) {
      alert('Folder name cannot be empty!');
      return;
    }
    const updated = store.updateFolder(selectedFolder.id, editFolderName, editFolderDescription);
    if (updated) {
      setSelectedFolder(updated);
      setIsEditingFolder(false);
      alert('Folder details updated successfully!');
      loadData();
    }
  };

  // Cancel media upload task
  const handleCancelUpload = () => {
    if (currentUploadTaskRef.current) {
      try {
        currentUploadTaskRef.current.cancel();
      } catch (err) {
        console.warn("Error cancelling upload task:", err);
      }
      currentUploadTaskRef.current = null;
    }
    setUploadProgress(null);
    setIsProcessingFile(false);
    setGalleryUrl('');
    // Clear file input
    const fileInput = document.getElementById('gallery-file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
    setFileError("Upload was cancelled by user.");
  };

  // Create notice
  const handleCreateNotice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noticeTitle.trim() || !noticeContent.trim()) return;
    store.createNotice(noticeTitle, noticeContent, noticeType, selectedFolder?.id);
    setNoticeTitle('');
    setNoticeContent('');
    alert('Notice uploaded inside folder successfully!');
    loadData();
  };

  // Create Gallery item
  const handleCreateGallery = (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessingFile) {
      alert('Please wait while your media file is being processed and compressed...');
      return;
    }
    if (!galleryUrl.trim()) {
      alert('Please select a file or paste a web URL before publishing!');
      return;
    }
    store.uploadGalleryItem(galleryUrl, galleryType, galleryTitle, selectedFolder?.id);
    setGalleryTitle('');
    setGalleryUrl('');
    // Clear file input from the DOM
    const fileInput = document.getElementById('gallery-file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
    setFileError(null);
    alert('Gallery media published inside folder successfully!');
    loadData();
  };

  // Database Backup
  const handleBackup = () => {
    const backupStr = store.getBackupString();
    const blob = new Blob([backupStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Vajranad_Database_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Database Restore
  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const success = store.restoreBackup(result);
      if (success) {
        alert('Database successfully restored from JSON backup! Page is refreshing records.');
        loadData();
      } else {
        alert('Failed to restore backup. Please verify that the selected file is a valid Vajranad DB JSON.');
      }
    };
    reader.readAsText(file);
  };

  const [isCloudBackingUp, setIsCloudBackingUp] = useState(false);
  const [cloudBackups, setCloudBackups] = useState<any[]>([]);

  const loadCloudBackups = async () => {
    try {
      const list = await getAllCloudBackupsFromSupabase();
      setCloudBackups(list);
    } catch (e) {
      console.warn('[CLOUD BACKUP] Failed to load cloud backups from Supabase:', e);
    }
  };

  useEffect(() => {
    if (activeTab === 'storage') {
      loadCloudBackups();
    }
  }, [activeTab]);

  const handleCloudBackup = async () => {
    setIsCloudBackingUp(true);
    try {
      const backupStr = store.getBackupString();
      const blob = new Blob([backupStr], { type: 'application/json' });
      const sizeStr = (blob.size / 1024).toFixed(1) + ' KB';
      const fileName = `Vajranad_Cloud_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const filePath = `backups/${fileName}`;

      console.log('[CLOUD BACKUP] Uploading backup to Supabase Storage:', filePath);

      const { error: uploadError } = await supabase.storage
        .from('profiles')
        .upload(filePath, blob, { upsert: true, contentType: 'application/json' });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: urlData } = supabase.storage.from('profiles').getPublicUrl(filePath);
      const downloadURL = urlData.publicUrl;

      const backupId = 'bck_' + Math.random().toString(36).substr(2, 9);
      const backupDoc = {
        id: backupId,
        name: fileName,
        url: downloadURL,
        size: sizeStr,
        createdAt: new Date().toISOString()
      };

      await saveCloudBackupToSupabase(backupDoc);

      console.log('[CLOUD BACKUP] Backup uploaded successfully:', downloadURL);
      alert('✓ Success: Secure database backup successfully uploaded and pinned to the Cloud!');
      setIsCloudBackingUp(false);
      loadCloudBackups();
    } catch (e: any) {
      console.error('[CLOUD BACKUP] Backup failed:', e);
      alert(`Cloud backup failed: ${e.message}`);
      setIsCloudBackingUp(false);
    }
  };

  const handleRestoreFromCloud = async (url: string) => {
    if (!window.confirm("WARNING: Restoring from this cloud backup will overwrite all current local and database records with this backup's state. Do you wish to proceed?")) {
      return;
    }
    
    try {
      const response = await fetch(url);
      const dataStr = await response.text();
      const success = store.restoreBackup(dataStr);
      if (success) {
        alert('✓ Database successfully restored from Cloud Backup! Page is refreshing records.');
        loadData();
      } else {
        alert('Error: The backup file is corrupted or not in the correct format.');
      }
    } catch (err: any) {
      alert(`Failed to retrieve backup file from Cloud Storage: ${err.message}`);
    }
  };

  const handleDeleteCloudBackup = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this cloud backup record?")) return;
    try {
      await deleteCloudBackupFromSupabase(id);
      alert('Backup deleted successfully from Cloud Registry.');
      loadCloudBackups();
    } catch (err: any) {
      alert(`Failed to delete backup: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFDD0] flex flex-col font-sans">
      
      {/* Top Banner Administration Dashboard Header */}
      <div className="bg-[#800000] text-[#D4AF37] px-6 py-4 flex flex-wrap items-center justify-between border-b-4 border-double border-[#D4AF37] shadow-lg">
        <div className="flex items-center gap-3">
          <Shield size={32} className="text-[#D4AF37]" />
          <div>
            <h1 className="text-2xl font-bold font-serif uppercase tracking-wider leading-none">VAJRANAD BELGAV</h1>
            <p className="text-[10px] text-yellow-100 opacity-80 uppercase tracking-widest mt-1">
              Vajranad Dhol Tasha Pathak, Belgav • Admin Portal
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold text-white/90 bg-black/20 py-1.5 px-3 rounded-lg border border-white/10 hidden sm:inline-block">
            Logged in as: <strong>{adminUser.name}</strong>
          </span>
          <button
            onClick={onLogout}
            className="bg-black/30 hover:bg-black/50 text-white hover:text-[#D4AF37] border border-[#D4AF37]/30 text-xs font-bold py-1.5 px-3 rounded-lg transition-all cursor-pointer"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Container Grid with Sidebar Navigation and Content panels */}
      <div className="flex-1 flex flex-col md:flex-row">
        
        {/* Navigation Drawer Sidebar */}
        <div className="w-full md:w-64 bg-white border-r border-neutral-200/80 p-4 space-y-1 shrink-0 flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible">
          
          <button
            onClick={() => { setActiveTab('members'); setSelectedReportSession(null); }}
            className={`w-full text-left py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer shrink-0 ${
              activeTab === 'members' ? 'bg-[#800000] text-[#D4AF37] shadow-sm' : 'text-neutral-500 hover:bg-[#FFFDD0] hover:text-neutral-800'
            }`}
          >
            <Users size={16} />
            Members List
          </button>

          <button
            onClick={() => { setActiveTab('attendance'); setSelectedReportSession(null); }}
            className={`w-full text-left py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer shrink-0 ${
              activeTab === 'attendance' ? 'bg-[#800000] text-[#D4AF37] shadow-sm' : 'text-neutral-500 hover:bg-[#FFFDD0] hover:text-neutral-800'
            }`}
          >
            <Calendar size={16} />
            Attendance Logs & Reports
          </button>

          <button
            onClick={() => { setActiveTab('folders'); setSelectedFolder(null); setSelectedReportSession(null); }}
            className={`w-full text-left py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer shrink-0 ${
              activeTab === 'folders' ? 'bg-[#800000] text-[#D4AF37] shadow-sm' : 'text-neutral-500 hover:bg-[#FFFDD0] hover:text-neutral-800'
            }`}
          >
            <Megaphone size={16} />
            Folders & Content Feed
          </button>

          <button
            onClick={() => { setActiveTab('analytics'); setSelectedReportSession(null); }}
            className={`w-full text-left py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer shrink-0 ${
              activeTab === 'analytics' ? 'bg-[#800000] text-[#D4AF37] shadow-sm' : 'text-neutral-500 hover:bg-[#FFFDD0] hover:text-neutral-800'
            }`}
          >
            <BarChart2 size={16} />
            Analytics Dashboard
          </button>

          <button
            onClick={() => { setActiveTab('countdowns'); setSelectedReportSession(null); }}
            className={`w-full text-left py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer shrink-0 ${
              activeTab === 'countdowns' ? 'bg-[#800000] text-[#D4AF37] shadow-sm' : 'text-neutral-500 hover:bg-[#FFFDD0] hover:text-neutral-800'
            }`}
          >
            <Calendar size={16} />
            Event Countdown
          </button>

          <button
            onClick={() => { setActiveTab('performances'); setSelectedReportSession(null); }}
            className={`w-full text-left py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer shrink-0 ${
              activeTab === 'performances' ? 'bg-[#800000] text-[#D4AF37] shadow-sm' : 'text-neutral-500 hover:bg-[#FFFDD0] hover:text-neutral-800'
            }`}
          >
            <Sparkles size={16} />
            Performance Callouts
          </button>

          <button
            onClick={() => { setActiveTab('storage'); setSelectedReportSession(null); }}
            className={`w-full text-left py-3 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 cursor-pointer shrink-0 ${
              activeTab === 'storage' ? 'bg-[#800000] text-[#D4AF37] shadow-sm' : 'text-neutral-500 hover:bg-[#FFFDD0] hover:text-neutral-800'
            }`}
          >
            <Database size={16} />
            Cloud Storage & Backups
          </button>
        </div>

        {/* Content Workspace */}
        <div className="flex-1 p-6 overflow-y-auto max-h-[calc(100vh-70px)]">
          
          {/* REPORT VIEW DETACHED BRIDGE */}
          {selectedReportSession ? (
            <ReportExporter
              session={selectedReportSession}
              records={records}
              onBack={() => setSelectedReportSession(null)}
            />
          ) : (
            <div>
              {/* TAB 1: MEMBERS REGISTRY CONTROL PANEL */}
              {activeTab === 'members' && (
                <div className="space-y-6">
                  {/* Search and Filters Header */}
                  <div className="bg-white border border-neutral-200 rounded-2xl p-4 flex flex-wrap items-center gap-4 justify-between shadow-sm">
                    <div className="relative flex-1 min-w-[240px]">
                      <Search size={14} className="absolute left-3.5 top-3.5 text-neutral-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by name, email, or credentials..."
                        className="w-full text-xs bg-[#FAF6EE] rounded-xl pl-10 pr-4 py-3 outline-none border border-neutral-200 focus:border-[#6e0614] text-neutral-800"
                      />
                    </div>
                    
                    {/* Instrument Filter */}
                    <select
                      value={instrumentFilter}
                      onChange={(e) => setInstrumentFilter(e.target.value)}
                      className="bg-white border border-neutral-200 rounded-xl text-xs font-semibold px-3 py-2.5 text-neutral-700 outline-none focus:border-[#6e0614]"
                    >
                      <option value="All">All Instruments</option>
                      <option value="Dhwaja Dharak">Dhwaja Dharak</option>
                      <option value="Dhol Vadak">Dhol Vadak</option>
                      <option value="Tasha Vadak">Tasha Vadak</option>
                      <option value="Toll Vadak">Toll Vadak</option>
                      <option value="Volunteer">Volunteer</option>
                      <option value="Committee Member">Committee Member</option>
                    </select>

                    {/* Joined Year Filter */}
                    <select
                      value={yearFilter}
                      onChange={(e) => setYearFilter(e.target.value)}
                      className="bg-white border border-neutral-200 rounded-xl text-xs font-semibold px-3 py-2.5 text-neutral-700 outline-none focus:border-[#6e0614]"
                    >
                      <option value="All">All Joined Years</option>
                      <option value="2020">2020</option>
                      <option value="2021">2021</option>
                      <option value="2022">2022</option>
                      <option value="2023">2023</option>
                      <option value="2024">2024</option>
                    </select>

                    {/* Layout Selector */}
                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                      <div className="flex items-center bg-[#FAF6EE] p-1 rounded-xl border border-neutral-200 gap-1">
                        <button
                          type="button"
                          onClick={() => setMembersLayout('grid')}
                          className={`p-1.5 px-2.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                            membersLayout === 'grid'
                              ? 'bg-[#800000] text-[#D4AF37] shadow-sm'
                              : 'text-neutral-500 hover:text-neutral-800'
                          }`}
                          title="Grid Layout"
                        >
                          <Grid size={13} />
                          <span className="text-[10px] font-bold hidden sm:inline">Grid</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setMembersLayout('list')}
                          className={`p-1.5 px-2.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                            membersLayout === 'list'
                              ? 'bg-[#800000] text-[#D4AF37] shadow-sm'
                              : 'text-neutral-500 hover:text-neutral-800'
                          }`}
                          title="List Layout"
                        >
                          <List size={13} />
                          <span className="text-[10px] font-bold hidden sm:inline">List</span>
                        </button>
                      </div>

                      {membersLayout === 'grid' && (
                        <div className="flex items-center bg-[#FAF6EE] p-1 rounded-xl border border-neutral-200 gap-1">
                          <span className="text-[10px] font-extrabold font-serif text-[#800000] px-1.5 uppercase tracking-wide">Cols:</span>
                          {[2, 3, 4].map((cols) => (
                            <button
                              key={cols}
                              type="button"
                              onClick={() => setGridCols(cols as 2 | 3 | 4)}
                              className={`p-1 px-2 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                                gridCols === cols
                                  ? 'bg-[#800000] text-[#D4AF37] shadow-sm'
                                  : 'text-neutral-500 hover:text-[#800000] hover:bg-[#800000]/10'
                              }`}
                            >
                              {cols}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Members Grid */}
                  <div className={
                    membersLayout === 'grid'
                      ? gridCols === 2
                        ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
                        : gridCols === 3
                          ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                          : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'
                      : 'flex flex-col gap-3'
                  }>
                    {filteredMembers.length === 0 ? (
                      <div className="col-span-full py-16 text-center italic text-neutral-400 font-medium">
                        No members found matching your search criteria.
                      </div>
                    ) : (
                      filteredMembers.map((m) => (
                        membersLayout === 'list' ? (
                          <div
                            key={m.id}
                            className={`bg-white border rounded-xl p-4 shadow-sm relative overflow-hidden flex flex-col xl:flex-row xl:items-center justify-between transition-all gap-4 ${
                              m.isActive ? 'border-neutral-200/80' : 'border-red-200 bg-red-50/20'
                            }`}
                          >
                            {/* Member Identity & Details */}
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className="flex flex-col items-center shrink-0">
                                <img
                                  src={m.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&h=100&q=80'}
                                  alt={m.name}
                                  referrerPolicy="no-referrer"
                                  className="w-11 h-11 rounded-full border border-neutral-200 object-cover shadow-sm cursor-pointer hover:scale-105 hover:border-[#800000] transition-all"
                                  onClick={() => setLightboxPhoto(m.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&h=100&q=80')}
                                  title="Click to view photograph"
                                />
                                <button
                                  type="button"
                                  onClick={() => setLightboxPhoto(m.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&h=100&q=80')}
                                  className="text-[8px] text-[#800000] hover:underline font-bold mt-0.5 cursor-pointer"
                                >
                                  View
                                </button>
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <h3 
                                    className="font-bold text-neutral-800 text-sm cursor-pointer hover:text-[#800000] hover:underline truncate"
                                    onClick={() => setViewingMemberDetails(m)}
                                    title="Click to view complete details"
                                  >
                                    {m.name}
                                  </h3>
                                  {m.isCommitteeMember && (
                                    <span className="bg-[#6e0614] text-[#D4AF37] border border-[#D4AF37]/30 text-[8px] font-bold px-1 py-0.2 rounded uppercase">
                                      COMMITTEE
                                    </span>
                                  )}
                                  {!m.isDetailsFilled && (
                                    <span className="bg-amber-100 text-amber-800 text-[8px] font-bold px-1 py-0.2 rounded uppercase">
                                      INCOMPLETE
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-neutral-400 font-medium truncate">{m.email}</p>
                                
                                <div className="flex items-center gap-2 mt-1 flex-wrap text-[10px]">
                                  <span className="bg-[#FAF6EE] text-[#6e0614] border border-[#D4AF37]/20 font-bold px-1.5 py-0.2 rounded">
                                    {m.instrument || 'Volunteer'}
                                  </span>
                                  <span className="text-neutral-400 font-bold">Joined: {m.yearJoined || 'Pending'}</span>
                                  <button
                                    type="button"
                                    onClick={() => setViewingMemberDetails(m)}
                                    className="text-[#800000] hover:text-[#52030d] font-bold underline cursor-pointer"
                                    title="View full profile"
                                  >
                                    Profile →
                                  </button>
                                </div>

                                {/* Missed Sessions Display */}
                                {m.isDetailsFilled && (
                                  <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[10px]">
                                    <span className="text-red-500 font-extrabold uppercase tracking-wide text-[9px] mr-1 flex items-center gap-0.5">
                                      <ShieldAlert size={11} /> Missed:
                                    </span>
                                    <span className="bg-red-50 text-red-700 border border-red-100 font-bold px-1.5 py-0.2 rounded">
                                      Pr: {getMissedCounts(m.id).practices}
                                    </span>
                                    <span className="bg-red-50 text-red-700 border border-red-100 font-bold px-1.5 py-0.2 rounded">
                                      Perf: {getMissedCounts(m.id).performances}
                                    </span>
                                    <span className="bg-red-50 text-red-700 border border-red-100 font-bold px-1.5 py-0.2 rounded">
                                      Mt: {getMissedCounts(m.id).meetings}
                                    </span>
                                    <span className="text-neutral-500 font-extrabold text-[9px]">
                                      (Total: {getMissedCounts(m.id).total})
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Middle Section: instrumentRequest Banner (only if requested) */}
                            {m.instrumentRequest && (
                              <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-900 font-semibold flex items-center justify-between gap-2 shrink-0 max-w-xs">
                                <span className="flex items-center gap-1 truncate">
                                  <AlertTriangle size={12} className="text-amber-600 shrink-0" />
                                  Req: <strong className="truncate">{m.instrumentRequest}</strong>
                                </span>
                                <button
                                  onClick={() => handleApproveInstrument(m)}
                                  className="bg-[#2E7D32] hover:bg-[#1B5E20] text-white text-[9px] font-bold py-0.5 px-1.5 rounded cursor-pointer transition-all shrink-0"
                                >
                                  Approve
                                </button>
                              </div>
                            )}

                            {/* Right Section: Controls & Actions */}
                            <div className="flex flex-col sm:flex-row xl:items-center gap-3 shrink-0">
                              {/* Left Controls sub-group */}
                              <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5">
                                {/* Scanner Permission Toggle */}
                                <button
                                  onClick={() => handleToggleScanner(m)}
                                  className={`py-1 px-2 rounded text-[10px] font-bold transition-all border cursor-pointer shrink-0 ${
                                    m.scannerPermission 
                                      ? 'bg-[#2E7D32] text-white border-[#2E7D32]' 
                                      : 'bg-neutral-50 text-neutral-400 border-neutral-200'
                                  }`}
                                >
                                  Scanner: {m.scannerPermission ? 'ON' : 'OFF'}
                                </button>

                                {/* Committee Toggle */}
                                <button
                                  onClick={() => handleToggleCommittee(m)}
                                  className={`py-1 px-2 rounded text-[10px] font-bold transition-all border cursor-pointer shrink-0 ${
                                    m.isCommitteeMember
                                      ? 'bg-[#6e0614] text-[#D4AF37] border-[#6e0614]'
                                      : 'bg-neutral-50 text-neutral-400 border-neutral-200'
                                  }`}
                                >
                                  Committee: {m.isCommitteeMember ? 'YES' : 'NO'}
                                </button>

                                {/* Status Active Toggle */}
                                <button
                                  onClick={() => handleToggleStatus(m)}
                                  className={`py-1 px-2 rounded text-[10px] font-bold transition-all border cursor-pointer shrink-0 ${
                                    m.isActive
                                      ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                      : 'bg-red-100 text-red-700 border-red-200'
                                  }`}
                                >
                                  {m.isActive ? 'Active' : 'Disabled'}
                                </button>

                                {/* QR Reset */}
                                <button
                                  onClick={() => handleResetQR(m)}
                                  className="py-1 px-2 rounded text-[10px] font-bold bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 text-neutral-600 transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0"
                                >
                                  <RefreshCw size={9} />
                                  QR
                                </button>
                              </div>

                              {/* Right Admin Controls sub-group */}
                              <div className="flex items-center gap-2">
                                <select
                                  value={m.instrument || 'Volunteer'}
                                  onChange={(e) => {
                                    const updated = { ...m, instrument: e.target.value as Instrument };
                                    store.updateMember(updated);
                                    loadData();
                                  }}
                                  className="text-[10px] font-bold bg-white border border-neutral-200 rounded p-1 text-neutral-600 outline-none w-32 shrink-0"
                                >
                                  <option value="Dhwaja Dharak">Dhwaja Dharak</option>
                                  <option value="Dhol Vadak">Dhol Vadak</option>
                                  <option value="Tasha Vadak">Tasha Vadak</option>
                                  <option value="Toll Vadak">Toll Vadak</option>
                                  <option value="Volunteer">Volunteer</option>
                                  <option value="Committee Member">Committee Member</option>
                                </select>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteMember(m.id)}
                                  className="flex items-center gap-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 hover:border-red-300 py-1 px-2 rounded text-[10px] font-bold transition-all cursor-pointer"
                                  title="Delete Member Account"
                                >
                                  <Trash2 size={10} />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div
                            key={m.id}
                            className={`bg-white border rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between transition-all ${
                              m.isActive ? 'border-neutral-200/80' : 'border-red-200 bg-red-50/20'
                            }`}
                          >
                            {/* Top row */}
                            <div className="flex items-start gap-4">
                              <div className="flex flex-col items-center shrink-0">
                                <img
                                  src={m.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&h=100&q=80'}
                                  alt={m.name}
                                  referrerPolicy="no-referrer"
                                  className="w-14 h-14 rounded-full border border-neutral-200 object-cover shadow-sm cursor-pointer hover:scale-105 hover:border-[#800000] transition-all"
                                  onClick={() => setLightboxPhoto(m.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&h=100&q=80')}
                                  title="Click to view photograph"
                                />
                                <button
                                  type="button"
                                  onClick={() => setLightboxPhoto(m.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&h=100&q=80')}
                                  className="text-[9px] text-[#800000] hover:underline font-bold mt-1 cursor-pointer"
                                >
                                  View Photo
                                </button>
                              </div>
                              
                              <div className="flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <h3 
                                    className="font-bold text-neutral-800 text-sm cursor-pointer hover:text-[#800000] hover:underline"
                                    onClick={() => setViewingMemberDetails(m)}
                                    title="Click to view complete details"
                                  >
                                    {m.name}
                                  </h3>
                                  {m.isCommitteeMember && (
                                    <span className="bg-[#6e0614] text-[#D4AF37] border border-[#D4AF37]/30 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">
                                      COMMITTEE
                                    </span>
                                  )}
                                  {!m.isDetailsFilled && (
                                    <span className="bg-amber-100 text-amber-800 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">
                                      INCOMPLETE
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-neutral-400 font-medium">{m.email}</p>

                                {/* Missed Sessions Display */}
                                {m.isDetailsFilled && (
                                  <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[10px] bg-red-50/50 p-2 rounded-xl border border-red-100 text-left">
                                    <span className="text-red-500 font-extrabold uppercase tracking-wide text-[9px] block w-full flex items-center gap-0.5 mb-1">
                                      <ShieldAlert size={11} /> Missed Sessions Log:
                                    </span>
                                    <span className="bg-white text-red-700 border border-red-100 font-bold px-1.5 py-0.5 rounded">
                                      Pr: {getMissedCounts(m.id).practices}
                                    </span>
                                    <span className="bg-white text-red-700 border border-red-100 font-bold px-1.5 py-0.5 rounded">
                                      Perf: {getMissedCounts(m.id).performances}
                                    </span>
                                    <span className="bg-white text-red-700 border border-red-100 font-bold px-1.5 py-0.5 rounded">
                                      Mt: {getMissedCounts(m.id).meetings}
                                    </span>
                                    <span className="text-neutral-500 font-extrabold text-[9px] block w-full mt-1 border-t border-red-100/40 pt-1">
                                      Total Missed Sessions: {getMissedCounts(m.id).total}
                                    </span>
                                  </div>
                                )}
                                
                                <div className="flex items-center justify-between gap-2 mt-2 flex-wrap w-full">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="bg-[#FAF6EE] text-[#6e0614] border border-[#D4AF37]/20 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                      {m.instrument || 'Volunteer'}
                                    </span>
                                    <span className="text-[10px] text-neutral-400 font-bold">Joined: {m.yearJoined || 'Pending'}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setViewingMemberDetails(m)}
                                    className="text-[10px] text-[#800000] hover:text-[#52030d] font-bold underline cursor-pointer"
                                    title="View full profile"
                                  >
                                    View Profile →
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Instrument Change requests alert */}
                            {m.instrumentRequest && (
                              <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-semibold flex items-center justify-between">
                                <span className="flex items-center gap-1">
                                  <AlertTriangle size={14} className="text-amber-600" />
                                  Requested: <strong>{m.instrumentRequest}</strong>
                                </span>
                                <button
                                  onClick={() => handleApproveInstrument(m)}
                                  className="bg-[#2E7D32] hover:bg-[#1B5E20] text-white text-[10px] font-bold py-1 px-2 rounded-lg cursor-pointer transition-all"
                                >
                                  Approve Change
                                </button>
                              </div>
                            )}

                            {/* Controls Grid */}
                            <div className="mt-4 pt-3 border-t border-neutral-100 grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {/* Scanner Permission Toggle */}
                              <button
                                onClick={() => handleToggleScanner(m)}
                                className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all border cursor-pointer ${
                                  m.scannerPermission 
                                    ? 'bg-[#2E7D32] text-white border-[#2E7D32]' 
                                    : 'bg-neutral-50 text-neutral-400 border-neutral-200'
                                }`}
                              >
                                Scanner: {m.scannerPermission ? 'ON' : 'OFF'}
                              </button>

                              {/* Committee Toggle */}
                              <button
                                onClick={() => handleToggleCommittee(m)}
                                className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all border cursor-pointer ${
                                  m.isCommitteeMember
                                    ? 'bg-[#6e0614] text-[#D4AF37] border-[#6e0614]'
                                    : 'bg-neutral-50 text-neutral-400 border-neutral-200'
                                }`}
                              >
                                Committee: {m.isCommitteeMember ? 'YES' : 'NO'}
                              </button>

                              {/* Status Active Toggle */}
                              <button
                                onClick={() => handleToggleStatus(m)}
                                className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all border cursor-pointer ${
                                  m.isActive
                                    ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                    : 'bg-red-100 text-red-700 border-red-200'
                                }`}
                              >
                                Status: {m.isActive ? 'Active' : 'Disabled'}
                              </button>

                              {/* QR Reset */}
                              <button
                                onClick={() => handleResetQR(m)}
                                className="py-1.5 px-2 rounded-lg text-[10px] font-bold bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 text-neutral-600 transition-all cursor-pointer flex items-center justify-center gap-1"
                              >
                                <RefreshCw size={10} />
                                Reset QR
                              </button>
                            </div>

                            {/* Direct Administrative controls row */}
                            <div className="mt-3 flex items-center justify-between gap-2">
                              {/* Direct instrument assignment */}
                              <select
                                value={m.instrument || 'Volunteer'}
                                onChange={(e) => {
                                  const updated = { ...m, instrument: e.target.value as Instrument };
                                  store.updateMember(updated);
                                  loadData();
                                }}
                                className="text-[10px] font-bold bg-white border border-neutral-200 rounded p-1 text-neutral-600 outline-none"
                              >
                                <option value="Dhwaja Dharak">Dhwaja Dharak</option>
                                <option value="Dhol Vadak">Dhol Vadak</option>
                                <option value="Tasha Vadak">Tasha Vadak</option>
                                <option value="Toll Vadak">Toll Vadak</option>
                                <option value="Volunteer">Volunteer</option>
                                <option value="Committee Member">Committee Member</option>
                              </select>

                              <button
                                type="button"
                                onClick={() => handleDeleteMember(m.id)}
                                className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 hover:border-red-300 py-1.5 px-3 rounded-lg text-[10px] font-bold transition-all cursor-pointer shadow-2xs"
                                title="Delete Member Account"
                              >
                                <Trash2 size={12} />
                                <span>Delete Account</span>
                              </button>
                            </div>
                          </div>
                        )
                      ))
                    )}
                  </div>

                  {/* Exporter Section for Member details (Excel & PDF) */}
                  <div className="mt-8 border-t border-neutral-200/80 pt-6">
                    <h4 className="font-bold text-xs text-neutral-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Download size={14} className="text-[#800000]" />
                      Member Account Registry Downloads
                    </h4>
                    <p className="text-xs text-neutral-500 mb-6 leading-relaxed font-sans">
                      Download all information filled by members and committee members during account setup (including profile photo, full name, email, parents' details, and contact numbers) formatted for spreadsheets and printing.
                    </p>

                    <div className="grid grid-cols-1 gap-4 font-sans">
                      {/* Download Excel */}
                      <div className="bg-[#FAF6EE] border border-neutral-200 rounded-xl p-4 flex flex-col justify-between gap-3 shadow-xs">
                        <div>
                          <h5 className="font-bold text-xs text-neutral-800 uppercase tracking-wide">Excel / Spreadsheet Format</h5>
                          <p className="text-[10px] text-neutral-500 mt-1 leading-normal">Complete database of all filled profile entries exported to a structured Excel-compatible .CSV spreadsheet.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleDownloadExcel}
                          className="bg-green-700 hover:bg-green-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5 self-start w-full md:w-auto"
                        >
                          <Download size={14} />
                          Download Excel (.CSV)
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: ATTENDANCE & REPORT MANAGER */}
              {activeTab === 'attendance' && (
                <div className="space-y-6">
                  <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm">
                    <h3 className="font-bold text-sm text-neutral-800 uppercase tracking-wider border-b border-neutral-100 pb-3 mb-4">
                      Attendance History & Reports
                    </h3>
                    
                    <div className="space-y-3">
                      {sessions.length === 0 ? (
                        <p className="text-xs text-neutral-400 italic text-center py-8">No attendance sessions registered.</p>
                      ) : (
                        sessions.map((s) => {
                          const count = records.filter(r => r.sessionId === s.id).length;
                          return (
                            <div
                              key={s.id}
                              className="bg-[#FAF6EE] border border-neutral-200/80 p-4 rounded-xl flex items-center justify-between gap-4 flex-wrap hover:shadow-sm transition-all"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                    s.type === 'Practice' ? 'bg-[#6e0614] text-[#D4AF37]' : s.type === 'Performance' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                                  }`}>
                                    {s.type}
                                  </span>
                                  {s.isActive && (
                                    <span className="bg-green-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                                      ACTIVE NOW
                                    </span>
                                  )}
                                </div>
                                <h4 className="font-bold text-neutral-800 text-sm mt-1.5">{s.title}</h4>
                                <p className="text-[10px] text-neutral-400 mt-0.5">{s.date} ({s.day}) • Created by: {s.createdBy}</p>
                              </div>

                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-neutral-600 bg-white border border-neutral-200/80 px-2.5 py-1.5 rounded-lg">
                                  {count} Members Present
                                </span>
                                {s.type === 'Practice' && (
                                  <button
                                    onClick={() => setViewingPracticeSessionRecords(s)}
                                    className="bg-amber-50 hover:bg-amber-100 text-[#800000] border border-[#D4AF37]/30 text-xs font-bold py-1.5 px-3 rounded-lg transition-all cursor-pointer shadow-sm flex items-center gap-1"
                                  >
                                    View
                                  </button>
                                )}
                                <button
                                  onClick={() => setSelectedReportSession(s)}
                                  className="bg-[#6e0614] hover:bg-[#52030d] text-[#D4AF37] border border-[#D4AF37]/30 text-xs font-bold py-1.5 px-3 rounded-lg transition-all cursor-pointer shadow-sm flex items-center gap-1"
                                >
                                  Generate Report
                                </button>
                                <button
                                  onClick={() => {
                                    setConfirmDialog({
                                      isOpen: true,
                                      title: 'Delete Attendance Session',
                                      message: `⚠️ CRITICAL WARNING: Are you sure you want to permanently delete the attendance session "${s.title}" on ${s.date}? This action is irreversible and will delete all associated attendance scans.`,
                                      onConfirm: () => {
                                        store.deleteSession(s.id);
                                        setConfirmDialog(null);
                                        loadData();
                                      }
                                    });
                                  }}
                                  className="text-red-600 hover:text-red-800 p-1.5 hover:bg-red-50 border border-red-200/50 rounded-lg transition-all cursor-pointer text-xs font-bold flex items-center gap-1"
                                  title="Delete Attendance Session"
                                >
                                  <Trash2 size={14} />
                                  <span>Delete Session</span>
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
                      {/* TAB 3: FOLDERS & CONTENT FEED SYSTEM */}
              {activeTab === 'folders' && (
                <div className="space-y-6">
                  {!selectedFolder ? (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      {/* Create New Folder Card */}
                      <div className="bg-white border-2 border-[#D4AF37]/30 rounded-2xl p-5 shadow-sm h-fit">
                        <h3 className="font-bold text-xs text-neutral-500 uppercase tracking-wider border-b border-neutral-100 pb-2 mb-4 flex items-center gap-1.5">
                          <Sparkles className="text-[#800000]" size={14} />
                          Create Event Folder
                        </h3>
                        <form onSubmit={handleCreateFolder} className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-neutral-400 uppercase">Folder Name</label>
                            <input
                              type="text"
                              value={folderName}
                              onChange={(e) => setFolderName(e.target.value)}
                              placeholder="Enter Folder Name"
                              required
                              className="w-full bg-[#FAF6EE] text-xs border border-neutral-200 rounded-lg px-3 py-2 outline-none text-neutral-800 font-semibold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-neutral-400 uppercase">Description / Event Details</label>
                            <textarea
                              value={folderDescription}
                              onChange={(e) => setFolderDescription(e.target.value)}
                              placeholder="Provide short details about the practice series or event celebration..."
                              rows={3}
                              className="w-full bg-[#FAF6EE] text-xs border border-neutral-200 rounded-lg px-3 py-2 outline-none text-neutral-800"
                            />
                          </div>
                          <button
                            type="submit"
                            className="w-full bg-[#6e0614] text-[#D4AF37] border border-[#D4AF37]/30 hover:bg-[#52030d] font-bold py-2 px-4 rounded-lg text-xs tracking-wider uppercase transition-all shadow-sm cursor-pointer"
                          >
                            Create Folder
                          </button>
                        </form>
                      </div>

                      {/* Folder Grid Section */}
                      <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm lg:col-span-2 space-y-4">
                        <h3 className="font-bold text-xs text-neutral-500 uppercase tracking-wider border-b border-neutral-100 pb-2">
                          Active Event Folders
                        </h3>
                        <p className="text-[11px] text-neutral-400 leading-normal">
                          Folders group together Notices, Photos, and Videos for specific events. Tap any folder to post and manage its announcements and media feed.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                          {folders.length === 0 ? (
                            <p className="col-span-full text-xs text-neutral-400 italic text-center py-8">No event folders created yet.</p>
                          ) : (
                            folders.map((f) => {
                              const folderNoticesCount = notices.filter(n => n.folderId === f.id).length;
                              const folderMediaCount = gallery.filter(g => g.folderId === f.id).length;
                              return (
                                <div
                                  key={f.id}
                                  className="border border-[#D4AF37]/20 rounded-2xl p-4 bg-[#FAF6EE]/50 hover:bg-[#FFFDD0]/30 transition-all flex flex-col justify-between space-y-3 relative group"
                                >
                                  <div>
                                    <h4 className="font-bold text-neutral-800 text-sm">{f.name}</h4>
                                    <p className="text-xs text-neutral-500 mt-1 line-clamp-2 leading-relaxed">{f.description || 'No description provided.'}</p>
                                  </div>

                                  <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
                                    <div className="flex gap-3 text-[10px] font-bold text-[#800000]">
                                      <span>📢 {folderNoticesCount} Notices</span>
                                      <span>🖼️ {folderMediaCount} Media</span>
                                    </div>
                                    <button
                                      onClick={() => setSelectedFolder(f)}
                                      className="text-[10px] font-black uppercase text-white bg-[#800000] border border-[#D4AF37]/30 py-1 px-3 rounded-lg hover:bg-[#5d0000] cursor-pointer shadow-2xs"
                                    >
                                      Manage Feed →
                                    </button>
                                  </div>

                                  <button
                                    onClick={() => {
                                      setConfirmDialog({
                                        isOpen: true,
                                        title: 'Delete Folder',
                                        message: `Are you sure you want to delete the folder "${f.name}"? This will permanently delete all ${folderNoticesCount} notices and ${folderMediaCount} media items inside it!`,
                                        onConfirm: () => {
                                          store.deleteFolder(f.id);
                                          setConfirmDialog(null);
                                          loadData();
                                        }
                                      });
                                    }}
                                    className="absolute top-2 right-2 p-1.5 text-red-500 hover:text-red-700 bg-white hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity border border-red-100 cursor-pointer shadow-2xs"
                                    title="Delete Folder"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Inside Folder View
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      {/* Breadcrumb Header */}
                      <div className="bg-[#800000] text-[#D4AF37] border-2 border-[#D4AF37] rounded-2xl p-5 shadow-sm">
                        {isEditingFolder ? (
                          <form onSubmit={handleUpdateFolder} className="w-full space-y-3">
                            <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-2 mb-1">
                              <span className="text-xs font-bold uppercase tracking-wider text-[#D4AF37] font-serif">Edit Event Folder Details</span>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setIsEditingFolder(false)}
                                  className="text-[10px] font-bold bg-neutral-800 hover:bg-neutral-700 text-white py-1 px-3 rounded-lg cursor-pointer uppercase border border-[#D4AF37]/20 transition-all"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  className="text-[10px] font-bold bg-[#D4AF37] hover:bg-[#b8942e] text-[#800000] py-1 px-3 rounded-lg cursor-pointer uppercase font-black transition-all"
                                >
                                  Save Changes
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold uppercase text-yellow-100/70 font-mono">Folder Name</label>
                                <input
                                  type="text"
                                  value={editFolderName}
                                  onChange={(e) => setEditFolderName(e.target.value)}
                                  className="w-full bg-[#FAF6EE] text-xs border-2 border-[#D4AF37]/30 rounded-lg px-3 py-1.5 outline-none text-neutral-800 font-bold focus:border-[#D4AF37]"
                                  placeholder="e.g. Annual Concert 2026"
                                  required
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold uppercase text-yellow-100/70 font-mono">Description / Subtitle</label>
                                <input
                                  type="text"
                                  value={editFolderDescription}
                                  onChange={(e) => setEditFolderDescription(e.target.value)}
                                  className="w-full bg-[#FAF6EE] text-xs border-2 border-[#D4AF37]/30 rounded-lg px-3 py-1.5 outline-none text-neutral-800 font-bold focus:border-[#D4AF37]"
                                  placeholder="Brief description of event announcements..."
                                />
                              </div>
                            </div>
                          </form>
                        ) : (
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full">
                            <div>
                              <div className="flex flex-wrap gap-2 mb-3">
                                <button
                                  onClick={() => setSelectedFolder(null)}
                                  className="text-xs font-bold bg-white/10 hover:bg-white/25 text-[#D4AF37] py-1 px-3 rounded-lg cursor-pointer transition-all uppercase tracking-wider flex items-center gap-1 border border-[#D4AF37]/30"
                                >
                                  ← Back to Folders
                                </button>
                                <button
                                  onClick={() => {
                                    setEditFolderName(selectedFolder.name);
                                    setEditFolderDescription(selectedFolder.description || '');
                                    setIsEditingFolder(true);
                                  }}
                                  className="text-xs font-bold bg-white/10 hover:bg-white/25 text-white py-1 px-3 rounded-lg cursor-pointer transition-all uppercase tracking-wider flex items-center gap-1 border border-white/20"
                                >
                                  ✏️ Edit Folder Details
                                </button>
                              </div>
                              <h2 className="text-lg font-bold font-serif leading-tight">{selectedFolder.name}</h2>
                              <p className="text-xs text-yellow-100 opacity-90 mt-1 max-w-2xl">{selectedFolder.description || 'Event folder details and published announcements.'}</p>
                            </div>
                            <div className="text-right text-[10px] font-mono font-bold text-yellow-100/70 shrink-0">
                              Folder ID: {selectedFolder.id}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Left: Content Posting Forms, Right: Content Grid */}
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        
                        {/* Column 1: Creation forms (4 cols) */}
                        <div className="lg:col-span-4 space-y-6">
                          {/* Form 1: Post Notice inside Folder */}
                          <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm">
                            <h3 className="font-bold text-xs text-neutral-500 uppercase tracking-wider border-b border-neutral-100 pb-2 mb-4 flex items-center gap-1.5">
                              <Megaphone className="text-[#800000]" size={14} />
                              Post Notice in this Folder
                            </h3>
                            <form onSubmit={handleCreateNotice} className="space-y-3">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-neutral-400 uppercase">Notice Category</label>
                                <select
                                  value={noticeType}
                                  onChange={(e) => setNoticeType(e.target.value as Notice['type'])}
                                  className="w-full bg-[#FAF6EE] text-xs border border-neutral-200 rounded-lg px-3 py-2 outline-none text-neutral-700 font-semibold"
                                >
                                  <option value="Practice Schedule">🥁 Practice Schedule</option>
                                  <option value="Performance Details">👑 Performance Details</option>
                                  <option value="Announcement">📢 Announcements / News</option>
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-neutral-400 uppercase">Notice Headline</label>
                                <input
                                  type="text"
                                  value={noticeTitle}
                                  onChange={(e) => setNoticeTitle(e.target.value)}
                                  placeholder="Notice Headline"
                                  required
                                  className="w-full bg-[#FAF6EE] text-xs border border-neutral-200 rounded-lg px-3 py-2 outline-none text-neutral-800"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-neutral-400 uppercase">Content Description</label>
                                <textarea
                                  value={noticeContent}
                                  onChange={(e) => setNoticeContent(e.target.value)}
                                  placeholder="Detail of the notification"
                                  rows={3}
                                  required
                                  className="w-full bg-[#FAF6EE] text-xs border border-neutral-200 rounded-lg px-3 py-2 outline-none text-neutral-800"
                                />
                              </div>
                              <button
                                type="submit"
                                className="w-full bg-[#6e0614] text-[#D4AF37] border border-[#D4AF37]/30 hover:bg-[#52030d] font-bold py-2 px-4 rounded-lg text-xs tracking-wider uppercase transition-all shadow-sm cursor-pointer"
                              >
                                Publish Notice
                              </button>
                            </form>
                          </div>

                          {/* Form 2: Post Gallery Item inside Folder */}
                          <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm">
                            <h3 className="font-bold text-xs text-neutral-500 uppercase tracking-wider border-b border-neutral-100 pb-2 mb-4 flex items-center gap-1.5">
                              <ImageIcon className="text-[#800000]" size={14} />
                              Publish Media in this Folder
                            </h3>
                            <form onSubmit={handleCreateGallery} className="space-y-3">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-neutral-400 uppercase">Media Type</label>
                                <div className="flex gap-4 pt-1">
                                  <label className="text-xs flex items-center gap-1.5 cursor-pointer text-neutral-700 font-bold">
                                    <input
                                      type="radio"
                                      name="media"
                                      checked={galleryType === 'photo'}
                                      onChange={() => setGalleryType('photo')}
                                      className="accent-[#6e0614]"
                                    />
                                    Photo
                                  </label>
                                  <label className="text-xs flex items-center gap-1.5 cursor-pointer text-neutral-700 font-bold">
                                    <input
                                      type="radio"
                                      name="media"
                                      checked={galleryType === 'video'}
                                      onChange={() => setGalleryType('video')}
                                      className="accent-[#6e0614]"
                                    />
                                    Video
                                  </label>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-neutral-400 uppercase">Media Caption</label>
                                <input
                                  type="text"
                                  value={galleryTitle}
                                  onChange={(e) => setGalleryTitle(e.target.value)}
                                  placeholder="Enter Media Caption"
                                  required
                                  className="w-full bg-[#FAF6EE] text-xs border border-neutral-200 rounded-lg px-3 py-2 outline-none text-neutral-800"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-neutral-400 uppercase block">Media Source</label>
                                
                                <div className="space-y-2 bg-[#FAF6EE] p-3 rounded-xl border border-neutral-200">
                                  {/* Browser File Upload option */}
                                  <div>
                                    <span className="text-[10px] text-neutral-500 font-bold block mb-1 font-mono">Select File from Browser</span>
                                    <input
                                      id="gallery-file-input"
                                      type="file"
                                      accept={galleryType === 'photo' ? "image/*" : "video/*"}
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          setFileError(null);
                                          setUploadProgress(0);
                                                  if (galleryType === 'video') {
                                            if (file.size > 11 * 1024 * 1024) {
                                              setFileError("Video files must be under 11MB to be saved. For larger videos, please upload to YouTube/Google Drive and paste the link in 'Enter Web URL' below!");
                                              e.target.value = ''; // Reset input
                                              setGalleryUrl('');
                                              setUploadProgress(null);
                                              return;
                                            }
                                            
                                            setIsProcessingFile(true);
                                            try {
                                              const url = await uploadGalleryFile(
                                                file,
                                                file.name,
                                                (pct) => setUploadProgress(pct < 100 ? pct : null)
                                              );
                                              setGalleryUrl(url);
                                              setIsProcessingFile(false);
                                              setUploadProgress(null);
                                            } catch (uploadErr: any) {
                                              console.error('[UPLOAD] Gallery video upload failed:', uploadErr);
                                              if (file.size <= 1000 * 1024) {
                                                setFileError('Cloud Storage upload failed. Saving locally in browser only.');
                                                const reader = new FileReader();
                                                reader.onloadend = () => {
                                                  setGalleryUrl(reader.result as string);
                                                  setIsProcessingFile(false);
                                                  setUploadProgress(null);
                                                };
                                                reader.readAsDataURL(file);
                                              } else {
                                                setFileError(`Secure cloud storage upload failed. Files over 1MB cannot be saved without cloud storage. Please host your video on YouTube or Google Drive and paste the link below. Error: ${uploadErr.message}`);
                                                setIsProcessingFile(false);
                                                setUploadProgress(null);
                                                e.target.value = '';
                                              }
                                            }
                                          } else {
                                            // Photo - compress first, then upload to Supabase
                                            setIsProcessingFile(true);
                                            const reader = new FileReader();
                                            reader.onloadend = () => {
                                              compressImage(reader.result as string, async (compressed) => {
                                                try {
                                                  const blob = dataURLtoBlob(compressed);
                                                  const url = await uploadGalleryFile(
                                                    blob,
                                                    `${file.name}.jpg`,
                                                    (pct) => setUploadProgress(pct < 100 ? pct : null)
                                                  );
                                                  setGalleryUrl(url);
                                                  setIsProcessingFile(false);
                                                  setUploadProgress(null);
                                                } catch (blobErr: any) {
                                                  console.warn('[UPLOAD] Supabase photo upload failed, using Base64 fallback:', blobErr.message);
                                                  // Fall back to direct base64 since compressed photos are small (~50KB)
                                                  setGalleryUrl(compressed);
                                                  setIsProcessingFile(false);
                                                  setUploadProgress(null);
                                                }
                                              });
                                            };
                                            reader.readAsDataURL(file);
                                          }
                                        }
                                      }}
                                      className="text-xs text-neutral-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-[#800000] file:text-[#D4AF37] file:cursor-pointer hover:file:bg-[#5a0000] cursor-pointer w-full"
                                    />
                                    
                                    {isProcessingFile && uploadProgress === null && (
                                      <div className="text-[10px] text-[#6e0614] font-black mt-1.5 flex items-center justify-between gap-1">
                                        <div className="flex items-center gap-1 animate-pulse">
                                          <RefreshCw size={10} className="animate-spin" />
                                          <span>Processing and optimizing media file, please wait...</span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={handleCancelUpload}
                                          className="text-[9px] font-bold bg-neutral-100 hover:bg-neutral-200 text-[#6e0614] py-0.5 px-2 rounded-md cursor-pointer transition-all border border-neutral-300"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    )}
 
                                    {uploadProgress !== null && (
                                      <div className="mt-2 space-y-1.5">
                                        <div className="flex justify-between text-[10px] font-bold text-[#6e0614] mb-1">
                                          <span>Uploading to secure cloud storage...</span>
                                          <span>{uploadProgress}%</span>
                                        </div>
                                        <div className="w-full bg-neutral-200 h-1.5 rounded-full overflow-hidden">
                                          <div 
                                            className="bg-[#6e0614] h-full rounded-full transition-all duration-300" 
                                            style={{ width: `${uploadProgress}%` }}
                                          ></div>
                                        </div>
                                        <div className="flex justify-end">
                                          <button
                                            type="button"
                                            onClick={handleCancelUpload}
                                            className="text-[9px] font-bold bg-neutral-100 hover:bg-neutral-200 text-[#6e0614] border border-[#6e0614]/20 py-1 px-2.5 rounded-md cursor-pointer transition-all uppercase tracking-wide"
                                          >
                                            ✕ Cancel Upload
                                          </button>
                                        </div>
                                      </div>
                                    )}

                                    {fileError && (
                                      <div className="text-[10px] text-red-600 bg-red-50 p-2 rounded-lg border border-red-200 mt-1.5 font-bold leading-normal">
                                        ⚠️ {fileError}
                                      </div>
                                    )}

                                    {galleryUrl && !isProcessingFile && (
                                      <div className="text-[9px] text-emerald-600 font-bold mt-1">
                                        ✓ File loaded and uploaded successfully!
                                      </div>
                                    )}
                                  </div>

                                  <div className="relative flex py-1 items-center">
                                    <div className="flex-grow border-t border-neutral-200"></div>
                                    <span className="flex-shrink mx-2 text-[8px] text-neutral-400 font-bold uppercase">OR</span>
                                    <div className="flex-grow border-t border-neutral-200"></div>
                                  </div>

                                  {/* Direct URL Paste option */}
                                  <div>
                                    <span className="text-[10px] text-neutral-500 font-bold block mb-1 font-mono">Enter Web URL</span>
                                    <input
                                      type="text"
                                      value={galleryUrl.startsWith('data:') ? '' : galleryUrl}
                                      onChange={(e) => {
                                        setFileError(null);
                                        setGalleryUrl(e.target.value);
                                        // Reset file input if they chose a web URL instead
                                        const fileInput = document.getElementById('gallery-file-input') as HTMLInputElement;
                                        if (fileInput) fileInput.value = '';
                                      }}
                                      placeholder={galleryType === 'photo' ? "Paste Photo Link (e.g., https://...)" : "Paste Video Link (e.g., https://...)"}
                                      className="w-full bg-white text-xs border border-neutral-200 rounded-lg px-3 py-2 outline-none text-neutral-800"
                                    />
                                  </div>
                                </div>
                              </div>
                              <button
                                type="submit"
                                className="w-full bg-[#6e0614] text-[#D4AF37] border border-[#D4AF37]/30 hover:bg-[#52030d] font-bold py-2 px-4 rounded-lg text-xs tracking-wider uppercase transition-all shadow-sm cursor-pointer"
                              >
                                Publish Media
                              </button>
                            </form>
                          </div>
                        </div>

                        {/* Column 2: Published content grids (8 cols) */}
                        <div className="lg:col-span-8 space-y-6">
                          
                          {/* Section A: Published Notices inside this folder */}
                          <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm space-y-4">
                            <h3 className="font-bold text-xs text-neutral-500 uppercase tracking-wider border-b border-neutral-100 pb-2 flex items-center gap-1">
                              <span>📢 Notices in this Folder</span>
                            </h3>
                            <div className="space-y-3">
                              {notices.filter(n => n.folderId === selectedFolder.id).length === 0 ? (
                                <p className="text-xs text-neutral-400 italic py-6 text-center">No notices inside this folder yet.</p>
                              ) : (
                                notices.filter(n => n.folderId === selectedFolder.id).map((n) => (
                                  <div
                                    key={n.id}
                                    className="p-4 rounded-xl border border-neutral-200 bg-[#FAF6EE]/80 flex items-start justify-between gap-4"
                                  >
                                    <div className="space-y-1">
                                      <span className="bg-[#6e0614] text-[#D4AF37] text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                                        {n.type}
                                      </span>
                                      <h4 className="font-bold text-neutral-800 text-sm mt-1">{n.title}</h4>
                                      <p className="text-xs text-neutral-600 leading-relaxed whitespace-pre-wrap">{n.content}</p>
                                      <p className="text-[9px] text-neutral-400 pt-1 font-mono">Published Date: {n.date}</p>
                                    </div>
                                    <button
                                      onClick={() => {
                                        setConfirmDialog({
                                          isOpen: true,
                                          title: 'Delete Notice/Post',
                                          message: 'Are you sure you want to delete this notice/post?',
                                          onConfirm: () => {
                                            store.deleteNotice(n.id);
                                            setConfirmDialog(null);
                                            loadData();
                                          }
                                        });
                                      }}
                                      className="text-red-600 hover:text-red-800 p-1.5 hover:bg-red-50 border border-red-200/50 rounded-xl transition-all shrink-0 cursor-pointer text-[10px] font-bold flex items-center gap-1.5"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          {/* Section B: Published Photos/Videos inside this folder */}
                          <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm space-y-4">
                            <h3 className="font-bold text-xs text-neutral-500 uppercase tracking-wider border-b border-neutral-100 pb-2">
                              🖼️ Photos & Videos inside Folder
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                              {gallery.filter(g => g.folderId === selectedFolder.id).length === 0 ? (
                                <p className="col-span-full text-xs text-neutral-400 italic py-6 text-center">No media files uploaded inside this folder.</p>
                              ) : (
                                gallery.filter(g => g.folderId === selectedFolder.id).map((g) => (
                                  <div
                                    key={g.id}
                                    className="bg-[#FAF6EE] rounded-xl border border-neutral-200 overflow-hidden relative group"
                                  >
                                    {g.type === 'video' ? (
                                      <video
                                        src={g.url}
                                        controls
                                        className="w-full h-28 object-cover group-hover:scale-105 transition-all"
                                      />
                                    ) : (
                                      <img
                                        src={g.url}
                                        alt={g.title}
                                        referrerPolicy="no-referrer"
                                        className="w-full h-28 object-cover group-hover:scale-105 transition-all cursor-pointer"
                                        onClick={() => setLightboxPhoto(g.url)}
                                        title="Click to view photograph"
                                      />
                                    )}
                                    <div className="p-2">
                                      <h5 className="font-bold text-[11px] text-neutral-800 truncate">{g.title}</h5>
                                      <p className="text-[8px] font-black text-[#6e0614] uppercase tracking-wider mt-0.5">{g.type}</p>
                                    </div>
                                    <button
                                      onClick={() => {
                                        setConfirmDialog({
                                          isOpen: true,
                                          title: 'Delete Gallery Post',
                                          message: 'Are you sure you want to delete this gallery post?',
                                          onConfirm: () => {
                                            store.deleteGalleryItem(g.id);
                                            setConfirmDialog(null);
                                            loadData();
                                          }
                                        });
                                      }}
                                      className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-lg shadow-md transition-all cursor-pointer z-10 flex items-center justify-center animate-in fade-in zoom-in duration-100"
                                      title="Delete Item"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                        </div>

                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: ANALYTICS STUDIOS */}
              {activeTab === 'analytics' && (
                <AnalyticsDashboard
                  members={members}
                  sessions={sessions}
                  records={records}
                />
              )}

              {/* TAB 6: EVENT COUNTDOWNS */}
              {activeTab === 'countdowns' && (
                <div className="space-y-6">
                  {/* Top Header Card */}
                  <div className="bg-white border border-[#D4AF37]/20 p-6 rounded-2xl shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-[#800000]/5 rounded-full blur-xl" />
                    <h3 className="font-serif font-black text-[#800000] text-base flex items-center gap-1.5">
                      <Sparkles size={16} className="text-[#D4AF37] fill-[#D4AF37]/20" />
                      Event Countdown Control
                    </h3>
                    <p className="text-xs text-neutral-500 leading-relaxed mt-1">
                      Create and post upcoming events with countdown timers. Only one countdown is displayed on the member portal home screen at a time. Activating one will automatically deactivate all other countdown timers.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Column 1: Post New Countdown Form */}
                    <div className="lg:col-span-1 bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm space-y-4 h-fit">
                      <h4 className="font-serif font-bold text-[#800000] text-sm border-b border-neutral-100 pb-2">
                        Post Event Countdown
                      </h4>
                      <form onSubmit={handleCreateCountdown} className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                            Event Heading / Title
                          </label>
                          <input
                            type="text"
                            value={countdownHeading}
                            onChange={(e) => setCountdownHeading(e.target.value)}
                            placeholder="e.g. Shiv Jayanti Miravnuk 2026 🚩"
                            className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-[#800000] focus:border-[#800000] outline-none"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                            Target Event Date
                          </label>
                          <input
                            type="date"
                            value={countdownDate}
                            onChange={(e) => setCountdownDate(e.target.value)}
                            className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-[#800000] focus:border-[#800000] outline-none"
                            required
                          />
                        </div>

                        <button
                          type="submit"
                          className="w-full bg-[#800000] hover:bg-[#5d0000] text-[#D4AF37] border border-[#D4AF37]/30 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all"
                        >
                          Post Countdown
                        </button>
                      </form>
                    </div>

                    {/* Column 2: Countdown Timers List */}
                    <div className="lg:col-span-2 bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm space-y-4">
                      <h4 className="font-serif font-bold text-[#800000] text-sm border-b border-neutral-100 pb-2">
                        Posted Countdowns
                      </h4>

                      {countdowns.length === 0 ? (
                        <p className="text-xs text-neutral-400 italic text-center py-8">
                          No event countdowns have been posted yet.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {countdowns.map((c) => (
                            <div
                              key={c.id}
                              className="border border-neutral-100 p-4 rounded-xl flex items-center justify-between gap-4 hover:bg-neutral-50 transition-all"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <h5 className="font-bold text-neutral-800 text-xs">
                                    {c.heading}
                                  </h5>
                                  {c.isActive && (
                                    <span className="bg-green-100 text-green-800 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase">
                                      Active
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-neutral-400">
                                  Target Date: <strong className="text-neutral-600">{c.date}</strong>
                                </p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => handleToggleCountdown(c.id)}
                                  className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                                    c.isActive
                                      ? 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200'
                                      : 'bg-[#FFFDD0] text-[#800000] border-[#D4AF37]/30 hover:bg-[#800000] hover:text-white'
                                  }`}
                                >
                                  {c.isActive ? 'Deactivate' : 'Activate'}
                                </button>

                                <button
                                  onClick={() => handleDeleteCountdown(c.id)}
                                  className="p-1.5 hover:bg-red-50 hover:text-red-700 text-neutral-400 rounded-lg border border-transparent hover:border-red-100 transition-all cursor-pointer"
                                  title="Delete Countdown"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: PERFORMANCE COUNT CALLOUTS */}
              {activeTab === 'performances' && (
                <div className="space-y-6">
                  {/* Top Header Card */}
                  <div className="bg-white border border-[#D4AF37]/20 p-6 rounded-2xl shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-[#800000]/5 rounded-full blur-xl" />
                    <h3 className="font-serif font-black text-[#800000] text-base flex items-center gap-1.5">
                      <Sparkles size={18} className="text-[#D4AF37]" />
                      Performance Callouts & Availability Tracker
                    </h3>
                    <p className="text-xs text-neutral-500 leading-relaxed mt-1">
                      Create callouts to ask members if they can attend an upcoming performance on a particular date, time, and location. Track dynamic counts for Dhol Vadak, Tasha Vadak, Toll Vadak, Dhwaja Dharak, and others (categorized by experienced and new members) to plan your line-up perfectly.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Create Form - 4 Cols */}
                    <div className="lg:col-span-4 bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm space-y-4 h-fit">
                      <h4 className="font-serif font-bold text-neutral-800 text-sm border-b border-neutral-100 pb-3 flex items-center gap-1.5">
                        📢 Create Callout
                      </h4>
                      <form onSubmit={handleCreatePerformanceRequest} className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-neutral-500 uppercase">Performance Title *</label>
                          <input
                            type="text"
                            placeholder="e.g., Shiv Jayanti Miravnuk BGM"
                            value={newPerformanceTitle}
                            onChange={(e) => setNewPerformanceTitle(e.target.value)}
                            className="w-full text-xs p-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-[#800000]"
                            required
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-neutral-500 uppercase">Date *</label>
                            <input
                              type="date"
                              value={newPerformanceDate}
                              onChange={(e) => setNewPerformanceDate(e.target.value)}
                              className="w-full text-xs p-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-[#800000]"
                              required
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-neutral-500 uppercase">Time *</label>
                            <input
                              type="time"
                              value={newPerformanceTime}
                              onChange={(e) => setNewPerformanceTime(e.target.value)}
                              className="w-full text-xs p-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-[#800000]"
                              required
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-neutral-500 uppercase">Location *</label>
                          <input
                            type="text"
                            placeholder="e.g., Shivaji Maharaj Circle, Belagavi"
                            value={newPerformanceLocation}
                            onChange={(e) => setNewPerformanceLocation(e.target.value)}
                            className="w-full text-xs p-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-[#800000]"
                            required
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-neutral-500 uppercase">Description / Special Instructions</label>
                          <textarea
                            placeholder="e.g., Compulsory traditional dress. Orange Pheta & white kurta pyjama. Reach 30 mins before."
                            value={newPerformanceDescription}
                            onChange={(e) => setNewPerformanceDescription(e.target.value)}
                            rows={3}
                            className="w-full text-xs p-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-[#800000]"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-neutral-500 uppercase">RSVP Expiry Limit (Hours) *</label>
                          <input
                            type="number"
                            min="1"
                            max="720"
                            placeholder="48"
                            value={newPerformanceExpiry}
                            onChange={(e) => setNewPerformanceExpiry(e.target.value)}
                            className="w-full text-xs p-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-1 focus:ring-[#800000]"
                            required
                          />
                          <p className="text-[9px] text-neutral-400 italic">Number of hours members have to RSVP before it locks.</p>
                        </div>

                        <button
                          type="submit"
                          className="w-full bg-[#800000] hover:bg-[#5d0000] text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wide transition-all shadow-md active:scale-95 cursor-pointer border-none"
                        >
                          Ask Member Count
                        </button>
                      </form>
                    </div>

                    {/* Performance Callouts List & Counts - 8 Cols */}
                    <div className="lg:col-span-8 space-y-4">
                      <h4 className="font-serif font-bold text-neutral-800 text-sm flex items-center gap-1.5">
                        📋 Performance Requests & RSVP Stats
                      </h4>

                      {performanceRequests.length === 0 ? (
                        <div className="bg-white border border-neutral-200 rounded-2xl p-8 text-center text-neutral-400 space-y-2">
                          <Sparkles size={28} className="mx-auto text-neutral-300" />
                          <p className="text-xs font-semibold">No Performance Callouts Published Yet</p>
                          <p className="text-[10px] text-neutral-400">Create a request using the form on the left to ask members for their availability.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {performanceRequests.map((pr) => {
                            // Calculate availability tallies for this specific request
                            const currentYear = new Date().getFullYear();
                            const responses = pr.responses || {};

                            let dholOld = 0, dholNew = 0;
                            let tashaOld = 0, tashaNew = 0;
                            let tollOld = 0, tollNew = 0;
                            let dhwajaOld = 0, dhwajaNew = 0;
                            let otherOld = 0, otherNew = 0;

                            const yesMembers: Member[] = [];
                            const maybeMembers: Member[] = [];
                            const noMembers: Member[] = [];
                            const pendingMembers: Member[] = [];

                            members.forEach(m => {
                              if (m.id === 'mem_admin' || m.email === 'admin@vajranad.com') return;
                              const resp = responses[m.id];
                              const isNew = m.yearJoined ? m.yearJoined >= currentYear : true;

                              if (resp === 'Yes') {
                                yesMembers.push(m);
                                const inst = m.instrument;
                                if (inst === 'Dhol Vadak') {
                                  if (isNew) dholNew++; else dholOld++;
                                } else if (inst === 'Tasha Vadak') {
                                  if (isNew) tashaNew++; else tashaOld++;
                                } else if (inst === 'Toll Vadak') {
                                  if (isNew) tollNew++; else tollOld++;
                                } else if (inst === 'Dhwaja Dharak') {
                                  if (isNew) dhwajaNew++; else dhwajaOld++;
                                } else {
                                  if (isNew) otherNew++; else otherOld++;
                                }
                              } else if (resp === 'Maybe') {
                                maybeMembers.push(m);
                              } else if (resp === 'No') {
                                noMembers.push(m);
                              } else if (m.isActive && m.isDetailsFilled) {
                                pendingMembers.push(m);
                              }
                            });

                            const expiryHours = pr.expiryHours ?? 48;
                            const isExpired = Date.now() - new Date(pr.createdAt).getTime() > expiryHours * 60 * 60 * 1000;

                            return (
                              <div key={pr.id} className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm space-y-4 relative overflow-hidden">
                                {/* Border Left Accent */}
                                <div className={`absolute top-0 bottom-0 left-0 w-1.5 ${pr.isActive ? (isExpired ? 'bg-amber-500' : 'bg-[#800000]') : 'bg-neutral-300'}`} />

                                {/* Header details */}
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-neutral-100 pb-3 ml-2">
                                  <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h5 className="font-serif font-black text-neutral-800 text-sm uppercase tracking-wide">
                                        {pr.title}
                                      </h5>
                                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                        pr.isActive ? (isExpired ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800') : 'bg-neutral-100 text-neutral-600'
                                      }`}>
                                        {pr.isActive ? (isExpired ? 'Active (Expired/Locked)' : 'Active') : 'Closed'}
                                      </span>
                                      {pr.isActive && !isExpired && (
                                        <span className="text-[9px] font-extrabold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                          ⏰ RSVP Open ({expiryHours}h Limit)
                                        </span>
                                      )}
                                      {pr.isActive && isExpired && (
                                        <span className="text-[9px] font-extrabold bg-red-50 text-red-700 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                          🔒 Locked (Passed {expiryHours}h)
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-neutral-500 font-semibold flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                                      <span>📅 Date: <strong className="text-neutral-700">{pr.date}</strong></span>
                                      <span>⏰ Time: <strong className="text-neutral-700">{store.formatTo12Hour(pr.time)}</strong></span>
                                      <span>📍 Location: <strong className="text-[#800000]">{pr.location}</strong></span>
                                    </p>
                                    {pr.description && (
                                      <p className="text-[10px] text-neutral-400 leading-relaxed max-w-xl pt-1">
                                        📝 {pr.description}
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleTogglePerformanceRequest(pr.id)}
                                      className={`text-[9px] font-extrabold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                                        pr.isActive
                                          ? 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                                          : 'bg-[#FFFDD0] text-[#800000] border-[#D4AF37]/30 hover:bg-[#800000] hover:text-white'
                                      }`}
                                    >
                                      {pr.isActive ? 'Close Callout' : 'Reopen'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeletePerformanceRequest(pr.id)}
                                      className="p-1.5 text-neutral-400 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-lg transition-all cursor-pointer"
                                      title="Delete Callout"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>

                                {/* RSVP Count Summary Badges */}
                                <div className="grid grid-cols-3 gap-2 text-center ml-2">
                                  <div className="bg-green-50/50 border border-green-100 rounded-xl p-2">
                                    <p className="text-[9px] text-green-600 font-bold uppercase tracking-wider">Attending (Yes)</p>
                                    <p className="font-serif font-black text-green-800 text-lg leading-none mt-1">{yesMembers.length}</p>
                                  </div>
                                  <div className="bg-red-50/50 border border-red-100 rounded-xl p-2">
                                    <p className="text-[9px] text-red-600 font-bold uppercase tracking-wider">Decline (No)</p>
                                    <p className="font-serif font-black text-red-800 text-lg leading-none mt-1">{noMembers.length}</p>
                                  </div>
                                  <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-2">
                                    <p className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider">No Response</p>
                                    <p className="font-serif font-black text-neutral-700 text-lg leading-none mt-1">{pendingMembers.length}</p>
                                  </div>
                                </div>

                                {/* Instrument Breakdown Table - As requested */}
                                <div className="ml-2 overflow-x-auto">
                                  <table className="w-full text-left text-[11px] border border-neutral-100 rounded-xl overflow-hidden">
                                    <thead>
                                      <tr className="bg-neutral-50 text-neutral-500 font-bold uppercase text-[9px] border-b border-neutral-100">
                                        <th className="py-2.5 px-3">Instrument</th>
                                        <th className="py-2.5 px-3 text-center">Experienced (Old)</th>
                                        <th className="py-2.5 px-3 text-center">New Members</th>
                                        <th className="py-2.5 px-3 text-center bg-[#800000]/5 text-[#800000] font-black">Total to Come</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100 font-medium text-neutral-700">
                                      <tr>
                                        <td className="py-2 px-3 font-bold flex items-center gap-1.5">
                                          <span className="w-2.5 h-2.5 rounded-full bg-[#800000]" /> Dhol Vadak
                                        </td>
                                        <td className="py-2 px-3 text-center text-neutral-500">{dholOld}</td>
                                        <td className="py-2 px-3 text-center text-[#D4AF37] font-bold">{dholNew}</td>
                                        <td className="py-2 px-3 text-center bg-[#800000]/5 text-neutral-900 font-black">{dholOld + dholNew}</td>
                                      </tr>
                                      <tr>
                                        <td className="py-2 px-3 font-bold flex items-center gap-1.5">
                                          <span className="w-2.5 h-2.5 rounded-full bg-[#D4AF37]" /> Tasha Vadak
                                        </td>
                                        <td className="py-2 px-3 text-center text-neutral-500">{tashaOld}</td>
                                        <td className="py-2 px-3 text-center text-[#D4AF37] font-bold">{tashaNew}</td>
                                        <td className="py-2 px-3 text-center bg-[#800000]/5 text-neutral-900 font-black">{tashaOld + tashaNew}</td>
                                      </tr>
                                      <tr>
                                        <td className="py-2 px-3 font-bold flex items-center gap-1.5">
                                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Toll Vadak
                                        </td>
                                        <td className="py-2 px-3 text-center text-neutral-500">{tollOld}</td>
                                        <td className="py-2 px-3 text-center text-[#D4AF37] font-bold">{tollNew}</td>
                                        <td className="py-2 px-3 text-center bg-[#800000]/5 text-neutral-900 font-black">{tollOld + tollNew}</td>
                                      </tr>
                                      <tr>
                                        <td className="py-2 px-3 font-bold flex items-center gap-1.5">
                                          <span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Dhwaja Dharak
                                        </td>
                                        <td className="py-2 px-3 text-center text-neutral-500">{dhwajaOld}</td>
                                        <td className="py-2 px-3 text-center text-[#D4AF37] font-bold">{dhwajaNew}</td>
                                        <td className="py-2 px-3 text-center bg-[#800000]/5 text-neutral-900 font-black">{dhwajaOld + dhwajaNew}</td>
                                      </tr>
                                      <tr className="bg-neutral-50/30">
                                        <td className="py-2 px-3 font-bold flex items-center gap-1.5 text-neutral-500">
                                          <span className="w-2.5 h-2.5 rounded-full bg-neutral-400" /> Others / Volunteers
                                        </td>
                                        <td className="py-2 px-3 text-center text-neutral-500">{otherOld}</td>
                                        <td className="py-2 px-3 text-center text-[#D4AF37] font-bold">{otherNew}</td>
                                        <td className="py-2 px-3 text-center bg-[#800000]/5 text-neutral-900 font-black">{otherOld + otherNew}</td>
                                      </tr>
                                      {/* Grand Total Row */}
                                      <tr className="bg-[#800000]/5 font-extrabold text-neutral-900 text-xs">
                                        <td className="py-2.5 px-3 uppercase tracking-wider font-black">Grand Total Attending</td>
                                        <td className="py-2.5 px-3 text-center text-[#800000]">{dholOld + tashaOld + tollOld + dhwajaOld + otherOld}</td>
                                        <td className="py-2.5 px-3 text-center text-[#D4AF37]">{dholNew + tashaNew + tollNew + dhwajaNew + otherNew}</td>
                                        <td className="py-2.5 px-3 text-center bg-[#800000]/10 text-[#800000] font-black text-sm">
                                          {yesMembers.length}
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>

                                {/* Detailed RSVP List Button */}
                                <div className="flex flex-wrap gap-2 justify-end ml-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadPerformanceRSVPsExcel(pr)}
                                    className="text-[10px] font-black bg-green-700 text-white px-4 py-2.5 rounded-xl uppercase tracking-wide border border-green-600 hover:bg-green-800 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                                  >
                                    📥 Download RSVP List (Excel)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedPerformanceRequest(pr)}
                                    className="text-[10px] font-black bg-[#800000] text-[#D4AF37] px-4 py-2.5 rounded-xl uppercase tracking-wide border border-[#D4AF37]/20 hover:bg-[#5d0000] transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                                  >
                                    🔍 View Detailed RSVP Members List
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 7: CLOUD STORAGE & BACKUPS */}
              {activeTab === 'storage' && (
                <div className="space-y-6">
                  {/* Top Header Card */}
                  <div className="bg-white border border-[#D4AF37]/20 p-6 rounded-2xl shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-[#800000]/5 rounded-full blur-xl" />
                    <h3 className="font-serif font-black text-[#800000] text-base flex items-center gap-1.5">
                      <Database size={18} className="text-[#D4AF37]" />
                      Cloud Backups & Storage Engine
                    </h3>
                    <p className="text-xs text-neutral-500 leading-relaxed mt-1">
                      Manage database backups and monitor cloud storage integration. By connecting your application to the secure Firebase Cloud, all large files and digital profiles are securely backed up with unlimited scaling, freeing you from browser-based storage quotas.
                    </p>
                  </div>

                  {/* Storage Quota & Capacity Overview Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Local Browser Storage Progress */}
                    <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm space-y-4">
                      <div className="flex justify-between items-center border-b border-neutral-100 pb-3">
                        <h4 className="font-serif font-bold text-neutral-800 text-sm flex items-center gap-1.5">
                          🖥️ Browser LocalStorage
                        </h4>
                        <span className="text-[10px] bg-amber-100 text-[#800000] px-2 py-0.5 rounded-md font-extrabold font-mono uppercase tracking-wide">
                          Strict 5MB Limit
                        </span>
                      </div>

                      <div className="space-y-3">
                        {/* Calculate Sizes */}
                        {(() => {
                          let totalSize = 0;
                          for (const key in localStorage) {
                            if (localStorage.hasOwnProperty(key)) {
                              totalSize += (localStorage[key].length + key.length) * 2; // UTF-16 characters = 2 bytes
                            }
                          }
                          const sizeMB = totalSize / (1024 * 1024);
                          const percentage = Math.min((sizeMB / 5.0) * 100, 100);
                          const remainingMB = Math.max(5.0 - sizeMB, 0);

                          return (
                            <>
                              <div className="flex justify-between items-end">
                                <div className="space-y-0.5">
                                  <p className="text-[10px] font-bold text-neutral-400 uppercase font-mono">Used Space</p>
                                  <p className="text-lg font-black text-[#800000] font-mono leading-none">
                                    {sizeMB.toFixed(2)} MB <span className="text-xs text-neutral-400 font-bold">/ 5.00 MB</span>
                                  </p>
                                </div>
                                <span className="text-xs font-black text-neutral-600 font-mono">
                                  {percentage.toFixed(1)}%
                                </span>
                              </div>

                              {/* Progress Bar */}
                              <div className="w-full bg-neutral-100 h-3 rounded-full overflow-hidden border border-neutral-200 p-0.5">
                                <div
                                  className="bg-gradient-to-r from-amber-500 to-[#800000] h-full rounded-full transition-all duration-500"
                                  style={{ width: `${percentage}%` }}
                                ></div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-neutral-500 font-mono uppercase pt-1">
                                <div className="bg-neutral-50 p-2 rounded-xl border border-neutral-100">
                                  <span className="text-neutral-400 block mb-0.5">Remaining Cap</span>
                                  <span className="text-neutral-800 font-black">{remainingMB.toFixed(2)} MB</span>
                                </div>
                                <div className="bg-neutral-50 p-2 rounded-xl border border-neutral-100">
                                  <span className="text-neutral-400 block mb-0.5">Quota Limit Status</span>
                                  <span className={`${percentage > 85 ? 'text-red-600 font-black' : 'text-emerald-600 font-black'}`}>
                                    {percentage > 85 ? '⚠️ NEAR LIMIT' : '✓ HEALTHY'}
                                  </span>
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Firebase Cloud Storage Status */}
                    <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm space-y-4">
                      <div className="flex justify-between items-center border-b border-neutral-100 pb-3">
                        <h4 className="font-serif font-bold text-neutral-800 text-sm flex items-center gap-1.5">
                          ☁️ Secure Cloud Storage
                        </h4>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-extrabold font-mono uppercase tracking-wide animate-pulse">
                          Online & Scalable
                        </span>
                      </div>

                      <div className="space-y-4 text-xs">
                        <div className="flex items-center gap-3 bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 text-emerald-900 font-medium">
                          <CheckCircle className="text-emerald-600 shrink-0" size={18} />
                          <p>
                            Firebase Cloud Integration is <strong>ACTIVE</strong>. Profile pictures, gallery files, and database backups are automatically offloaded to Google Cloud Storage.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between font-bold text-[10px] text-neutral-400 uppercase font-mono">
                            <span>Cloud Storage Allocation</span>
                            <span className="text-neutral-600 font-black">Unlimited / Elastic</span>
                          </div>
                          <div className="w-full bg-neutral-100 h-2.5 rounded-full border border-neutral-200 p-0.5">
                            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full w-[15%] rounded-full"></div>
                          </div>
                          <p className="text-[10px] text-neutral-400 font-bold leading-normal italic text-right mt-1">
                            ✓ Auto-scales with growth • Spark Free Tier Active
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Database Backups Management Section */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Actions and Local Backup/Restore Column */}
                    <div className="lg:col-span-1 bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm space-y-5">
                      <h4 className="font-serif font-bold text-[#800000] text-sm border-b border-neutral-100 pb-2 flex items-center gap-1.5">
                        <Settings size={14} />
                        Utility Actions
                      </h4>

                      {/* Cloud Backup button */}
                      <div className="space-y-2">
                        <button
                          onClick={handleCloudBackup}
                          disabled={isCloudBackingUp}
                          className="w-full bg-[#800000] hover:bg-[#600000] disabled:bg-neutral-300 disabled:text-neutral-500 text-[#D4AF37] border border-[#D4AF37]/40 hover:border-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {isCloudBackingUp ? (
                            <>
                              <RefreshCw size={14} className="animate-spin" />
                              CREATING CLOUD BACKUP...
                            </>
                          ) : (
                            <>
                              <Upload size={14} />
                              PUSH BACKUP TO CLOUD
                            </>
                          )}
                        </button>
                        <p className="text-[10px] text-neutral-400 font-semibold italic text-center">
                          Instantly bundles and uploads the entire database state to secure Cloud storage.
                        </p>
                      </div>

                      <div className="border-t border-neutral-100 my-4 pt-4 space-y-3">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
                          Offline Local Backups
                        </span>

                        <div className="grid grid-cols-2 gap-3">
                          {/* Export local JSON */}
                          <button
                            onClick={handleBackup}
                            className="bg-neutral-800 hover:bg-neutral-900 text-white font-bold py-2.5 px-3 rounded-xl text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-neutral-700 hover:border-white/20"
                          >
                            <Download size={12} />
                            EXPORT JSON
                          </button>

                          {/* Import local JSON */}
                          <label className="bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold py-2.5 px-3 rounded-xl text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-neutral-200 text-center select-none">
                            <Upload size={12} />
                            IMPORT JSON
                            <input
                              type="file"
                              accept=".json"
                              onChange={handleRestore}
                              className="hidden"
                            />
                          </label>
                        </div>
                        <p className="text-[10px] text-neutral-400 font-semibold italic text-center mt-1">
                          Export to or import from a local JSON file directly on your computer.
                        </p>
                      </div>
                    </div>

                    {/* Cloud Backups Registry List Column */}
                    <div className="lg:col-span-2 bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm space-y-4">
                      <div className="flex justify-between items-center border-b border-neutral-100 pb-2">
                        <h4 className="font-serif font-bold text-[#800000] text-sm flex items-center gap-1.5">
                          📂 Cloud Backups Directory
                        </h4>
                        <button
                          onClick={loadCloudBackups}
                          className="p-1 hover:bg-neutral-100 rounded-lg text-[#800000] transition-all cursor-pointer"
                          title="Refresh Backups List"
                        >
                          <RefreshCw size={14} />
                        </button>
                      </div>

                      {cloudBackups.length === 0 ? (
                        <div className="text-center py-12 bg-neutral-50 rounded-2xl border border-dashed border-neutral-200 text-neutral-400">
                          <Database size={28} className="mx-auto mb-2 opacity-30 text-neutral-500" />
                          <p className="text-xs font-bold font-serif text-neutral-600">No cloud backup archives found</p>
                          <p className="text-[10px] mt-0.5">Click "Push Backup to Cloud" to capture your first secure cloud archive.</p>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                          {cloudBackups.map((b) => (
                            <div
                              key={b.id}
                              className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200 hover:border-[#D4AF37]/50 transition-all flex items-center justify-between gap-4"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <p className="text-xs font-black text-neutral-800 truncate font-mono">
                                  {b.name}
                                </p>
                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] font-bold text-neutral-400 uppercase font-mono">
                                  <span>Size: <strong className="text-neutral-600">{b.size}</strong></span>
                                  <span>•</span>
                                  <span>Date: <strong className="text-neutral-600">{new Date(b.createdAt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</strong></span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {/* Direct Download */}
                                <a
                                  href={b.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg border border-neutral-200 transition-all cursor-pointer"
                                  title="Download File"
                                >
                                  <Download size={12} />
                                </a>

                                {/* Restore Live State */}
                                <button
                                  onClick={() => handleRestoreFromCloud(b.url)}
                                  className="text-[10px] font-black bg-[#800000] hover:bg-[#600000] text-[#D4AF37] py-1.5 px-3 rounded-lg cursor-pointer uppercase transition-all shadow-sm border border-[#D4AF37]/20"
                                >
                                  Restore Live
                                </button>

                                {/* Delete Backup */}
                                <button
                                  onClick={() => handleDeleteCloudBackup(b.id)}
                                  className="p-2 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-800 rounded-lg border border-red-200 transition-all cursor-pointer"
                                  title="Delete Backup"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}


            </div>
          )}
        </div>
      </div>

      {/* Complete Member Details Modal overlay */}
      {viewingMemberDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border-4 border-double border-[#D4AF37] rounded-[32px] max-w-2xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-[#800000] text-[#D4AF37] px-6 py-4 flex items-center justify-between border-b-2 border-[#D4AF37]/30">
              <div>
                <h3 className="font-bold text-lg font-serif flex items-center gap-2">
                  <Users size={18} />
                  Complete Member Profile
                </h3>
                <p className="text-[10px] text-yellow-100 opacity-85 uppercase tracking-widest font-semibold font-mono">
                  ID: {viewingMemberDetails.id}
                </p>
              </div>
              <button 
                onClick={() => setViewingMemberDetails(null)} 
                className="p-1 hover:bg-white/10 rounded-full transition-all text-white hover:text-[#D4AF37] cursor-pointer"
              >
                <X size={22} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-6 bg-[#FFFDD0]/20 flex-1 text-left">
              {/* Profile Card Banner */}
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 bg-white p-5 rounded-2xl border border-[#D4AF37]/20 shadow-sm">
                <div className="flex flex-col items-center shrink-0">
                  <img
                    src={viewingMemberDetails.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80'}
                    alt={viewingMemberDetails.name}
                    referrerPolicy="no-referrer"
                    className="w-24 h-24 rounded-full border-4 border-[#800000] object-cover shadow-md cursor-pointer hover:scale-105 transition-all"
                    onClick={() => setLightboxPhoto(viewingMemberDetails.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80')}
                  />
                  <button
                    type="button"
                    onClick={() => setLightboxPhoto(viewingMemberDetails.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80')}
                    className="text-[10px] text-[#800000] hover:underline font-bold mt-1.5 flex items-center gap-1 cursor-pointer"
                  >
                    View Photograph
                  </button>
                </div>
                <div className="flex-1 text-center sm:text-left space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-center sm:justify-start">
                    <h4 className="font-bold text-neutral-900 text-lg leading-tight">{viewingMemberDetails.name}</h4>
                    <div className="flex gap-1.5 justify-center sm:justify-start">
                      {viewingMemberDetails.isCommitteeMember && (
                        <span className="bg-[#800000] text-[#D4AF37] text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Committee
                        </span>
                      )}
                      <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        viewingMemberDetails.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {viewingMemberDetails.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-neutral-500 font-medium">{viewingMemberDetails.email}</p>
                  
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start pt-1">
                    <span className="bg-[#FFFDD0] border border-[#D4AF37]/30 text-[#800000] text-xs font-bold px-3 py-1 rounded-xl shadow-xs">
                      {viewingMemberDetails.instrument || 'Volunteer'}
                    </span>
                    <span className="bg-neutral-100 border border-neutral-200 text-neutral-600 text-xs font-bold px-3 py-1 rounded-xl shadow-xs">
                      Joined: {viewingMemberDetails.yearJoined || 'Pending'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Missed Sessions Section */}
              {viewingMemberDetails.isDetailsFilled && (
                <div className="space-y-3 bg-red-50/60 border border-red-200/50 p-4 rounded-2xl">
                  <h5 className="text-xs font-bold font-serif text-red-700 border-b border-red-100 pb-1.5 uppercase tracking-widest flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <ShieldAlert size={14} className="text-red-500" />
                      Session Attendance & Missed Log
                    </span>
                    <span className="text-[10px] text-neutral-400 font-bold font-sans uppercase">
                      Total Missed: {getMissedCounts(viewingMemberDetails.id).total}
                    </span>
                  </h5>
                  <div className="grid grid-cols-3 gap-3 text-center text-xs">
                    <div className="bg-white border border-red-100 p-3 rounded-xl shadow-2xs">
                      <span className="text-[9px] text-neutral-400 font-bold uppercase block mb-1">Practices Missed</span>
                      <strong className="text-red-600 text-lg font-serif">{getMissedCounts(viewingMemberDetails.id).practices}</strong>
                    </div>
                    <div className="bg-white border border-red-100 p-3 rounded-xl shadow-2xs">
                      <span className="text-[9px] text-neutral-400 font-bold uppercase block mb-1">Performances Missed</span>
                      <strong className="text-red-600 text-lg font-serif">{getMissedCounts(viewingMemberDetails.id).performances}</strong>
                    </div>
                    <div className="bg-white border border-red-100 p-3 rounded-xl shadow-2xs">
                      <span className="text-[9px] text-neutral-400 font-bold uppercase block mb-1">Meetings Missed</span>
                      <strong className="text-red-600 text-lg font-serif">{getMissedCounts(viewingMemberDetails.id).meetings}</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Grid 1: Personal Details */}
              <div className="space-y-3">
                <h5 className="text-xs font-bold font-serif text-[#800000] border-b border-[#D4AF37]/20 pb-1 uppercase tracking-widest flex items-center gap-1">
                  <Sparkles size={12} />
                  1. Personal Information
                </h5>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="bg-white p-3 rounded-xl border border-neutral-100 shadow-2xs">
                    <span className="text-[9px] text-neutral-400 font-bold uppercase block">Contact Mobile</span>
                    {viewingMemberDetails.mobileNumber ? (
                      <a href={`tel:${viewingMemberDetails.mobileNumber}`} className="text-xs font-bold text-[#800000] hover:underline flex items-center gap-1 mt-0.5">
                        <Phone size={10} />
                        {viewingMemberDetails.mobileNumber}
                      </a>
                    ) : (
                      <span className="text-xs font-medium text-neutral-400">Not provided</span>
                    )}
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-neutral-100 shadow-2xs">
                    <span className="text-[9px] text-neutral-400 font-bold uppercase block">Date of Birth</span>
                    <span className="text-xs font-bold text-neutral-800 block mt-0.5">
                      {viewingMemberDetails.dob || 'Not provided'}
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-neutral-100 shadow-2xs">
                    <span className="text-[9px] text-neutral-400 font-bold uppercase block">Gender</span>
                    <span className="text-xs font-bold text-neutral-800 block mt-0.5">
                      {viewingMemberDetails.gender || 'Not provided'}
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-neutral-100 shadow-2xs">
                    <span className="text-[9px] text-neutral-400 font-bold uppercase block">Blood Group</span>
                    <span className="text-xs font-black text-red-600 flex items-center gap-1 mt-0.5">
                      <Heart size={10} className="fill-red-600 text-red-600" />
                      {viewingMemberDetails.bloodGroup || 'Not provided'}
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-neutral-100 shadow-2xs">
                    <span className="text-[9px] text-neutral-400 font-bold uppercase block">Email Address</span>
                    <span className="text-xs font-bold text-[#800000] block mt-0.5 truncate" title={viewingMemberDetails.email}>
                      {viewingMemberDetails.email}
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-neutral-100 shadow-2xs col-span-2">
                    <span className="text-[9px] text-neutral-400 font-bold uppercase block">Residential Address</span>
                    <span className="text-xs font-bold text-neutral-700 block mt-0.5 leading-tight">
                      {viewingMemberDetails.address || 'Not provided'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Grid 2: Family Details */}
              <div className="space-y-3">
                <h5 className="text-xs font-bold font-serif text-[#800000] border-b border-[#D4AF37]/20 pb-1 uppercase tracking-widest flex items-center gap-1">
                  <Heart size={12} />
                  2. Parent & Emergency Contacts
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Father Info */}
                  <div className="bg-white p-4 rounded-xl border border-neutral-100 shadow-2xs space-y-1.5">
                    <span className="text-[9px] text-neutral-400 font-bold uppercase block">Father's Details</span>
                    <h6 className="font-bold text-xs text-neutral-800">{viewingMemberDetails.fatherName || 'Not completed'}</h6>
                    {viewingMemberDetails.fatherMobile && (
                      <a href={`tel:${viewingMemberDetails.fatherMobile}`} className="text-xs font-bold text-[#800000] hover:underline inline-flex items-center gap-1">
                        <Phone size={10} />
                        Father: {viewingMemberDetails.fatherMobile}
                      </a>
                    )}
                  </div>

                  {/* Mother Info */}
                  <div className="bg-white p-4 rounded-xl border border-neutral-100 shadow-2xs space-y-1.5">
                    <span className="text-[9px] text-neutral-400 font-bold uppercase block">Mother's Details</span>
                    <h6 className="font-bold text-xs text-neutral-800">{viewingMemberDetails.motherName || 'Not completed'}</h6>
                    {viewingMemberDetails.motherMobile && (
                      <a href={`tel:${viewingMemberDetails.motherMobile}`} className="text-xs font-bold text-[#800000] hover:underline inline-flex items-center gap-1">
                        <Phone size={10} />
                        Mother: {viewingMemberDetails.motherMobile}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Grid 3: Medical constraints */}
              <div className="space-y-3">
                <h5 className="text-xs font-bold font-serif text-[#800000] border-b border-[#D4AF37]/20 pb-1 uppercase tracking-widest flex items-center gap-1">
                  <ShieldAlert size={12} className="text-red-600" />
                  3. Medical Constraints & Health Status
                </h5>
                <div className={`p-4 rounded-xl border text-xs font-semibold ${
                  viewingMemberDetails.medicalIssue 
                    ? 'bg-red-50 border-red-200 text-red-900' 
                    : 'bg-green-50/50 border-green-200/50 text-green-900'
                }`}>
                  {viewingMemberDetails.medicalIssue ? (
                    <div className="space-y-1">
                      <p className="font-bold flex items-center gap-1">
                        ⚠️ ALERT: Medical Issue reported!
                      </p>
                      <p className="text-neutral-700 leading-normal font-medium pl-4">
                        {viewingMemberDetails.medicalIssueDescription}
                      </p>
                    </div>
                  ) : (
                    <p className="flex items-center gap-1">
                      ✅ No medical issues or physical limitations reported by this member.
                    </p>
                  )}
                </div>
              </div>

              {/* Account Security & Password Details */}
              <div className="space-y-3">
                <h5 className="text-xs font-bold font-serif text-[#800000] border-b border-[#D4AF37]/20 pb-1 uppercase tracking-widest flex items-center gap-1">
                  <Lock size={12} className="text-[#800000]" />
                  4. Account Security & Password
                </h5>
                <div className="bg-amber-50/50 border border-[#D4AF37]/30 p-4 rounded-xl flex items-center justify-between gap-4">
                  <div>
                    <span className="text-[9px] text-neutral-400 font-bold uppercase block">Login Password</span>
                    <span className="font-mono text-sm font-bold text-neutral-800 tracking-wider">
                      {viewingMemberDetails.password || 'No password set / OTP login'}
                    </span>
                  </div>
                  <span className="bg-[#800000] text-[#D4AF37] text-[9px] font-black px-2 py-1 rounded-md tracking-wider uppercase border border-[#D4AF37]/50">
                    Encrypted
                  </span>
                </div>
              </div>

              {/* QR Scan Info */}
              <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200/80 flex items-center justify-between gap-4">
                <div>
                  <span className="text-[9px] text-neutral-400 font-bold uppercase block">Registered QR ID Key</span>
                  <span className="font-mono text-xs font-bold text-neutral-800">
                    {viewingMemberDetails.qrCode || 'No QR code registered'}
                  </span>
                </div>
                {viewingMemberDetails.qrCode && (
                  <span className="bg-green-600 text-white text-[9px] font-black px-2 py-1 rounded-md tracking-wider uppercase">
                    Scan Verified
                  </span>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-neutral-50 px-6 py-4 flex flex-wrap gap-3 justify-end border-t border-neutral-100">
              <button
                type="button"
                onClick={() => {
                  const mId = viewingMemberDetails.id;
                  const mName = viewingMemberDetails.name;
                  setConfirmDialog({
                    isOpen: true,
                    title: 'Delete Member Account',
                    message: `CRITICAL WARNING: Are you sure you want to permanently DELETE the account of "${mName}"? All profile details, session attendances, and credentials will be permanently erased. This action cannot be undone!`,
                    onConfirm: () => {
                      store.deleteMember(mId);
                      setConfirmDialog(null);
                      setViewingMemberDetails(null);
                      loadData();
                    }
                  });
                }}
                className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl uppercase tracking-wider transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                title="Delete Member Account Permanently"
              >
                <Trash2 size={14} />
                Delete Account
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingMember(viewingMemberDetails);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl uppercase tracking-wider transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                title="Edit Member Details"
              >
                <Edit2 size={14} />
                Edit Profile
              </button>

              <button
                type="button"
                onClick={() => setViewingMemberDetails(null)}
                className="bg-[#800000] hover:bg-[#5d0000] text-[#D4AF37] border border-[#D4AF37]/30 text-xs font-bold py-2.5 px-5 rounded-xl uppercase tracking-wider transition-all cursor-pointer shadow-md"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Member Profile Modal overlay */}
      {editingMember && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="max-w-2xl w-full my-8">
            <MemberProfileEdit
              member={editingMember}
              isAdminEditing={true}
              onSave={(updatedMember) => {
                // If we are currently viewing this member, update the viewing state too
                if (viewingMemberDetails && viewingMemberDetails.id === updatedMember.id) {
                  setViewingMemberDetails(updatedMember);
                }
                setEditingMember(null);
                loadData();
              }}
              onClose={() => setEditingMember(null)}
            />
          </div>
        </div>
      )}

      {/* Hidden high-fidelity template for PDF print export */}
      <div style={{ position: 'fixed', left: 0, top: 0, width: '800px', background: '#FFFFFF', opacity: 0.01, pointerEvents: 'none', zIndex: -100 }}>
        <div ref={allMembersDocRef} className="p-8 bg-white text-neutral-800 space-y-6">
          {/* Header */}
          <div className="text-center border-b-4 border-double border-[#800000] pb-4">
            <h1 className="text-3xl font-extrabold font-serif text-[#800000] tracking-wider uppercase">VAJRANAD DHOL TASHA PATHAK</h1>
            <p className="text-xs text-neutral-500 uppercase tracking-widest font-bold mt-1">Belgav, Karnataka, India • Member & Committee Directory</p>
            <div className="text-[10px] text-neutral-400 font-mono mt-2 uppercase">
              Export Date: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
            </div>
          </div>

          <h2 className="text-center text-lg font-bold text-neutral-700 uppercase tracking-wide">Registered Member Profiles Report</h2>

          {/* Members list layout */}
          <div className="space-y-6">
            {members.filter(m => m.isDetailsFilled).map((m, index) => (
              <div key={m.id} className="border border-neutral-300 rounded-2xl p-4 bg-white flex gap-4 items-start page-break-inside-avoid shadow-2xs">
                {/* Clean Initial-based Avatar for PDF / Image rendering to prevent CORS / Tainted Canvas issues */}
                <div className="w-20 h-20 rounded-full border-2 border-[#800000] bg-[#FAF6EE] flex items-center justify-center shrink-0 shadow-sm text-xl font-bold text-[#800000] font-serif uppercase">
                  {m.name ? m.name.charAt(0) : 'V'}
                </div>

                {/* Details */}
                <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {/* Row 1 */}
                  <div className="col-span-2 flex items-center justify-between border-b border-neutral-200 pb-1.5">
                    <h3 className="text-sm font-extrabold text-neutral-800">{index + 1}. {m.name}</h3>
                    <div className="flex gap-2">
                      {m.isCommitteeMember && (
                        <span className="bg-[#800000] text-[#D4AF37] text-[8px] font-bold px-2 py-0.5 rounded uppercase">COMMITTEE MEMBER</span>
                      )}
                      <span className="bg-neutral-100 border border-neutral-200 text-neutral-700 text-[9px] font-bold px-2 py-0.5 rounded">{m.instrument || 'Volunteer'}</span>
                    </div>
                  </div>

                  {/* Row 2 */}
                  <div>
                    <span className="text-neutral-400 font-bold block uppercase text-[8px]">Mobile Number</span>
                    <span className="text-neutral-800 font-semibold">{m.mobileNumber || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 font-bold block uppercase text-[8px]">Email Address</span>
                    <span className="text-neutral-800 font-semibold">{m.email}</span>
                  </div>

                  {/* Row 3 */}
                  <div>
                    <span className="text-neutral-400 font-bold block uppercase text-[8px]">Date of Birth / Age</span>
                    <span className="text-neutral-800 font-semibold">{m.dob || "N/A"} ({calculateAge(m.dob)} yrs)</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 font-bold block uppercase text-[8px]">Gender & Blood Group</span>
                    <span className="text-neutral-800 font-semibold">{m.gender || "N/A"} • Blood Group: {m.bloodGroup || "N/A"}</span>
                  </div>

                  {/* Row 4 - Parents */}
                  <div>
                    <span className="text-neutral-400 font-bold block uppercase text-[8px]">Father's Details</span>
                    <span className="text-neutral-800 font-semibold">{m.fatherName || "N/A"} {m.fatherMobile ? `(${m.fatherMobile})` : ''}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 font-bold block uppercase text-[8px]">Mother's Details</span>
                    <span className="text-neutral-800 font-semibold">{m.motherName || "N/A"} {m.motherMobile ? `(${m.motherMobile})` : ''}</span>
                  </div>

                  {/* Row 5 - Address */}
                  <div className="col-span-2">
                    <span className="text-neutral-400 font-bold block uppercase text-[8px]">Residential Address</span>
                    <span className="text-neutral-800 font-semibold leading-relaxed">{m.address || "N/A"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Custom Confirmation Dialog Modal */}
      {confirmDialog && confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-200">
          <div className="bg-[#FAF6EE] border-4 border-double border-[#D4AF37] rounded-[24px] max-w-md w-full shadow-2xl p-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <AlertTriangle size={26} className="animate-bounce" />
            </div>
            <h4 className="font-extrabold text-[#800000] font-serif text-lg tracking-tight">{confirmDialog.title}</h4>
            <p className="text-xs text-neutral-600 leading-relaxed font-semibold">
              {confirmDialog.message}
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="flex-1 bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-700 font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className="flex-1 bg-[#800000] hover:bg-[#52030d] text-[#D4AF37] border border-[#D4AF37]/30 font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Practice Attendance Viewer Modal */}
      {viewingPracticeSessionRecords && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border-4 border-double border-[#D4AF37] rounded-[32px] max-w-lg w-full shadow-2xl overflow-hidden max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-[#800000] text-[#D4AF37] px-6 py-4 flex items-center justify-between border-b-2 border-[#D4AF37]/30">
              <div>
                <h3 className="font-serif font-black text-sm tracking-widest uppercase">Practice Attendance</h3>
                <p className="text-[10px] text-white/80 font-mono mt-0.5">{viewingPracticeSessionRecords.title} • {viewingPracticeSessionRecords.date}</p>
              </div>
              <button
                onClick={() => setViewingPracticeSessionRecords(null)}
                className="text-[#D4AF37] hover:text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="flex justify-between items-center bg-[#FAF6EE] p-3 rounded-xl border border-neutral-200/50">
                <span className="text-[11px] font-bold text-neutral-500 uppercase">Total Present:</span>
                <span className="bg-[#800000] text-[#D4AF37] font-mono font-black text-xs px-3 py-1 rounded-full">
                  {records.filter(r => r.sessionId === viewingPracticeSessionRecords.id).length} Vadak
                </span>
              </div>

              <div className="space-y-2">
                {records.filter(r => r.sessionId === viewingPracticeSessionRecords.id).length === 0 ? (
                  <p className="text-xs text-neutral-400 italic text-center py-6">No members checked in for this practice session yet.</p>
                ) : (
                  records
                    .filter(r => r.sessionId === viewingPracticeSessionRecords.id)
                    .map((rec, index) => (
                      <div
                        key={rec.id}
                        className="bg-neutral-50 border border-neutral-200 p-3 rounded-xl flex items-center justify-between hover:bg-neutral-100 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-[10px] font-mono text-neutral-400 w-5">#{index + 1}</span>
                          <div>
                            <h5 className="font-bold text-neutral-800 text-xs">{rec.memberName}</h5>
                            <span className="text-[8px] bg-[#FFFDD0] border border-[#D4AF37]/30 text-[#800000] px-1.5 py-0.5 rounded-full font-bold uppercase inline-block mt-0.5">
                              {rec.instrument}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] font-bold text-neutral-400 block uppercase font-mono">Check-In</span>
                          <span className="text-xs font-mono font-bold text-neutral-600">{rec.scanTime}</span>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-neutral-50 border-t border-neutral-100 p-4 flex gap-3">
              <button
                onClick={() => {
                  setSelectedReportSession(viewingPracticeSessionRecords);
                  setViewingPracticeSessionRecords(null);
                }}
                className="flex-1 bg-[#800000] hover:bg-[#5d0000] text-[#D4AF37] border border-[#D4AF37]/30 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer text-center"
              >
                Detailed Report ↗
              </button>
              <button
                onClick={() => setViewingPracticeSessionRecords(null)}
                className="flex-1 bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-600 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer text-center"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Lightbox Modal */}
      {lightboxPhoto && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-[99999] transition-all duration-300 animate-in fade-in"
          onClick={() => setLightboxPhoto(null)}
        >
          <div 
            className="relative max-w-3xl max-h-[90vh] bg-neutral-900/40 p-2 rounded-2xl border border-neutral-700/50 shadow-2xl overflow-hidden flex flex-col items-center justify-center animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={lightboxPhoto} 
              alt="Enlarged Photograph" 
              className="max-w-full max-h-[80vh] rounded-xl object-contain border border-white/10 shadow-lg"
              referrerPolicy="no-referrer"
            />
            <div className="mt-3 flex items-center justify-between w-full px-2 text-neutral-400 text-xs font-mono">
              <a 
                href={lightboxPhoto} 
                target="_blank" 
                rel="noreferrer" 
                className="text-[#D4AF37] hover:underline font-bold"
              >
                Open in New Tab ↗
              </a>
              <button 
                onClick={() => setLightboxPhoto(null)} 
                className="text-white bg-[#800000] hover:bg-red-700 px-3 py-1 rounded-lg font-bold text-[10px] uppercase cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed RSVP Modal Overlay */}
      {selectedPerformanceRequest && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white border-2 border-[#D4AF37] rounded-[28px] max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col my-8 max-h-[85vh]"
          >
            {/* Modal Header */}
            <div className="bg-[#800000] p-5 text-white flex justify-between items-center border-b border-[#D4AF37]/30">
              <div>
                <h4 className="font-serif font-black text-[#D4AF37] text-base uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={18} />
                  Detailed RSVP Registry
                </h4>
                <p className="text-[10px] text-[#FFFDD0] font-bold mt-0.5">
                  {selectedPerformanceRequest.title} • {selectedPerformanceRequest.date} ({store.formatTo12Hour(selectedPerformanceRequest.time)})
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadPerformanceRSVPsExcel(selectedPerformanceRequest)}
                  className="bg-green-700 hover:bg-green-800 text-white font-black text-[10px] uppercase tracking-wider px-3 py-2 rounded-xl transition-all cursor-pointer border border-green-600 flex items-center gap-1"
                >
                  📥 Download Excel
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPerformanceRequest(null)}
                  className="p-1.5 hover:bg-white/10 rounded-full text-[#D4AF37] hover:text-white transition-all cursor-pointer border-none"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Content Tabs (Yes, Maybe, No, No Response) */}
            {(() => {
              const responses = selectedPerformanceRequest.responses || {};
              const currentYear = new Date().getFullYear();

              const yesMembers = members.filter(m => m.id !== 'mem_admin' && m.email !== 'admin@vajranad.com' && responses[m.id] === 'Yes');
              const maybeMembers = members.filter(m => m.id !== 'mem_admin' && m.email !== 'admin@vajranad.com' && responses[m.id] === 'Maybe');
              const noMembers = members.filter(m => m.id !== 'mem_admin' && m.email !== 'admin@vajranad.com' && responses[m.id] === 'No');
              const pendingMembers = members.filter(m => m.id !== 'mem_admin' && m.email !== 'admin@vajranad.com' && m.isActive && m.isDetailsFilled && !responses[m.id]);

              return (
                <div className="p-6 overflow-y-auto flex-1 space-y-6 text-left">
                  {/* Grid Sections */}
                  <div className="space-y-6">
                    
                    {/* Section 1: Attending */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-green-100 pb-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                        <h5 className="font-serif font-black text-green-800 text-xs uppercase tracking-wide">
                          Attending ({yesMembers.length})
                        </h5>
                      </div>
                      {yesMembers.length === 0 ? (
                        <p className="text-[10px] text-neutral-400 font-medium italic">No members have RSVP'd Yes yet.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {yesMembers.map(m => {
                            const isNew = m.yearJoined ? m.yearJoined >= currentYear : true;
                            return (
                              <div key={m.id} className="bg-green-50/30 border border-green-100 rounded-xl p-3 flex items-center gap-3">
                                <img
                                  src={m.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80'}
                                  alt={m.name}
                                  className="w-10 h-10 rounded-full object-cover border border-green-200"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="font-serif font-bold text-xs text-neutral-800 truncate">{m.name}</p>
                                  <p className="text-[9px] text-[#800000] font-bold uppercase tracking-wider">{m.instrument}</p>
                                  <p className="text-[9px] text-neutral-400 font-semibold uppercase">
                                    Joined: {m.yearJoined || 'Pending'} • <span className={isNew ? 'text-[#D4AF37] font-black' : 'text-neutral-500'}>{isNew ? 'New Member' : 'Experienced'}</span>
                                  </p>
                                  {m.mobileNumber && (
                                    <p className="text-[9px] text-neutral-500 font-medium mt-0.5">📞 {m.mobileNumber}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Section 2: Not Attending */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-red-100 pb-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                        <h5 className="font-serif font-black text-red-800 text-xs uppercase tracking-wide">
                          Not Attending ({noMembers.length})
                        </h5>
                      </div>
                      {noMembers.length === 0 ? (
                        <p className="text-[10px] text-neutral-400 font-medium italic">No members have RSVP'd No yet.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {noMembers.map(m => {
                            const isNew = m.yearJoined ? m.yearJoined >= currentYear : true;
                            return (
                              <div key={m.id} className="bg-red-50/30 border border-red-100 rounded-xl p-3 flex items-center gap-3">
                                <img
                                  src={m.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80'}
                                  alt={m.name}
                                  className="w-10 h-10 rounded-full object-cover border border-red-200"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="font-serif font-bold text-xs text-neutral-800 truncate">{m.name}</p>
                                  <p className="text-[9px] text-[#800000] font-bold uppercase tracking-wider">{m.instrument}</p>
                                  <p className="text-[9px] text-neutral-400 font-semibold">
                                    Joined: {m.yearJoined || 'Pending'} • {isNew ? 'New' : 'Experienced'}
                                  </p>
                                  {m.mobileNumber && (
                                    <p className="text-[9px] text-neutral-500 font-medium mt-0.5">📞 {m.mobileNumber}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Section 3: No Response */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-neutral-400" />
                        <h5 className="font-serif font-black text-neutral-700 text-xs uppercase tracking-wide">
                          No Response ({pendingMembers.length})
                        </h5>
                      </div>
                      {pendingMembers.length === 0 ? (
                        <p className="text-[10px] text-neutral-400 font-medium italic">All members have responded! Perfect coordination.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {pendingMembers.map(m => {
                            const isNew = m.yearJoined ? m.yearJoined >= currentYear : true;
                            return (
                              <div key={m.id} className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 flex items-center gap-3">
                                <img
                                  src={m.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80'}
                                  alt={m.name}
                                  className="w-10 h-10 rounded-full object-cover border border-neutral-300"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="font-serif font-bold text-xs text-neutral-800 truncate">{m.name}</p>
                                  <p className="text-[9px] text-[#800000] font-bold uppercase tracking-wider">{m.instrument}</p>
                                  <p className="text-[9px] text-neutral-400 font-semibold">
                                    Joined: {m.yearJoined || 'Pending'} • {isNew ? 'New' : 'Experienced'}
                                  </p>
                                  {m.mobileNumber && (
                                    <p className="text-[9px] text-neutral-500 font-medium mt-0.5">📞 {m.mobileNumber}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              );
            })()}

            {/* Modal Footer */}
            <div className="bg-neutral-50 p-4 border-t border-neutral-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedPerformanceRequest(null)}
                className="bg-neutral-800 hover:bg-neutral-900 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                Close Registry
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
