import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  AlertTriangle, 
  CheckCircle2, 
  HelpCircle, 
  UserX, 
  RefreshCw
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { store } from '../services/store';
import { Member, AttendanceType, AttendanceSession, AttendanceRecord } from '../types';

interface QRScannerCompProps {
  currentUser: Member;
  onScanComplete?: (record: AttendanceRecord) => void;
}

export default function QRScannerComp({ currentUser, onScanComplete }: QRScannerCompProps) {
  const hasPermission = currentUser.scannerPermission; // Authorized to scan attendance
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [showTypeSelectorModal, setShowTypeSelectorModal] = useState(false);
  
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    alreadyMarked?: boolean;
    record?: AttendanceRecord;
    member?: Member;
    error?: string;
  } | null>(null);

  // Camera settings states
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const lastScannedCodeRef = useRef<{ code: string; time: number } | null>(null);

  // Load active session on mount
  useEffect(() => {
    setActiveSession(store.getActiveSession());
  }, []);

  // Query and list available cameras when entering Camera Scanner
  useEffect(() => {
    if (scannerActive) {
      setIsStartingCamera(true);
      setCameraError(null);
      
      const timer = setTimeout(() => {
        Html5Qrcode.getCameras()
          .then((devices) => {
            if (devices && devices.length > 0) {
              setCameras(devices);
              
              // Try to find a back/rear camera by default
              const backCamera = devices.find(d => 
                d.label.toLowerCase().includes('back') || 
                d.label.toLowerCase().includes('rear') || 
                d.label.toLowerCase().includes('environment') ||
                d.label.toLowerCase().includes('facing back')
              );
              
              setSelectedCameraId(backCamera ? backCamera.id : devices[0].id);
            } else {
              setCameraError("No hardware camera devices detected on this device.");
            }
          })
          .catch((err) => {
            console.error("Camera permission or retrieval error:", err);
            setCameraError("Could not retrieve camera devices. Please enable camera permissions in your browser.");
          })
          .finally(() => {
            setIsStartingCamera(false);
          });
      }, 350);

      return () => clearTimeout(timer);
    }
  }, [scannerActive]);

  // Handle active camera streaming logic
  useEffect(() => {
    let activeScanner: Html5Qrcode | null = null;
    let isStopped = false;

    if (scannerActive && selectedCameraId) {
      const startCamera = async () => {
        const readerElement = document.getElementById("camera-qr-reader");
        if (!readerElement) return;

        try {
          const qrCodeInstance = new Html5Qrcode("camera-qr-reader");
          html5QrCodeRef.current = qrCodeInstance;
          activeScanner = qrCodeInstance;

          await qrCodeInstance.start(
            selectedCameraId,
            {
              fps: 15,
              qrbox: (width, height) => {
                const size = Math.min(width, height) * 0.75;
                return { width: size, height: size };
              }
            },
            (decodedText) => {
              if (!isStopped) {
                handleQRScanned(decodedText);
              }
            },
            () => {
              // Continuous scanner verbose logs (safe to suppress)
            }
          );
        } catch (err: any) {
          console.error("Failed to start primary camera, falling back to facingMode...", err);
          
          // Secondary fallback using environment string directly
          try {
            if (activeScanner) {
              await activeScanner.start(
                { facingMode: "environment" },
                { fps: 15, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                  if (!isStopped) {
                    handleQRScanned(decodedText);
                  }
                },
                () => {}
              );
            }
          } catch (fallbackErr) {
            setCameraError("Camera is busy or access is blocked. Please check browser permissions or select another camera.");
          }
        }
      };

      startCamera();
    }

    return () => {
      isStopped = true;
      if (activeScanner) {
        if (activeScanner.isScanning) {
          activeScanner.stop().catch(err => console.warn("Scanner stopped with warning:", err));
        }
        html5QrCodeRef.current = null;
      }
    };
  }, [scannerActive, selectedCameraId]);

  // Quick Start a scanning session from modal selection
  const handleQuickStartSession = async (type: AttendanceType) => {
    if (!hasPermission) {
      alert('You are not authorized to scan attendance.');
      return;
    }

    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date();
    const dayStr = weekdays[today.getDay()];
    const dateStr = today.toLocaleDateString();

    let title = '';
    if (type === 'Practice') {
      title = `Practice Session - ${dateStr} (${dayStr})`;
    } else if (type === 'Performance') {
      title = `Vadan Session - ${dateStr} (${dayStr})`;
    } else {
      title = `Maintenance & Meeting - ${dateStr} (${dayStr})`;
    }

    console.log(`[QR SCANNER] Starting/joining ${type} session...`);
    const session = await store.createOrJoinSession(type, title, currentUser.name);
    console.log(`[QR SCANNER] Session ready: id=${session.id}, createdBy=${session.createdBy}`);
    setActiveSession(session);
    setScannerActive(true);
    setShowTypeSelectorModal(false);
  };

  // Process any scanned/decoded QR text
  const handleQRScanned = (qrCode: string) => {
    if (!activeSession) return;
    
    // Check authorization
    if (!hasPermission) {
      setScanResult({
        success: false,
        error: "You are not authorized to scan attendance."
      });
      return;
    }

    // Prevent rapid duplicate scans of the exact same member within 4 seconds
    const now = Date.now();
    if (lastScannedCodeRef.current && lastScannedCodeRef.current.code === qrCode && (now - lastScannedCodeRef.current.time) < 4000) {
      return;
    }
    lastScannedCodeRef.current = { code: qrCode, time: now };

    const result = store.markAttendance(qrCode, activeSession.id, currentUser.name);
    setScanResult(result);

    if (result.success && result.record && onScanComplete) {
      onScanComplete(result.record);
    }

    // Auto-clear feedback banner after 3.5 seconds to prepare for next scan
    setTimeout(() => {
      setScanResult((prev) => {
        // Only clear if it's not a duplicate block modal (which user should manual-close)
        if (prev && prev.alreadyMarked) {
          return prev;
        }
        return null;
      });
    }, 3500);
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Keyframes for viewport laser line */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scan-laser {
          0% { top: 12%; }
          50% { top: 88%; }
          100% { top: 12%; }
        }
      `}} />

      {/* Access Guard (visual banner) */}
      {!hasPermission && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-5 rounded-2xl flex flex-col items-center text-center gap-2">
          <UserX size={44} className="text-red-600 animate-pulse" />
          <h4 className="font-bold text-base font-sans">Scanner Permission Denied</h4>
          <p className="text-xs text-red-600/80 max-w-sm">
            You are not authorized to scan attendance. Please request the committee or admin to enable scanner permission for your profile.
          </p>
        </div>
      )}

      {hasPermission && (
        <div className="grid grid-cols-1 gap-6">
          
          {/* No active session layout - Single "Scanner" Button */}
          {!scannerActive ? (
            <div className="bg-white border-2 border-[#D4AF37]/30 rounded-[24px] p-8 shadow-md text-center flex flex-col items-center justify-center space-y-6 min-h-[250px]">
              <div className="w-16 h-16 bg-[#FFFDD0] rounded-full border-2 border-[#D4AF37] flex items-center justify-center text-[#800000] shadow-sm animate-pulse">
                <Camera size={32} />
              </div>
              <div className="space-y-2 max-w-sm">
                <h3 className="font-bold text-xl text-neutral-800 font-serif">Attendance QR Scanner</h3>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Start scanning members' physical or digital QR identity cards to log attendance instantly.
                </p>
              </div>

              <button
                onClick={() => setShowTypeSelectorModal(true)}
                className="bg-[#800000] hover:bg-[#5d0000] text-[#D4AF37] border-2 border-[#D4AF37] font-extrabold py-4 px-8 rounded-2xl text-sm uppercase tracking-wider transition-all shadow-lg hover:scale-[1.02] active:scale-95 cursor-pointer flex items-center gap-2.5 animate-bounce"
              >
                <Camera size={18} />
                Open Scanner
              </button>
            </div>
          ) : (
            /* Active scanning session */
            <div className="space-y-6">
              
              {/* Session Status Bar */}
              <div className="bg-[#800000] text-[#D4AF37] px-5 py-4 rounded-2xl flex items-center justify-between border-2 border-double border-[#D4AF37] shadow-lg">
                <div>
                  <span className="bg-[#D4AF37] text-neutral-900 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider mr-2">
                    ACTIVE • {activeSession?.type === 'Practice' ? 'Practice' : activeSession?.type === 'Performance' ? 'Vadan' : 'Meeting'}
                  </span>
                  <h4 className="font-bold text-sm text-white font-serif mt-1.5">{activeSession?.title}</h4>
                  <p className="text-[10px] text-yellow-100 opacity-80 mt-0.5 font-semibold">Operator: {currentUser.name}</p>
                </div>
                
                <button
                  onClick={() => {
                    setScannerActive(false);
                    setActiveSession(null);
                  }}
                  className="bg-[#D4AF37] hover:bg-[#ffe284] text-neutral-950 font-extrabold px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-all border border-[#D4AF37]/30 cursor-pointer"
                >
                  Change Mode
                </button>
              </div>

              {/* Scan feedback animated banner overlay (Successful Scans / Errors) */}
              <AnimatePresence>
                {scanResult && !scanResult.alreadyMarked && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="overflow-hidden"
                  >
                    {scanResult.success ? (
                      <div className="p-5 rounded-2xl border bg-green-50 border-green-300 text-green-900 flex flex-col items-center justify-center text-center shadow-lg relative">
                        <div className="flex flex-col items-center">
                          <CheckCircle2 className="text-green-500 w-12 h-12 mb-2 animate-bounce" />
                          <h4 className="font-bold text-base font-sans">Attendance Scanned!</h4>
                          <p className="text-xs text-green-700 font-medium">Check-In logged successfully with a green tick!</p>
                        </div>

                        {scanResult.member && (
                          <div className="mt-4 flex flex-col items-center bg-white/95 p-5 rounded-2xl border-2 border-[#D4AF37] w-full max-w-sm shadow-md">
                            <div className="relative">
                              <img
                                src={scanResult.member.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80'}
                                alt={scanResult.member.name}
                                referrerPolicy="no-referrer"
                                className="w-24 h-24 rounded-full border-4 border-[#800000] object-cover shadow-md mx-auto"
                              />
                              <div className="absolute -bottom-1 -right-1 text-white rounded-full p-1.5 border-2 border-white shadow bg-green-500">
                                <CheckCircle2 size={16} />
                              </div>
                            </div>
                            <div className="text-center mt-3 space-y-1">
                              <h5 className="font-extrabold text-neutral-900 text-base font-serif">{scanResult.member.name}</h5>
                              <span className="inline-block border text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider bg-[#800000] text-[#D4AF37] border-[#D4AF37]/30">
                                {scanResult.member.instrument}
                              </span>
                              <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider pt-1">
                                CHECK-IN TIME: {scanResult.record?.scanTime || 'Just Now'}
                              </p>
                              <p className="text-[9px] text-neutral-400">
                                Permanent QR Code Verified
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-4 bg-red-50 border border-red-300 rounded-2xl text-red-900 text-sm font-semibold flex items-center gap-2">
                        <AlertTriangle className="text-red-500 shrink-0" size={20} />
                        <span>{scanResult.error}</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Already Marked Warning Modal Popup (Operator must acknowledge) */}
              <AnimatePresence>
                {scanResult && scanResult.alreadyMarked && (
                  <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 15 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 15 }}
                      className="bg-white border-2 border-amber-500 rounded-[28px] max-w-sm w-full overflow-hidden shadow-2xl p-6 text-center space-y-4"
                    >
                      <div className="w-16 h-16 bg-amber-50 border border-amber-200 rounded-full flex items-center justify-center text-amber-500 mx-auto animate-bounce">
                        <AlertTriangle size={36} />
                      </div>
                      
                      <div className="space-y-1">
                        <h3 className="font-black text-lg text-amber-800 font-serif uppercase tracking-wide">Already Marked!</h3>
                        <p className="text-xs text-neutral-500 font-bold uppercase tracking-wider">
                          Session: <span className="text-[#800000]">{activeSession?.type === 'Practice' ? 'Practice' : activeSession?.type === 'Performance' ? 'Vadan' : 'Meeting'}</span>
                        </p>
                        <p className="text-[11px] text-amber-700 font-medium leading-normal bg-amber-50 border border-amber-100 p-2.5 rounded-xl mt-2">
                          ⚠️ This member's attendance was already registered today for the <strong>{activeSession?.type === 'Practice' ? 'Practice' : activeSession?.type === 'Performance' ? 'Vadan' : 'Meeting'}</strong> session. One scan per day is allowed for each category.
                        </p>
                      </div>

                      {scanResult.member && (
                        <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-3 flex items-center gap-3 text-left">
                          <img
                            src={scanResult.member.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80'}
                            alt={scanResult.member.name}
                            referrerPolicy="no-referrer"
                            className="w-12 h-12 rounded-full object-cover border border-neutral-200 shadow-sm"
                          />
                          <div className="flex-1 min-w-0">
                            <h5 className="font-extrabold text-xs text-neutral-800 truncate font-serif">{scanResult.member.name}</h5>
                            <p className="text-[9px] text-neutral-400 font-bold uppercase">{scanResult.member.instrument}</p>
                            <p className="text-[9px] text-[#800000] font-bold mt-1 uppercase">
                              Previously logged: {scanResult.record?.scanTime || 'Today'}
                            </p>
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setScanResult(null)}
                        className="w-full bg-[#800000] hover:bg-[#5d0000] text-white font-extrabold py-3 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer border border-[#D4AF37]/30"
                      >
                        OK, Continue Scanning
                      </button>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              {/* QR Workspace Container */}
              <div className="bg-white border-2 border-[#D4AF37]/20 rounded-3xl shadow-sm overflow-hidden flex flex-col">
                
                <div className="border-b border-neutral-100 bg-[#FFFDD0]/20 py-4 px-6 text-center">
                  <h4 className="text-sm font-bold text-[#800000] font-serif">Live Device Camera Feed</h4>
                  <p className="text-[10px] text-neutral-400 mt-0.5">Please allow camera permissions if prompted</p>
                </div>

                {/* Content wrapper */}
                <div className="p-6 flex flex-col items-center">
                  
                  <div className="w-full max-w-sm flex flex-col items-center space-y-4">
                    
                    {/* Camera Selector drop-down (Solves switching issues instantly) */}
                    {cameras.length > 1 && (
                      <div className="w-full space-y-1">
                        <label className="text-[10px] text-neutral-400 font-extrabold uppercase tracking-wider block">
                          Active Camera Input Device:
                        </label>
                        <select
                          value={selectedCameraId}
                          onChange={(e) => setSelectedCameraId(e.target.value)}
                          className="w-full bg-white border border-neutral-200 rounded-xl py-2 px-3 text-xs font-bold text-[#800000] focus:outline-none focus:ring-1 focus:ring-[#800000]"
                        >
                          {cameras.map((cam) => (
                            <option key={cam.id} value={cam.id}>
                              {cam.label || `Camera ${cameras.indexOf(cam) + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Viewport Frame with Scanner Overlay styling */}
                    <div className="relative w-full aspect-square bg-neutral-950 rounded-2xl overflow-hidden border-2 border-dashed border-[#D4AF37]/50 shadow-inner flex items-center justify-center">
                      
                      {/* Hidden/Empty default fallback when loading or in error state */}
                      <div 
                        id="camera-qr-reader" 
                        className="absolute inset-0 w-full h-full [&_video]:object-cover [&_video]:w-full [&_video]:h-full" 
                      />

                      {isStartingCamera && (
                        <div className="absolute inset-0 bg-neutral-950 flex flex-col items-center justify-center text-center p-4 space-y-2 z-10">
                          <RefreshCw className="text-[#D4AF37] animate-spin w-8 h-8" />
                          <p className="text-xs text-yellow-100/80 font-bold uppercase tracking-wider">Accessing Device Camera...</p>
                        </div>
                      )}

                      {cameraError && (
                        <div className="absolute inset-0 bg-neutral-950/95 flex flex-col items-center justify-center text-center p-6 space-y-3 z-10">
                          <AlertTriangle className="text-amber-500 w-10 h-10 animate-bounce" />
                          <div className="space-y-1">
                            <h5 className="text-sm font-bold text-white">Camera Access Error</h5>
                            <p className="text-[10px] text-neutral-400 max-w-xs leading-relaxed">{cameraError}</p>
                          </div>
                        </div>
                      )}

                      {/* Animated Laser Overlay */}
                      {!cameraError && !isStartingCamera && (
                        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
                          <div className="w-[75%] h-[75%] border-2 border-dashed border-[#D4AF37]/50 rounded-xl relative flex items-center justify-center">
                            {/* Glowing Red Laser Line */}
                            <div className="absolute left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent animate-pulse" style={{
                              animation: 'scan-laser 2s infinite ease-in-out',
                            }} />
                            
                            {/* Viewfinder Corners */}
                            <div className="absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 border-[#D4AF37]" />
                            <div className="absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 border-[#D4AF37]" />
                            <div className="absolute bottom-0 left-0 w-5 h-5 border-b-4 border-l-4 border-[#D4AF37]" />
                            <div className="absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 border-[#D4AF37]" />
                          </div>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-neutral-400 text-center flex items-center justify-center gap-1 leading-normal max-w-xs">
                      <HelpCircle size={12} className="shrink-0 text-neutral-400" /> 
                      <span>Position the member's permanent QR card inside the frame to scan instantly.</span>
                    </p>
                  </div>

                </div>

              </div>

            </div>
          )}
        </div>
      )}

      {/* 3-Tab Scanning Type Selector Modal */}
      <AnimatePresence>
        {showTypeSelectorModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border-2 border-[#D4AF37] rounded-[28px] max-w-md w-full overflow-hidden shadow-2xl"
            >
              <div className="bg-[#800000] text-[#D4AF37] px-6 py-5 border-b-2 border-[#D4AF37] text-center relative">
                <h3 className="font-black text-lg font-serif uppercase tracking-wide">Select Scanning Type</h3>
                <p className="text-[11px] text-white/80 font-bold uppercase tracking-widest mt-1">Vajranad Digital Portal</p>
              </div>              <div className="p-6 space-y-4 bg-neutral-50">
                <div className="bg-[#FFFDD0] border border-[#D4AF37]/30 text-[#800000] p-3 rounded-xl text-[11px] leading-normal font-medium mb-1">
                  💡 <strong>Daily Session Limit:</strong> Only one attendance report is created per calendar day for each category. Opening a category that already has a session today will resume/reopen it instead of creating duplicates.
                </div>

                <div className="flex flex-col gap-3">
                  {/* Option 1: Practice Scanning */}
                  <button
                    onClick={() => handleQuickStartSession('Practice')}
                    className="w-full bg-white hover:bg-[#FFFDD0]/30 border border-neutral-200 hover:border-[#D4AF37] text-left p-4 rounded-2xl shadow-xs transition-all cursor-pointer group flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-serif">🥁</span>
                      <div>
                        <h4 className="font-extrabold text-[#800000] text-sm group-hover:underline">Practice Scanning</h4>
                        <p className="text-[10px] text-neutral-400 font-medium">Log/resume today's single Practice session report</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-[#800000] bg-[#FFFDD0] px-3 py-1 rounded-full border border-[#D4AF37]/20 uppercase">Select</span>
                  </button>
 
                  {/* Option 2: Vadan Scanning */}
                  <button
                    onClick={() => handleQuickStartSession('Performance')}
                    className="w-full bg-white hover:bg-[#FFFDD0]/30 border border-neutral-200 hover:border-[#D4AF37] text-left p-4 rounded-2xl shadow-xs transition-all cursor-pointer group flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-serif">👑</span>
                      <div>
                        <h4 className="font-extrabold text-[#800000] text-sm group-hover:underline">Vadan Scanning</h4>
                        <p className="text-[10px] text-neutral-400 font-medium">Log/resume today's single Performance session report</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-[#800000] bg-[#FFFDD0] px-3 py-1 rounded-full border border-[#D4AF37]/20 uppercase">Select</span>
                  </button>
 
                  {/* Option 3: Maintenance/Meeting Scanning */}
                  <button
                    onClick={() => handleQuickStartSession('Meeting')}
                    className="w-full bg-white hover:bg-[#FFFDD0]/30 border border-neutral-200 hover:border-[#D4AF37] text-left p-4 rounded-2xl shadow-xs transition-all cursor-pointer group flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-serif">🤝</span>
                      <div>
                        <h4 className="font-extrabold text-[#800000] text-sm group-hover:underline">Maintenance / Meeting Scanning</h4>
                        <p className="text-[10px] text-neutral-400 font-medium">Log/resume today's single Meeting session report</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-[#800000] bg-[#FFFDD0] px-3 py-1 rounded-full border border-[#D4AF37]/20 uppercase">Select</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowTypeSelectorModal(false)}
                  className="w-full text-center py-2.5 text-xs text-neutral-500 hover:text-neutral-800 font-bold transition-all mt-2 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
