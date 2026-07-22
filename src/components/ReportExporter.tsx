import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { FileSpreadsheet, FileText, Image as ImageIcon, Download, CheckCircle, ArrowLeft } from 'lucide-react';
import html2canvasSafe from '../services/html2canvasSafe';
import jsPDF from 'jspdf';
import { AttendanceRecord, AttendanceSession } from '../types';
import VajranadLogo from './VajranadLogo';

interface ReportExporterProps {
  session: AttendanceSession;
  records: AttendanceRecord[];
  onBack: () => void;
}

export default function ReportExporter({ session, records, onBack }: ReportExporterProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  // Present members only
  const presentRecords = records.filter(r => r.sessionId === session.id);

  // Export to Excel (CSV format for complete compatibility and no extra heavy libraries)
  const handleExportCSV = () => {
    setExporting('CSV');
    setTimeout(() => {
      let csvContent = '\uFEFF'; // UTF-8 BOM for universal Excel encoding
      csvContent += `Vajranad Dhol Tasha Pathak, Belgav\n`;
      csvContent += `Attendance Report - ${session.title}\n`;
      csvContent += `Type: ${session.type}, Date: ${session.date} (${session.day})\n\n`;
      
      // Header
      csvContent += `"S.No.","Member Name","Instrument","Scan Time","Scanned By"\n`;

      // Rows
      presentRecords.forEach((rec, idx) => {
        csvContent += `${idx + 1},"${rec.memberName}","${rec.instrument}","${rec.scanTime}","${rec.scannedBy}"\n`;
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Vajranad_Attendance_${session.type}_${session.date}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setExporting(null);
    }, 600);
  };

  // Export to PDF using jsPDF + html2canvas
  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    setExporting('PDF');

    try {
      const element = reportRef.current;
      const canvas = await html2canvasSafe(element, {
        scale: 2, // High resolution
        useCORS: true,
        backgroundColor: '#FFFFFF'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210; // A4 size width in mm
      const pageHeight = 295; // A4 size height in mm
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

      pdf.save(`Vajranad_Attendance_${session.type}_${session.date}.pdf`);
    } catch (e) {
      console.error('Failed to generate PDF', e);
    } finally {
      setExporting(null);
    }
  };

  // Export to PNG Image using html2canvas
  const handleExportPNG = async () => {
    if (!reportRef.current) return;
    setExporting('PNG');

    try {
      const element = reportRef.current;
      const canvas = await html2canvasSafe(element, {
        scale: 2.5, // Ultra-high resolution image
        useCORS: true,
        backgroundColor: '#FFFFFF'
      });

      const imgData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.setAttribute('href', imgData);
      link.setAttribute('download', `Vajranad_Report_${session.type}_${session.date}.png`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('Failed to export image', e);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Exporter Controls bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-neutral-200 p-4 rounded-2xl shadow-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-900 font-bold transition-all bg-[#FAF6EE] border border-neutral-200 py-2 px-3 rounded-xl cursor-pointer"
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Excel Export */}
          <button
            onClick={handleExportCSV}
            disabled={exporting !== null}
            className="flex items-center gap-2 text-xs bg-[#2E7D32] hover:bg-[#1B5E20] text-white font-bold py-2 px-3 rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet size={14} />
            EXCEL (CSV)
          </button>
        </div>
      </div>

      {exporting && (
        <div className="bg-[#FFFDD0] border border-[#D4AF37]/30 rounded-xl p-3.5 text-center text-xs text-neutral-600 font-bold flex items-center justify-center gap-2 animate-pulse">
          <Download className="animate-bounce text-[#800000]" size={15} />
          Exporting to {exporting}... Please wait while compiling vector layouts.
        </div>
      )}

      {/* Report Sheet Printable Canvas Wrapper */}
      <div className="overflow-x-auto rounded-3xl border border-neutral-200 shadow-md">
        <div
          ref={reportRef}
          id="printable-report-sheet"
          className="bg-white text-neutral-800 p-8 min-w-[700px] max-w-[800px] mx-auto space-y-6"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          {/* Header Banner - Matches official Vajranad Branding */}
          <div className="border-b-4 border-double border-[#800000] pb-5 flex items-center gap-6 relative">
            <VajranadLogo size={100} animate={false} />
            
            <div className="flex-1 space-y-1">
              <h1 className="text-3xl font-black text-[#800000] tracking-wide font-serif leading-none uppercase">
                Vajranad Dhol Tasha Pathak
              </h1>
              <h2 className="text-sm font-black text-neutral-600 tracking-widest uppercase">
                Belgav, Karnataka
              </h2>
              <div className="text-xs text-neutral-600 font-bold mt-1">
                वज्रनाद ढोल ताशा पथक ,बेळगाव
              </div>
              <p className="text-[10px] text-neutral-400 italic">
                हृदयात घुमतो ज्याचा नाद, तो पथक म्हणजे वज्रनाद
              </p>
            </div>

            {/* Right corner metadata stamp */}
            <div className="text-right border-l border-neutral-200 pl-4 space-y-1">
              <span className="bg-[#800000] text-[#D4AF37] border border-[#D4AF37]/40 text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                {session.type}
              </span>
              <p className="text-[11px] font-bold text-neutral-700 mt-1">{session.date}</p>
              <p className="text-[10px] text-neutral-400 font-medium">{session.day}</p>
            </div>
          </div>

          {/* Session Overview Section */}
          <div className="bg-[#FFFDD0] border-2 border-[#D4AF37]/30 p-4 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-neutral-400 uppercase">Session Title</p>
              <h3 className="font-bold text-neutral-800 text-sm mt-0.5 font-serif">{session.title}</h3>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-neutral-400 uppercase">Present Members</p>
              <h3 className="font-bold text-[#800000] text-base mt-0.5 font-serif">{presentRecords.length} Present</h3>
            </div>
          </div>

          {/* Table */}
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-[#800000] bg-[#800000]/5 text-neutral-800">
                <th className="py-2.5 px-3 font-bold text-neutral-700 w-16">S.No.</th>
                <th className="py-2.5 px-3 font-bold text-neutral-700">Member Name</th>
                <th className="py-2.5 px-3 font-bold text-neutral-700">Instrument</th>
                <th className="py-2.5 px-3 font-bold text-neutral-700 w-32">Scan Time</th>
                <th className="py-2.5 px-3 font-bold text-neutral-700">Scanned By</th>
              </tr>
            </thead>
            <tbody>
              {presentRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center italic text-neutral-400 font-medium">
                    No attendance has been scanned for this session yet.
                  </td>
                </tr>
              ) : (
                presentRecords.map((rec, idx) => (
                  <tr
                    key={rec.id}
                    className="border-b border-neutral-100 hover:bg-neutral-50/50 transition-all font-medium text-neutral-700"
                  >
                    <td className="py-3 px-3 font-bold text-neutral-400">{idx + 1}</td>
                    <td className="py-3 px-3 font-bold text-neutral-800">{rec.memberName}</td>
                    <td className="py-3 px-3">
                      <span className="bg-[#FFFDD0] border border-[#D4AF37]/30 text-[#800000] font-bold px-2 py-0.5 rounded text-[10px]">
                        {rec.instrument}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-neutral-500">{rec.scanTime}</td>
                    <td className="py-3 px-3 text-neutral-500">{rec.scannedBy}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>



          {/* System generated watermark stamp */}
          <div className="pt-8 border-t border-neutral-100 flex items-center justify-between text-[9px] text-neutral-400 font-mono uppercase tracking-widest">
            <span>Report generated via Vajranad Digital Suite</span>
            <span>{new Date().toLocaleDateString()} {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
