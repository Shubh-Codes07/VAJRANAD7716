import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, QrCode, Calendar, Megaphone, Image as ImageIcon, Camera, Settings, Bell, HelpCircle, Heart, Phone, Award, ShieldAlert, Sparkles, MapPin, Smile, ArrowLeft, PlayCircle, Download, Trash2, FileImage, FileText } from 'lucide-react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import html2canvasSafe from '../services/html2canvasSafe';
import jsPDF from 'jspdf';
import { Member, AttendanceRecord, AttendanceSession, Notice, GalleryItem, Folder, Instrument, EventCountdown, PerformanceRequest } from '../types';
import { store } from '../services/store';
import MemberProfileEdit from './MemberProfileEdit';
import QRScannerComp from './QRScannerComp';

function CountdownTimer({ 
  countdown, 
  isAdmin, 
  onDelete 
}: { 
  countdown: EventCountdown; 
  isAdmin?: boolean; 
  onDelete?: () => void; 
}) {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const targetDate = new Date(`${countdown.date}T00:00:00`);
      const now = new Date();
      const difference = targetDate.getTime() - now.getTime();

      if (difference <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      setTimeLeft({ days, hours, minutes, seconds });
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [countdown]);

  // Auto-delete ref MUST be declared before any early returns (Rules of Hooks)
  const autoDeletedRef = useRef(false);

  // Auto-delete: run on mount; if event date has fully passed, delete after brief delay
  useEffect(() => {
    if (autoDeletedRef.current || !onDelete) return;
    const targetDate = new Date(`${countdown.date}T00:00:00`);
    const dayAfterEvent = new Date(targetDate);
    dayAfterEvent.setDate(dayAfterEvent.getDate() + 1);
    if (new Date() >= dayAfterEvent) {
      autoDeletedRef.current = true;
      const t = setTimeout(() => onDelete(), 3000);
      return () => clearTimeout(t);
    }
  }, []);

  if (!timeLeft) return null;

  const isOver = timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes === 0 && timeLeft.seconds === 0;

  return (
    <div className="bg-[#800000] border-2 border-[#D4AF37] text-white p-5 rounded-[28px] shadow-lg relative overflow-hidden text-center animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#800000]/30 via-transparent to-transparent opacity-60" />
      
      {/* Admin Quick Delete Action */}
      {isAdmin && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm("Are you sure you want to delete/remove this active countdown?")) {
              onDelete();
            }
          }}
          className="absolute top-4 right-4 z-20 p-2 bg-white/10 hover:bg-red-600 rounded-full text-white/80 hover:text-white border border-white/10 transition-all cursor-pointer"
          title="Delete Countdown"
        >
          <Trash2 size={14} />
        </button>
      )}

      <div className="relative z-10 space-y-3">
        <span className="text-[10px] bg-[#D4AF37] text-neutral-900 font-extrabold px-3 py-1 rounded-full uppercase tracking-widest inline-block animate-pulse">
          🎯 Upcoming Event
        </span>
        <h4 className="font-serif font-black text-[#D4AF37] text-base leading-snug truncate px-2">
          {countdown.heading}
        </h4>
        
        {isOver ? (
          <p className="text-sm font-bold text-yellow-100 uppercase tracking-widest mt-1">
            🎉 The Event is Today! 🥁
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2 pt-1 max-w-[280px] mx-auto">
            {/* Days */}
            <div className="bg-white/10 border border-[#D4AF37]/20 p-2 rounded-xl">
              <span className="font-mono text-xl font-black block text-[#D4AF37]">{timeLeft.days}</span>
              <span className="text-[8px] font-bold uppercase text-white/70 block">Days</span>
            </div>
            {/* Hours */}
            <div className="bg-white/10 border border-[#D4AF37]/20 p-2 rounded-xl">
              <span className="font-mono text-xl font-black block text-[#D4AF37]">{timeLeft.hours}</span>
              <span className="text-[8px] font-bold uppercase text-white/70 block">Hours</span>
            </div>
            {/* Mins */}
            <div className="bg-white/10 border border-[#D4AF37]/20 p-2 rounded-xl">
              <span className="font-mono text-xl font-black block text-[#D4AF37]">{timeLeft.minutes}</span>
              <span className="text-[8px] font-bold uppercase text-white/70 block">Mins</span>
            </div>
            {/* Secs */}
            <div className="bg-white/10 border border-[#D4AF37]/20 p-2 rounded-xl">
              <span className="font-mono text-xl font-black block text-[#D4AF37]">{timeLeft.seconds}</span>
              <span className="text-[8px] font-bold uppercase text-white/70 block">Secs</span>
            </div>
          </div>
        )}
        
        <p className="text-[9px] font-bold text-white/60 uppercase tracking-wider font-mono">
          Event Date: {new Date(countdown.date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
        </p>
      </div>
    </div>
  );
}

interface MemberHomeProps {
  currentUser: Member;
  onLogout: () => void;
  onUpdateUser: (updatedUser: Member) => void;
}

export default function MemberHome({ currentUser, onLogout, onUpdateUser }: MemberHomeProps) {
  const [activeTab, setActiveTab] = useState<'home' | 'qr' | 'history' | 'scanner'>('qr');
  const [showSettings, setShowSettings] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  const memberCardRef = useRef<HTMLDivElement>(null);
  const [isDownloadingJpg, setIsDownloadingJpg] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Data caches
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [activeCountdown, setActiveCountdown] = useState<EventCountdown | null>(null);
  
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [performanceRequests, setPerformanceRequests] = useState<PerformanceRequest[]>([]);

  // Load member data
  const loadMemberData = () => {
    setSessions(store.getSessions());
    setRecords(store.getAttendanceRecords());
    setFolders(store.getFolders());
    setNotices(store.getNotices());
    setGallery(store.getGalleryItems());
    setActiveCountdown(store.getActiveCountdown());
    // Use getActiveNonExpiredPerformanceRequests() so:
    //  1. Expired callouts (past expiryHours) are auto-removed from localStorage + Supabase
    //  2. Admin-toggled-off callouts are excluded
    //  3. No stale callout ever appears to a freshly logged-in member
    setPerformanceRequests(store.getActiveNonExpiredPerformanceRequests());
    console.log('[MEMBERHOME] [CALLOUT LOAD] Performance callouts loaded into UI state.');
  };

  useEffect(() => {
    loadMemberData();
  }, [currentUser]);

  const getExpiryStatus = (pr: PerformanceRequest) => {
    const createdAtMs = new Date(pr.createdAt).getTime();
    const expiryHours = pr.expiryHours ?? 48;
    const expiryTimeMs = createdAtMs + (expiryHours * 60 * 60 * 1000);
    const nowMs = Date.now();
    const timeLeftMs = expiryTimeMs - nowMs;
    const isExpired = timeLeftMs <= 0;

    let timeLeftStr = '';
    if (!isExpired) {
      const hoursLeft = Math.floor(timeLeftMs / (1000 * 60 * 60));
      const minsLeft = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));
      timeLeftStr = `${hoursLeft}h ${minsLeft}m left`;
    } else {
      timeLeftStr = 'RSVP window closed';
    }

    return { isExpired, timeLeftStr };
  };

  // Compute stats using the shared logic (same as Admin Portal)
  const stats = store.getMemberAttendanceStats(currentUser.id);

  // Practice + Performance only (Meeting excluded from all UI and calculations)
  const totalHeld = stats.practiceHeld + stats.performanceHeld;
  const totalAttended = stats.practiceAttended + stats.performanceAttended;

  // Missed counts
  const practicesMissed = stats.practiceHeld - stats.practiceAttended;
  const performancesMissed = stats.performanceHeld - stats.performanceAttended;
  const totalMissed = practicesMissed + performancesMissed;

  // Calendar: only show Practice and Performance sessions
  const calendarSessions = sessions.filter(s => s.type === 'Practice' || s.type === 'Performance');

  // For Last Attendance card lookups (deduplicated by sessionId)
  const rawRecords = records.filter(r => r.memberId === currentUser.id);
  const myRecords = rawRecords.filter((r, index, self) =>
    index === self.findIndex(t => t.sessionId === r.sessionId)
  );

  const renderMissedSessionsWidget = () => (
    <div className="bg-[#800000]/5 border-2 border-[#800000]/20 p-4 rounded-[24px] shadow-xs text-left animate-in fade-in duration-200 my-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-[#800000] font-extrabold uppercase tracking-widest flex items-center gap-1">
          <ShieldAlert size={12} className="text-red-500 shrink-0" />
          My Missed Sessions Log
        </span>
        <span className="text-[9px] text-neutral-500 font-extrabold uppercase tracking-wider">
          Total Missed: <strong className="text-red-600 font-serif text-xs">{totalMissed}</strong>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center text-[10px] font-black">
        <div className="bg-white border border-[#D4AF37]/20 p-2 rounded-xl shadow-2xs">
          <span className="text-[8px] text-neutral-400 block uppercase font-bold leading-tight">Practices</span>
          <span className="text-red-600 font-serif font-black text-xs">{practicesMissed} Missed</span>
        </div>
        <div className="bg-white border border-[#D4AF37]/20 p-2 rounded-xl shadow-2xs">
          <span className="text-[8px] text-neutral-400 block uppercase font-bold leading-tight">Performances</span>
          <span className="text-red-600 font-serif font-black text-xs">{performancesMissed} Missed</span>
        </div>
      </div>
    </div>
  );

  const lastAttendance = myRecords.length > 0 
    ? myRecords[myRecords.length - 1] 
    : null;

  // Shared: capture the member card as a high-quality canvas (handles CORS images)
  const captureCardCanvas = async (): Promise<HTMLCanvasElement> => {
    if (!memberCardRef.current) throw new Error('Card element (memberCardRef) not found in DOM');

    // Step 1: Collect all <img> elements inside the card
    const imgs = Array.from(memberCardRef.current.querySelectorAll('img')) as HTMLImageElement[];
    const origSrcs: string[] = imgs.map(img => img.src);
    const origCrossOrigins: (string | null)[] = imgs.map(img => img.getAttribute('crossorigin'));
    const blobUrls: string[] = [];

    // Step 2: Convert every external URL to a same-origin blob URL.
    // This is the only reliable way to prevent canvas taint from cross-origin images
    // (Supabase Storage, Unsplash, etc.) even when the server sends CORS headers.
    for (let i = 0; i < imgs.length; i++) {
      const src = origSrcs[i];
      if (src && (src.startsWith('http') || src.startsWith('https'))) {
        try {
          console.log(`[CARD EXPORT] Fetching image ${i + 1}/${imgs.length}: ${src.slice(0, 60)}...`);
          const resp = await fetch(src, { mode: 'cors', cache: 'force-cache' });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const blob = await resp.blob();
          const blobUrl = URL.createObjectURL(blob);
          blobUrls.push(blobUrl);

          // Ensure crossOrigin is set before changing src (order matters for CORS policy)
          imgs[i].crossOrigin = 'anonymous';
          imgs[i].src = blobUrl;

          // Always wait for the new src to finish loading — never rely on img.complete
          // which still reflects the old src until the browser processes the assignment.
          await new Promise<void>((resolve) => {
            // Give the browser a tick to start the load, then listen
            const onDone = () => {
              imgs[i].removeEventListener('load', onDone);
              imgs[i].removeEventListener('error', onDone);
              resolve();
            };
            imgs[i].addEventListener('load', onDone, { once: true });
            imgs[i].addEventListener('error', onDone, { once: true });
            // Safety net: if it was already complete with the blob URL (cached), resolve immediately
            if (imgs[i].complete && imgs[i].naturalWidth > 0) {
              imgs[i].removeEventListener('load', onDone);
              imgs[i].removeEventListener('error', onDone);
              resolve();
            }
          });
          console.log(`[CARD EXPORT] Image ${i + 1} loaded as blob URL ✓`);
        } catch (fetchErr: any) {
          console.warn(`[CARD EXPORT] Could not fetch image ${i + 1} as blob (${fetchErr?.message}). Proceeding with original src.`);
          blobUrls.push(src); // keep original so we don't break the img
        }
      } else {
        blobUrls.push(src); // local/data URL — no CORS concern
      }
    }

    // Step 3: Capture the card with html2canvas
    // IMPORTANT: allowTaint must be FALSE — setting it to true disables useCORS entirely
    // and causes toDataURL() to throw a SecurityError on any cross-origin image.
    let canvas: HTMLCanvasElement;
    try {
      console.log('[CARD EXPORT] Waiting for document.fonts.ready...');
      await document.fonts.ready;
      
      // Explicitly verify and load the specific fonts used in the card to prevent cramped text.
      // From index.css and Tailwind defaults:
      // - Member Name (font-serif): "Georgia", "Times New Roman"
      // - Contact Details (font-mono): ui-monospace, Consolas, Courier New
      // - Body/Badges (font-sans): "Inter", "Noto Sans Devanagari"
      const fontsToCheck = [
        '1em "Inter"', 
        '1em "Georgia"',
        '1em ui-monospace',
        '1em Consolas'
      ];

      for (const font of fontsToCheck) {
        const isLoaded = document.fonts.check(font);
        console.log(`[CARD EXPORT] Font check for ${font}: ${isLoaded ? 'Loaded ✓' : 'Pending/System Font'}`);
        if (!isLoaded) {
          try {
            // Force the browser to load it if it's a web font that hasn't painted yet
            await document.fonts.load(font);
            console.log(`[CARD EXPORT] Force loaded ${font} ✓`);
          } catch (e) {
            console.log(`[CARD EXPORT] Could not force load ${font} (likely a system font or unavailable)`);
          }
        }
      }
      
      // Give a robust buffer for the browser layout to recalculate and settle after font swaps
      // This explicitly prevents the "overlapping text" reflow issue in html2canvas
      console.log('[CARD EXPORT] Waiting 250ms for layout to settle...');
      await new Promise(resolve => setTimeout(resolve, 250));

      console.log('[CARD EXPORT] Calling html2canvas...');
      canvas = await html2canvasSafe(memberCardRef.current, {
        scale: 3,
        useCORS: true,
        allowTaint: false,   // ← must be false; true defeats useCORS and taints the canvas
        backgroundColor: null,
        logging: false,
      });
      console.log('[CARD EXPORT] html2canvas capture complete ✓');
    } finally {
      // Step 4: Always restore original src values and revoke blob URLs (even on error)
      imgs.forEach((img, i) => {
        img.src = origSrcs[i];
        if (origCrossOrigins[i] !== null) {
          img.setAttribute('crossorigin', origCrossOrigins[i]!);
        } else {
          img.removeAttribute('crossorigin');
        }
      });
      blobUrls.forEach(url => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); });
    }
    return canvas;
  };

  // Download member card as JPG
  const handleDownloadCardJpg = async () => {
    setIsDownloadingJpg(true);
    try {
      const canvas = await captureCardCanvas();
      const link = document.createElement('a');
      link.download = `Vajranad_MemberCard_${currentUser.name.replace(/\s+/g, '_')}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
      console.log('[CARD EXPORT] JPG downloaded successfully ✓');
    } catch (e: any) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      console.error('[CARD EXPORT] JPG generation failed:', msg, e);
      alert(`Failed to generate image.\n\nReason: ${msg}\n\nCheck the browser console for details.`);
    } finally {
      setIsDownloadingJpg(false);
    }
  };

  // Download member card as PDF
  const handleDownloadCardPdf = async () => {
    setIsDownloadingPdf(true);
    try {
      const canvas = await captureCardCanvas();
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const cardWidthMm = 85.6;
      const cardHeightMm = (canvas.height / canvas.width) * cardWidthMm;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [cardWidthMm, cardHeightMm] });
      pdf.addImage(imgData, 'JPEG', 0, 0, cardWidthMm, cardHeightMm);
      pdf.save(`Vajranad_MemberCard_${currentUser.name.replace(/\s+/g, '_')}.pdf`);
      console.log('[CARD EXPORT] PDF downloaded successfully ✓');
    } catch (e: any) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      console.error('[CARD EXPORT] PDF generation failed:', msg, e);
      alert(`Failed to generate PDF.\n\nReason: ${msg}\n\nCheck the browser console for details.`);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Handle setting/profile update
  const handleSaveProfile = (updated: Member) => {
    onUpdateUser(updated);
    setShowSettings(false);
    loadMemberData();
  };

  const handleRespondPerformance = (requestId: string, status: 'Yes' | 'No' | 'Maybe') => {
    const confirmMessage = `Are you sure you want to submit your response as "${status === 'Yes' ? 'Attending (Yes)' : 'Not Attending (No)'}"? Once submitted, your response will be locked and cannot be edited.`;
    if (!confirm(confirmMessage)) return;

    const res = store.respondToPerformanceRequest(requestId, currentUser.id, status);
    if (res && !res.success) {
      alert(res.error);
    }
    loadMemberData();
  };

  // Submit instrument change request
  const handleRequestInstrumentChange = (newInstrument: Instrument) => {
    const updated: Member = {
      ...currentUser,
      instrumentRequest: newInstrument
    };
    store.updateMember(updated);
    onUpdateUser(updated);
    alert(`Instrument change request for "${newInstrument}" has been sent to the Administrator for approval.`);
  };


  return (
    <div className="min-h-screen bg-[#FFFDD0] flex flex-col justify-between pb-20 font-sans relative">
      
      {/* Top Header Navigation Bar */}
      <div className="bg-white px-6 py-4 border-b border-neutral-200/80 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <img
            src={currentUser.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80'}
            alt={currentUser.name}
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-full border-2 border-[#800000] object-cover"
          />
          <div>
            <h2 className="font-bold text-neutral-800 text-sm flex items-center gap-1">
              Namaste, {currentUser.name.split(' ')[0]}
              <Smile size={14} className="text-amber-500 fill-amber-500/20" />
            </h2>
            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
              {currentUser.instrument || 'New Member'} • YEAR {currentUser.yearJoined || 'PENDING'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Profile settings button with User icon */}
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 bg-neutral-100 hover:bg-neutral-200 rounded-xl text-[#800000] transition-all cursor-pointer relative"
            title="Profile Settings"
          >
            <User size={18} />
            {!currentUser.isDetailsFilled && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border border-white animate-pulse" />
            )}
          </button>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="text-xs font-bold text-neutral-400 hover:text-red-700 py-1.5 px-3 rounded-lg hover:bg-red-50 transition-all cursor-pointer"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Tab View Contents */}
      <div className="flex-1 p-5 max-w-md mx-auto w-full space-y-6 overflow-y-auto">
        
        {/* Force profile filling if incomplete */}
        {!currentUser.isDetailsFilled ? (
          <div className="bg-white border-4 border-double border-[#D4AF37] p-6 rounded-[32px] text-center space-y-4 shadow-xl">
            <Sparkles className="mx-auto text-[#800000] w-12 h-12" />
            <h3 className="font-bold font-serif text-neutral-900">Complete Your Registration</h3>
            <p className="text-xs text-neutral-500 leading-normal">
              Dear member, please fill in your personal details (Profile photo, parent details, address, date of birth) to activate your digital pathak account and generate your permanent QR Membership Card.
            </p>
            <button
              onClick={() => setShowSettings(true)}
              className="w-full bg-[#800000] text-[#D4AF37] border-2 border-[#D4AF37] hover:bg-[#5d0000] font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              FILL DETAILS NOW
            </button>
          </div>
        ) : (
          <div>
            {/* TAB 1: HOME PANEL (Folders & Event Feed) */}
            {activeTab === 'home' && (
              <div className="space-y-6">
                {!selectedFolder ? (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    {activeCountdown && (
                      <CountdownTimer 
                        countdown={activeCountdown} 
                        isAdmin={currentUser.email === 'admin@vajranad.com'}
                        onDelete={() => {
                          store.deleteCountdown(activeCountdown.id);
                          loadMemberData();
                        }}
                      />
                    )}

                    {/* Active Performance RSVP Callouts for Members
                        NOTE: performanceRequests already contains only active,
                        non-expired entries (filtered by store.getActiveNonExpiredPerformanceRequests). */}
                    {performanceRequests.map(pr => {
                      const currentResponse = pr.responses?.[currentUser.id];
                      const { isExpired, timeLeftStr } = getExpiryStatus(pr);
                      const expiryHours = pr.expiryHours ?? 48;
                      return (
                        <div key={pr.id} className="bg-white border-2 border-[#D4AF37] p-5 rounded-[28px] shadow-md relative overflow-hidden space-y-4 animate-in fade-in duration-300">
                          {/* Top Tag */}
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] bg-[#800000] text-[#D4AF37] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-widest inline-block">
                              🎺 Performance Callout
                            </span>
                            <span className={`text-[10px] font-bold uppercase ${isExpired ? 'text-red-500 font-extrabold' : 'text-neutral-500'}`}>
                              {isExpired ? `🔒 CLOSED (${expiryHours}h Limit)` : `⏳ ${timeLeftStr}`}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <h4 className="font-serif font-black text-[#800000] text-sm uppercase tracking-wide">
                              {pr.title}
                            </h4>
                            <p className="text-[11px] text-neutral-500 font-bold flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span>📅 Date: <strong className="text-neutral-700">{pr.date}</strong></span>
                              <span>⏰ Time: <strong className="text-neutral-700">{store.formatTo12Hour(pr.time)}</strong></span>
                              <span>📍 Location: <strong className="text-[#800000]">{pr.location}</strong></span>
                            </p>
                            {pr.description && (
                              <p className="text-xs text-neutral-500 leading-relaxed pt-1 italic">
                                "{pr.description}"
                              </p>
                            )}
                          </div>

                          {/* RSVP Selection Buttons */}
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                              {isExpired ? 'Response submission window has closed.' : !!currentResponse ? 'Your response is registered and locked.' : 'Are you going to come on that day?'}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                disabled={isExpired || !!currentResponse}
                                onClick={() => handleRespondPerformance(pr.id, 'Yes')}
                                className={`py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                                  isExpired || !!currentResponse
                                    ? currentResponse === 'Yes'
                                      ? 'bg-green-600 text-white border-green-600 opacity-90 cursor-not-allowed shadow-sm'
                                      : 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed'
                                    : currentResponse === 'Yes'
                                    ? 'bg-green-600 text-white border-green-600 shadow-md scale-102 cursor-pointer'
                                    : 'bg-white text-neutral-600 border-neutral-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200 cursor-pointer'
                                }`}
                              >
                                {currentResponse === 'Yes' ? '✓ Attending' : 'Yes'}
                              </button>
                              <button
                                disabled={isExpired || !!currentResponse}
                                onClick={() => handleRespondPerformance(pr.id, 'No')}
                                className={`py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                                  isExpired || !!currentResponse
                                    ? currentResponse === 'No'
                                      ? 'bg-red-600 text-white border-red-600 opacity-90 cursor-not-allowed shadow-sm'
                                      : 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed'
                                    : currentResponse === 'No'
                                    ? 'bg-red-600 text-white border-red-600 shadow-md scale-102 cursor-pointer'
                                    : 'bg-white text-neutral-600 border-neutral-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200 cursor-pointer'
                                }`}
                              >
                                {currentResponse === 'No' ? '✗ Decline' : 'No'}
                              </button>
                            </div>
                            {isExpired ? (
                              <p className="text-[10px] text-red-600 font-extrabold text-center pt-1">
                                🔒 RSVP locked after {expiryHours} hours from publish time.
                              </p>
                            ) : currentResponse ? (
                              <p className="text-[10px] text-green-600 font-extrabold text-center pt-1">
                                🔒 RSVP registered and locked (no editing).
                              </p>
                            ) : (
                              <p className="text-[10px] text-amber-600 font-extrabold text-center pt-1 animate-pulse">
                                ⚠️ RSVP pending. Please select an option to update the Admin dashboard count.
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    <div className="bg-white border-2 border-[#D4AF37] p-5 rounded-[28px] shadow-md relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-[#800000]/5 rounded-full blur-xl" />
                      <h3 className="font-serif font-black text-[#800000] text-base flex items-center gap-1.5">
                        <Sparkles size={16} className="text-[#D4AF37] fill-[#D4AF37]/20" />
                        Vajranad Event Feed
                      </h3>
                      <p className="text-xs text-neutral-500 leading-relaxed mt-1">
                        Select an event folder below to view specific performance schedules, notices, photos, and videos published by the administration team.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {folders.length === 0 ? (
                        <p className="text-xs text-neutral-400 italic bg-white p-8 rounded-[28px] border-2 border-[#D4AF37]/20 text-center">No active folders posted yet.</p>
                      ) : (
                        folders.map((f) => {
                          const folderNoticesCount = notices.filter(n => n.folderId === f.id).length;
                          const folderMediaCount = gallery.filter(g => g.folderId === f.id).length;
                          return (
                            <div
                              key={f.id}
                              onClick={() => setSelectedFolder(f)}
                              className="bg-white border-2 border-[#D4AF37]/20 p-5 rounded-[28px] shadow-sm hover:shadow-md hover:border-[#800000]/50 transition-all cursor-pointer space-y-3 relative overflow-hidden group"
                            >
                              <div className="absolute top-0 left-0 w-2 h-full bg-[#800000]" />
                              <div>
                                <h4 className="font-bold font-serif text-neutral-900 text-sm group-hover:text-[#800000] transition-colors">{f.name}</h4>
                                <p className="text-xs text-neutral-500 mt-1 line-clamp-2 leading-relaxed">{f.description || 'View schedule announcements and team media.'}</p>
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-neutral-100 text-[10px] font-black uppercase text-[#800000]">
                                <div className="flex gap-3">
                                  <span>📢 {folderNoticesCount} Notices</span>
                                  <span>🖼️ {folderMediaCount} Media</span>
                                </div>
                                <span className="text-[#D4AF37] group-hover:translate-x-1 transition-transform font-black">View Folder →</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  // Inside Folder View for Member
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    {/* Header */}
                    <div className="bg-[#800000] border-4 border-double border-[#D4AF37] p-5 rounded-[28px] text-white shadow-lg space-y-2">
                      <button
                        onClick={() => setSelectedFolder(null)}
                        className="text-[10px] font-bold bg-white/10 hover:bg-white/20 text-[#D4AF37] py-1 px-3 rounded-lg cursor-pointer border border-[#D4AF37]/30 transition-all uppercase tracking-wider flex items-center gap-1 w-fit"
                      >
                        <ArrowLeft size={10} />
                        Back to Folders
                      </button>
                      <h3 className="font-serif font-black text-base text-[#D4AF37] leading-tight mt-1">{selectedFolder.name}</h3>
                      <p className="text-xs text-yellow-100 opacity-90 leading-relaxed">{selectedFolder.description || 'Announcements, photos and videos for this event.'}</p>
                    </div>

                    {/* Section 1: Notices inside this Folder */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Megaphone size={14} className="text-[#800000]" />
                        Folder Announcements
                      </h4>
                      {notices.filter(n => n.folderId === selectedFolder.id).length === 0 ? (
                        <p className="text-xs text-neutral-400 italic bg-white p-5 rounded-2xl border border-neutral-200 text-center">No announcements inside this folder.</p>
                      ) : (
                        notices.filter(n => n.folderId === selectedFolder.id).map((n) => (
                          <div
                            key={n.id}
                            className="bg-white border border-neutral-200 p-4 rounded-2xl shadow-sm space-y-2 relative overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                          >
                            <div className="absolute top-0 left-0 w-1.5 h-full bg-[#800000]" />
                            <div className="flex items-center justify-between">
                              <span className="bg-[#800000]/5 text-[#800000] text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                                {n.type}
                              </span>
                              <span className="text-[9px] text-neutral-400 font-mono font-medium">{n.date}</span>
                            </div>
                            <h5 className="font-bold font-serif text-neutral-900 text-sm">{n.title}</h5>
                            <p className="text-xs text-neutral-600 leading-relaxed whitespace-pre-wrap">{n.content}</p>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Section 2: Photos & Videos inside this Folder */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1.5">
                        <ImageIcon size={14} className="text-[#800000]" />
                        Folder Media Gallery
                      </h4>
                      {gallery.filter(g => g.folderId === selectedFolder.id).length === 0 ? (
                        <p className="text-xs text-neutral-400 italic bg-white p-5 rounded-2xl border border-neutral-200 text-center">No photos or videos uploaded in this folder.</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          {gallery.filter(g => g.folderId === selectedFolder.id).map((g) => (
                            <div
                              key={g.id}
                              className="bg-white rounded-xl border border-neutral-200/80 overflow-hidden shadow-sm flex flex-col justify-between"
                            >
                              <div className="relative group overflow-hidden">
                                {g.type === 'video' ? (
                                  <video
                                    src={g.url}
                                    controls
                                    className="w-full h-24 object-cover"
                                  />
                                ) : (
                                  <img
                                    src={g.url}
                                    alt={g.title}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-24 object-cover group-hover:scale-105 transition-transform duration-200 cursor-pointer"
                                    onClick={() => setLightboxPhoto(g.url)}
                                    title="Click to view photograph"
                                  />
                                )}
                              </div>
                              <div className="p-2">
                                <p className="text-[10px] font-bold text-neutral-700 truncate leading-tight">{g.title}</p>
                                <span className="text-[8px] font-black text-[#800000] uppercase tracking-wider mt-0.5 block">{g.type}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: MY QR CARD PANEL */}
            {activeTab === 'qr' && (
              <div className="flex flex-col items-center justify-center py-4 space-y-6">
                
                {/* Gold and Maroon Royal Membership Card - Vertical 3:5 Aspect Ratio Container */}
                <div 
                  id="membership-card-downloadable"
                  ref={memberCardRef}
                  className="w-full max-w-[320px] aspect-[3/5] bg-gradient-to-b from-[#800000] via-[#5d0000] to-[#360005] border-4 border-double border-[#D4AF37] rounded-[24px] p-5 text-[#FFFDD0] shadow-2xl relative overflow-hidden flex flex-col justify-between"
                >
                  
                  {/* Subtle watermarked Hanumad-Aura */}
                  <div className="absolute -right-16 -bottom-16 w-48 h-48 rounded-full bg-[#D4AF37]/5 blur-2xl pointer-events-none" />
                  
                  {/* Card Header */}
                  <div className="flex justify-between items-start border-b border-[#D4AF37]/30 pb-2.5">
                    <div>
                      <h4 className="font-serif font-black text-xs sm:text-sm tracking-wider uppercase text-[#D4AF37]">Vajranad Pathak</h4>
                      <p className="text-[7.5px] sm:text-[8.5px] tracking-widest font-black opacity-90 uppercase mt-0.5 text-yellow-100">BELGAV</p>
                    </div>
                    <span className="text-[8px] sm:text-[9px] font-black bg-[#D4AF37] text-neutral-950 px-2 py-0.5 rounded uppercase tracking-wider shrink-0">
                      VADAK
                    </span>
                  </div>

                  {/* Profile Picture (Left) and Name/Instrument/Stats (Right) */}
                  <div className="flex flex-row items-center gap-4 mt-2.5 mb-1 text-left">
                    <div className="relative shrink-0">
                      <img
                        src={currentUser.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80'}
                        alt={currentUser.name}
                        crossOrigin="anonymous"
                        className="w-28 h-28 rounded-full border-2 border-[#D4AF37] object-cover shadow-md"
                      />
                      <div className="absolute bottom-1 right-1 bg-green-500 w-4 h-4 rounded-full border-2 border-[#800000] shadow" />
                    </div>
                    
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div>
                        <span className="text-[8px] text-yellow-100 opacity-70 uppercase font-extrabold tracking-wider block">Member Name</span>
                        <h3 className="font-serif font-black text-sm sm:text-base tracking-wide text-[#FFFDD0] uppercase truncate" title={currentUser.name}>
                          {currentUser.name}
                        </h3>
                      </div>
                      
                      <div>
                        <span className="text-[8px] text-yellow-100 opacity-70 uppercase font-extrabold tracking-wider block">Role / Instrument</span>
                        <span className="inline-block mt-0.5 text-[9px] font-black bg-[#D4AF37] text-neutral-950 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                          {currentUser.instrument}
                        </span>
                      </div>

                      {/* Compact stats row */}
                      <div className="flex gap-2.5 text-[9px] pt-0.5 opacity-90 font-medium">
                        <span>Blood: <strong className="text-[#FFFDD0]">{currentUser.bloodGroup || 'O+'}</strong></span>
                        <span className="text-[#D4AF37]/60">•</span>
                        <span>Joined: <strong className="text-[#FFFDD0]">{currentUser.yearJoined}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Contact & QR Side-by-Side */}
                  <div className="flex gap-3 bg-black/25 p-2.5 rounded-xl border border-[#D4AF37]/20 items-center my-1">
                    {/* Left: DOB & Contact Details */}
                    <div className="flex-1 min-w-0 text-left space-y-1.5">
                      <div>
                        <span className="text-[8px] text-amber-200 uppercase font-black tracking-wider block">DOB</span>
                        <span className="font-mono text-[10px] sm:text-[11px] text-[#FFFDD0] font-black block">
                          {currentUser.dob || 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[8px] text-amber-200 uppercase font-black tracking-wider block">Contact Details</span>
                        <div className="font-mono text-[10px] sm:text-[11px] text-[#FFFDD0] font-black space-y-0.5 leading-tight mt-0.5">
                          <span className="block truncate">{currentUser.mobileNumber || 'N/A'}</span>
                          <span className="block truncate">{currentUser.fatherMobile || 'N/A'}</span>
                          <span className="block truncate text-[9px] text-[#D4AF37] tracking-normal lowercase font-sans font-semibold">{currentUser.email}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: QR Code rendered as <canvas> for html2canvas compatibility */}
                    <div className="shrink-0 flex items-center justify-center">
                      <div className="bg-white p-1 rounded-lg border border-[#D4AF37] shadow-lg flex items-center justify-center">
                        <QRCodeCanvas
                          value={currentUser.qrCode || currentUser.id}
                          size={88}
                          fgColor="#800000"
                          level="M"
                          includeMargin={false}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Address Section - Full Width below Contact/QR */}
                  <div className="bg-black/25 p-2.5 rounded-xl border border-[#D4AF37]/20 text-left my-1">
                    <span className="text-[8px] text-amber-200 uppercase font-black tracking-wider block">Address</span>
                    <p className="text-[10.5px] sm:text-[11.5px] text-[#FFFDD0] font-black leading-snug mt-0.5 line-clamp-2" title={currentUser.address}>
                      {currentUser.address || 'Belgav, Karnataka'}
                    </p>
                  </div>

                  {/* Stamp */}
                  <div className="pt-1.5 border-t border-[#D4AF37]/20 flex flex-col gap-0.5 items-center text-center text-[#D4AF37] font-semibold tracking-wide shrink-0">
                    <span className="text-[9.5px] sm:text-[10px] font-serif font-black">वज्रनाद ढोल ताशा पथक ,बेळगाव</span>
                    <span className="text-[8px] sm:text-[8.5px] opacity-95 leading-tight font-medium">हृदयात घुमतो ज्याचा नाद, तो पथक म्हणजे वज्रनाद</span>
                  </div>
                </div>



                <p className="text-xs text-neutral-500 font-medium text-center px-6 leading-relaxed">
                  Present this secure permanent membership card to any scanning committee member to register practice or performance attendance.
                </p>
              </div>
            )}

            {/* TAB 3: ATTENDANCE HISTORY PANEL */}
            {activeTab === 'history' && (
              <div className="space-y-6">
                
                {/* Stats Dashboard Grid — two separate % cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white border border-[#D4AF37]/20 p-4 rounded-2xl shadow-sm text-center">
                    <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">Practice %</span>
                    <span className="text-2xl font-black text-[#800000]">{Math.round(stats.practicePct)}%</span>
                    <span className="text-[9px] text-neutral-400 block mt-0.5">{stats.practiceAttended} / {stats.practiceHeld} sessions</span>
                  </div>
                  <div className="bg-white border border-[#D4AF37]/20 p-4 rounded-2xl shadow-sm text-center">
                    <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">Performance %</span>
                    <span className="text-2xl font-black text-amber-700">{Math.round(stats.performancePct)}%</span>
                    <span className="text-[9px] text-neutral-400 block mt-0.5">{stats.performanceAttended} / {stats.performanceHeld} sessions</span>
                  </div>
                </div>

                {/* Subcounts — Practice and Performance only */}
                <div className="bg-white border border-[#D4AF37]/20 rounded-2xl p-4 grid grid-cols-2 gap-2 text-center text-xs font-bold">
                  <div>
                    <span className="text-[9px] text-neutral-400 block uppercase">Practice</span>
                    <span className="text-neutral-800">{stats.practiceAttended} Present</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-neutral-400 block uppercase">Performance</span>
                    <span className="text-neutral-800">{stats.performanceAttended} Present</span>
                  </div>
                </div>

                {renderMissedSessionsWidget()}

                {/* Calendar View Dates representation */}
                <div className="bg-white border border-neutral-200/80 rounded-2xl p-5 shadow-sm">
                  <h4 className="font-bold text-xs text-neutral-500 uppercase tracking-wider border-b border-neutral-100 pb-2 mb-3">
                    Attendance Calendar
                  </h4>
                  <div className="flex flex-wrap gap-2.5">
                    {calendarSessions.length === 0 ? (
                      <p className="text-xs text-neutral-400 italic">No scheduled sessions to log.</p>
                    ) : (
                      calendarSessions.map((s) => {
                        const isPresent = myRecords.some(r => r.sessionId === s.id);
                        return (
                          <div
                            key={s.id}
                            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                              isPresent
                                ? 'bg-green-50 border-green-200 text-green-800'
                                : 'bg-red-50 border-red-200 text-red-800'
                            }`}
                            title={`${s.title}: ${isPresent ? 'Present' : 'Absent'}`}
                          >
                            <span className="text-[9px] font-bold uppercase tracking-wider mb-1">{s.type[0]}</span>
                            <span className="text-sm font-mono font-extrabold">{s.date.split('-')[2]}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Last scan activity */}
                {lastAttendance && (
                  <div className="bg-white border border-[#D4AF37]/20 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                    <div>
                      <span className="text-[9px] text-neutral-400 font-bold uppercase block">Last Attendance</span>
                      <h4 className="font-bold text-neutral-800 text-sm mt-0.5">{lastAttendance.date} • {lastAttendance.scanTime}</h4>
                      <p className="text-[10px] text-[#800000] font-bold mt-0.5">{lastAttendance.type} Session Check-In</p>
                    </div>
                    <Award className="text-[#D4AF37] w-10 h-10 shrink-0" />
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: SCANNER PANEL */}
            {activeTab === 'scanner' && (
              <QRScannerComp currentUser={currentUser} />
            )}
          </div>
        )}
      </div>

      {/* Bottom Navigation Tab Bar (Floating app style) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200/80 px-4 py-2 z-40 flex justify-around max-w-md mx-auto rounded-t-2xl shadow-[0_-5px_15px_rgba(0,0,0,0.03)]">
        <button
          onClick={() => setActiveTab('qr')}
          className={`flex flex-col items-center p-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'qr' ? 'text-[#800000]' : 'text-neutral-400 hover:text-neutral-600'
          }`}
        >
          <QrCode size={20} />
          <span className="text-[9px] font-black uppercase mt-1">My QR</span>
        </button>

        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center p-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'home' ? 'text-[#800000]' : 'text-neutral-400 hover:text-neutral-600'
          }`}
        >
          <Megaphone size={20} />
          <span className="text-[9px] font-black uppercase mt-1">Feed</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center p-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'history' ? 'text-[#800000]' : 'text-neutral-400 hover:text-neutral-600'
          }`}
        >
          <Calendar size={20} />
          <span className="text-[9px] font-black uppercase mt-1">Logs</span>
        </button>

        {currentUser.scannerPermission && (
          <button
            onClick={() => setActiveTab('scanner')}
            className={`flex flex-col items-center p-2 rounded-xl transition-all cursor-pointer relative ${
              activeTab === 'scanner' ? 'text-[#800000]' : 'text-neutral-400 hover:text-neutral-600'
            }`}
          >
            <Camera size={20} />
            <span className="text-[9px] font-black uppercase mt-1">Scan</span>
            <span className="absolute top-1.5 right-4 w-1.5 h-1.5 bg-green-500 rounded-full" />
          </button>
        )}
      </div>

      {/* Profile Setup / Settings Fullscreen Overlay Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center"
          >
            <div className="w-full max-w-lg">
              <MemberProfileEdit
                member={currentUser}
                isInitialSetup={!currentUser.isDetailsFilled}
                onSave={handleSaveProfile}
                onClose={() => setShowSettings(false)}
              />
              
              {/* Request Instrument Change quick assistance for already-filled profiles */}
              {currentUser.isDetailsFilled && (
                <div className="bg-white border-t border-neutral-100 p-4 rounded-b-3xl -mt-6 border-2 border-[#D4AF37] border-t-0 text-center space-y-3">
                  <div className="w-12 h-0.5 bg-neutral-200 mx-auto" />
                  <p className="text-[10px] text-neutral-400 leading-normal">
                    <strong>Need Instrument Change?:</strong> You can select a target instrument below to send an administrative change request:
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {['Dhwaja Dharak', 'Dhol Vadak', 'Tasha Vadak', 'Toll Vadak', 'Volunteer'].map((inst) => (
                      <button
                        key={inst}
                        onClick={() => handleRequestInstrumentChange(inst as Instrument)}
                        className="text-[9px] font-bold bg-[#FFFDD0] text-[#800000] hover:bg-[#800000] hover:text-white transition-all py-1 px-2.5 rounded-full border border-[#D4AF37]/30 cursor-pointer"
                      >
                        {inst}
                      </button>
                    ))}
                  </div>
                  <p className="text-[8px] text-neutral-400 uppercase tracking-widest italic pt-1">
                    *Admin approval required for critical changes
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
    </div>
  );
}
