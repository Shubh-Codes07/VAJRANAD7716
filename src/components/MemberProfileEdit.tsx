import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { User, Phone, MapPin, Calendar, Heart, Award, ShieldAlert, X, Save, AlertCircle, Upload, Lock, Camera } from 'lucide-react';
import { Member, Instrument, Gender, BloodGroup } from '../types';
import { store, calculateAge } from '../services/store';
import { storage } from '../services/firebase';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';

interface MemberProfileEditProps {
  member: Member;
  onSave: (updatedMember: Member) => void;
  onClose?: () => void;
  isInitialSetup?: boolean;
  isAdminEditing?: boolean;
}

const INSTRUMENTS: Instrument[] = [
  'Dhwaja Dharak',
  'Dhol Vadak',
  'Tasha Vadak',
  'Toll Vadak',
  'Volunteer',
  'Committee Member'
];

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function MemberProfileEdit({ 
  member, 
  onSave, 
  onClose, 
  isInitialSetup = false,
  isAdminEditing = false 
}: MemberProfileEditProps) {
  const [name, setName] = useState(member.name || '');
  const [profilePhoto, setProfilePhoto] = useState(member.profilePhoto || '');
  const [mobileNumber, setMobileNumber] = useState(member.mobileNumber || '');
  const [address, setAddress] = useState(member.address || '');
  const [dob, setDob] = useState(member.dob || '');
  const [gender, setGender] = useState<Gender>(member.gender || 'Male');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>(member.bloodGroup || 'O+');
  const [motherName, setMotherName] = useState(member.motherName || '');
  const [motherMobile, setMotherMobile] = useState(member.motherMobile || '');
  const [fatherName, setFatherName] = useState(member.fatherName || '');
  const [fatherMobile, setFatherMobile] = useState(member.fatherMobile || '');
  const [yearJoined, setYearJoined] = useState<number>(member.yearJoined || new Date().getFullYear());
  const [medicalIssue, setMedicalIssue] = useState<boolean>(member.medicalIssue || false);
  const [medicalIssueDescription, setMedicalIssueDescription] = useState(member.medicalIssueDescription || '');
  const [instrument, setInstrument] = useState<Instrument>(member.instrument || 'Dhol Vadak');
  const [editPassword, setEditPassword] = useState(member.password || '');
  const [selectedInstruments, setSelectedInstruments] = useState<Instrument[]>(
    member.instruments && member.instruments.length > 0 
      ? member.instruments 
      : member.instrument 
        ? [member.instrument] 
        : []
  );
  
  const [age, setAge] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (dob) {
      setAge(calculateAge(dob));
    }
  }, [dob]);

  const handlePhotoUpload = (file: File) => {
    if (!file) return;
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const max_size = 150; // Resizing to 150x150px for highly optimized, sharp avatars
          let width = img.width;
          let height = img.height;
          
          if (width > height) {
            if (width > max_size) {
              height *= max_size / width;
              width = max_size;
            }
          } else {
            if (height > max_size) {
              width *= max_size / height;
              height = max_size;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', 0.75); // 150px highly optimized avatar
            setProfilePhoto(compressed);
          } else {
            setProfilePhoto(e.target?.result as string);
          }
        };
        img.src = e.target.result as string;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handlePhotoUpload(e.dataTransfer.files[0]);
    }
  };

  const handleInstrumentToggle = (inst: Instrument) => {
    setSelectedInstruments(prev => {
      if (prev.includes(inst)) {
        return prev.filter(i => i !== inst);
      } else {
        return [...prev, inst];
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Dynamic field validation
    if (!name || !mobileNumber || !address || !dob || !motherName || !fatherName || !yearJoined) {
      setError('Please fill all required fields.');
      return;
    }

    if (selectedInstruments.length === 0) {
      setError('Please select at least one instrument.');
      return;
    }

    if (!profilePhoto) {
      setError('Please upload your profile photo.');
      return;
    }

    if (medicalIssue && !medicalIssueDescription.trim()) {
      setError('Please describe your medical issue.');
      return;
    }

    setShowConfirmDialog(true);
  };

  const handleProceedSave = async () => {
    setShowConfirmDialog(false);
    setIsSaving(true);
    
    let finalPhotoUrl = profilePhoto;
    
    if (profilePhoto.startsWith('data:image')) {
      try {
        const fileRef = ref(storage, `profiles/${member.id}_${Date.now()}.jpg`);
        await uploadString(fileRef, profilePhoto, 'data_url');
        finalPhotoUrl = await getDownloadURL(fileRef);
      } catch (err: any) {
        console.error('Failed to upload profile photo to Firebase:', err);
        setError('Failed to upload profile photo. Please ensure Firebase permissions are correctly set.');
        setIsSaving(false);
        return;
      }
    }

    const updatedMember: Member = {
      ...member,
      name,
      profilePhoto: finalPhotoUrl,
      mobileNumber,
      address,
      dob,
      gender,
      bloodGroup,
      motherName,
      motherMobile,
      fatherName,
      fatherMobile,
      yearJoined,
      medicalIssue,
      medicalIssueDescription: medicalIssue ? medicalIssueDescription : '',
      instrument: selectedInstruments[0] || 'Dhol Vadak',
      instruments: selectedInstruments,
      isDetailsFilled: true,
      password: isAdminEditing ? member.password : (editPassword.trim() || undefined),
      qrCode: member.qrCode || member.id // Generate permanent QR code
    };

    store.updateMember(updatedMember);
    setIsSaving(false);
    onSave(updatedMember);
  };

  return (
    <div className="bg-white rounded-[32px] border-4 border-double border-[#D4AF37] shadow-[0_15px_45px_rgba(128,0,0,0.08)] overflow-hidden">
      {/* Header */}
      <div className="bg-[#800000] text-[#D4AF37] px-6 py-4 flex items-center justify-between border-b-2 border-[#D4AF37]/30">
        <div>
          <h3 className="font-bold text-lg font-serif flex items-center gap-2">
            <User size={18} />
            {isInitialSetup ? 'Member Profile Setup' : 'Edit Profile Settings'}
          </h3>
          <p className="text-[10px] text-yellow-100 opacity-80 uppercase tracking-wider font-semibold">
            Vajranad Dhol Tasha Pathak, Belgav
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-all text-white hover:text-[#D4AF37] cursor-pointer">
            <X size={20} />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto bg-[#FFFDD0]/30">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-start gap-2 animate-bounce">
            <AlertCircle size={16} className="shrink-0 text-red-600 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isInitialSetup && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-start gap-2">
            <AlertCircle size={18} className="shrink-0 text-amber-600 mt-0.5" />
            <p>
              <strong>Notice:</strong> Please complete your profile details to activate your membership card and generate your <strong>Permanent QR Code</strong> for scanning attendance.
            </p>
          </div>
        )}

        {/* Profile Photo Upload Section */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-neutral-600 uppercase tracking-wide block text-center">
            Profile Photo *
          </label>
          <div className="flex flex-col items-center justify-center py-2">
            <div 
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="relative w-28 h-28 group cursor-pointer"
              onClick={() => document.getElementById('photo-upload-input')?.click()}
              title="Click or drag to upload photo"
            >
              {profilePhoto ? (
                <img
                  src={profilePhoto}
                  alt="Profile preview"
                  referrerPolicy="no-referrer"
                  className="w-28 h-28 rounded-full border-2 border-white shadow-md object-cover shrink-0 transition-opacity group-hover:opacity-90"
                />
              ) : (
                <div className="w-28 h-28 rounded-full bg-[#DFE5E7] flex items-end justify-center overflow-hidden border-2 border-white shadow-md shrink-0 relative transition-transform group-hover:scale-[1.02]">
                  <svg className="w-20 h-20 text-white translate-y-1.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
              )}


              
              {/* Camera icon at bottom right */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation(); // Prevent triggering the outer div click twice
                  document.getElementById('photo-upload-input')?.click();
                }}
                className="absolute bottom-0 right-0 bg-[#800000] hover:bg-[#a00000] text-[#D4AF37] p-2.5 rounded-full shadow-lg border-2 border-white transition-all hover:scale-110 active:scale-95 flex items-center justify-center cursor-pointer"
                title="Upload Photo"
              >
                <Camera size={16} />
              </button>
            </div>
            
            <p className="text-[11px] font-medium text-neutral-500 mt-2 text-center">
              Drag & drop photo here or click the camera to upload
            </p>
            <p className="text-[10px] text-neutral-400 mt-0.5 text-center">PNG, JPG, or JPEG formats supported.</p>

            <input
              id="photo-upload-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handlePhotoUpload(e.target.files[0]);
                }
              }}
            />
          </div>
        </div>

        {/* Personal Details Group */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold font-serif text-[#800000] border-b border-[#D4AF37]/20 pb-1.5 uppercase tracking-wider">
            1. Personal Details
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Full Name */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-neutral-500 uppercase">Full Name *</label>
              <div className="relative">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="First Middle Last Name"
                  className="w-full bg-white text-sm border border-neutral-200 focus:border-[#800000] rounded-xl px-4 py-2.5 outline-none transition-all text-neutral-800"
                  required
                />
              </div>
            </div>

            {/* Mobile Number */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-neutral-500 uppercase">Mobile Number *</label>
              <div className="relative">
                <Phone size={14} className="absolute left-3.5 top-3.5 text-neutral-400" />
                <input
                  type="tel"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="10-digit number"
                  maxLength={10}
                  className="w-full bg-white text-sm border border-neutral-200 focus:border-[#800000] rounded-xl pl-10 pr-4 py-2.5 outline-none transition-all text-neutral-800"
                  required
                />
              </div>
            </div>

            {/* Address */}
            <div className="space-y-1 md:col-span-2">
              <label className="text-[11px] font-bold text-neutral-500 uppercase">Address *</label>
              <div className="relative">
                <MapPin size={14} className="absolute left-3.5 top-3.5 text-neutral-400" />
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Full local residential address"
                  rows={2}
                  className="w-full bg-white text-sm border border-neutral-200 focus:border-[#800000] rounded-xl pl-10 pr-4 py-2 outline-none transition-all text-neutral-800"
                  required
                />
              </div>
            </div>

            {/* Date of Birth */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-neutral-500 uppercase">Date of Birth *</label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3.5 top-3.5 text-neutral-400" />
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="w-full bg-white text-sm border border-neutral-200 focus:border-[#800000] rounded-xl pl-10 pr-4 py-2.5 outline-none transition-all text-neutral-800"
                  required
                />
              </div>
            </div>

            {/* Age - Display only */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-neutral-500 uppercase">Calculated Age</label>
              <div className="w-full bg-neutral-100 text-neutral-600 text-sm border border-neutral-200 rounded-xl px-4 py-2.5 font-semibold">
                {dob ? `${age} Years Old` : 'Select Date of Birth'}
              </div>
            </div>

            {/* Gender */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-neutral-500 uppercase">Gender *</label>
              <div className="flex gap-4 py-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-700">
                  <input
                    type="radio"
                    name="gender"
                    checked={gender === 'Male'}
                    onChange={() => setGender('Male')}
                    className="accent-[#800000] w-4 h-4"
                  />
                  Male
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-700">
                  <input
                    type="radio"
                    name="gender"
                    checked={gender === 'Female'}
                    onChange={() => setGender('Female')}
                    className="accent-[#800000] w-4 h-4"
                  />
                  Female
                </label>
              </div>
            </div>

            {/* Blood Group */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-neutral-500 uppercase">Blood Group *</label>
              <select
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value as BloodGroup)}
                className="w-full bg-white text-sm border border-neutral-200 focus:border-[#800000] rounded-xl px-4 py-2.5 outline-none transition-all text-neutral-800 cursor-pointer"
              >
                {BLOOD_GROUPS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Family Details Group */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold font-serif text-[#800000] border-b border-[#D4AF37]/20 pb-1.5 uppercase tracking-wider">
            2. Family Details
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mother Name */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-neutral-500 uppercase">Mother's Name *</label>
              <input
                type="text"
                value={motherName}
                onChange={(e) => setMotherName(e.target.value)}
                placeholder="Full Mother's Name"
                className="w-full bg-white text-sm border border-neutral-200 focus:border-[#800000] rounded-xl px-4 py-2.5 outline-none transition-all text-neutral-800"
                required
              />
            </div>

            {/* Mother Mobile */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-neutral-500 uppercase">Mother's Mobile</label>
              <input
                type="tel"
                value={motherMobile}
                onChange={(e) => setMotherMobile(e.target.value)}
                placeholder="Optional"
                maxLength={10}
                className="w-full bg-white text-sm border border-neutral-200 focus:border-[#800000] rounded-xl px-4 py-2.5 outline-none transition-all text-neutral-800"
              />
            </div>

            {/* Father Name */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-neutral-500 uppercase">Father's Name *</label>
              <input
                type="text"
                value={fatherName}
                onChange={(e) => setFatherName(e.target.value)}
                placeholder="Full Father's Name"
                className="w-full bg-white text-sm border border-neutral-200 focus:border-[#800000] rounded-xl px-4 py-2.5 outline-none transition-all text-neutral-800"
                required
              />
            </div>

            {/* Father Mobile */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-neutral-500 uppercase">Father's Mobile</label>
              <input
                type="tel"
                value={fatherMobile}
                onChange={(e) => setFatherMobile(e.target.value)}
                placeholder="Optional"
                maxLength={10}
                className="w-full bg-white text-sm border border-neutral-200 focus:border-[#800000] rounded-xl px-4 py-2.5 outline-none transition-all text-neutral-800"
              />
            </div>
          </div>
        </div>

        {/* Pathak / Instrument Details Group */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold font-serif text-[#800000] border-b border-[#D4AF37]/20 pb-1.5 uppercase tracking-wider">
            3. Pathak Details
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Registered Instruments */}
            <div className="space-y-2 col-span-1 md:col-span-2">
              <label className="text-[11px] font-bold text-neutral-500 uppercase flex items-center gap-1">
                <Award size={12} className="text-[#800000]" />
                Registered Instruments (Can select multiple) *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {INSTRUMENTS.map((inst) => {
                  const isChecked = selectedInstruments.includes(inst);
                  return (
                    <button
                      key={inst}
                      type="button"
                      onClick={() => handleInstrumentToggle(inst)}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                        isChecked
                          ? 'bg-[#800000] text-[#D4AF37] border-[#D4AF37] shadow-sm'
                          : 'bg-white text-neutral-600 border-neutral-200 hover:bg-[#FFFDD0]/30'
                      }`}
                    >
                      <span>{inst === 'Dhol Vadak' ? '🥁 Dhol Vadak' : inst === 'Tasha Vadak' ? '👑 Tasha Vadak' : inst === 'Toll Vadak' ? '🔔 Toll Vadak' : inst === 'Dhwaja Dharak' ? '🚩 Dhwaja Dharak' : inst === 'Committee Member' ? '💼 Committee' : '🤝 Volunteer'}</span>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        className="accent-[#D4AF37] h-3.5 w-3.5 shrink-0 ml-1.5 pointer-events-none"
                      />
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-neutral-400 font-semibold italic mt-1">
                You can register for more than one instrument. At least one must be selected.
              </p>
            </div>

            {/* Year Joined */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-neutral-500 uppercase">Year Joined *</label>
              <input
                type="number"
                value={yearJoined}
                onChange={(e) => setYearJoined(parseInt(e.target.value) || new Date().getFullYear())}
                min={2000}
                max={new Date().getFullYear()}
                className="w-full bg-white text-sm border border-neutral-200 focus:border-[#800000] rounded-xl px-4 py-2.5 outline-none transition-all text-neutral-800"
                required
              />
            </div>
          </div>
        </div>

        {/* Medical Issue Group */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold font-serif text-[#800000] border-b border-[#D4AF37]/20 pb-1.5 uppercase tracking-wider">
            4. Medical Information
          </h4>
          
          <div className="space-y-3">
            {/* Medical Issue toggle */}
            <div className="flex items-center justify-between bg-neutral-50 p-3 rounded-xl border border-neutral-200">
              <div>
                <label className="text-xs font-bold text-neutral-700 block">Do you have any medical issues or physical limitations?</label>
                <p className="text-[10px] text-neutral-400">If yes, please enable this option and describe below.</p>
              </div>
              <button
                type="button"
                onClick={() => setMedicalIssue(!medicalIssue)}
                className={`w-12 h-6 rounded-full p-1 transition-all cursor-pointer ${
                  medicalIssue ? 'bg-[#800000]' : 'bg-neutral-300'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-all transform ${
                    medicalIssue ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Description box */}
            {medicalIssue && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-1"
              >
                <label className="text-[11px] font-bold text-neutral-500 uppercase">Describe Medical Issue *</label>
                <textarea
                  value={medicalIssueDescription}
                  onChange={(e) => setMedicalIssueDescription(e.target.value)}
                  placeholder="Please specify medical issue, daily medications, or things to keep in mind."
                  rows={3}
                  className="w-full bg-white text-sm border border-red-200 focus:border-red-500 rounded-xl px-4 py-2 outline-none transition-all text-neutral-800"
                  required
                />
              </motion.div>
            )}
          </div>
        </div>

        {/* Password / Credentials Group */}
        {!isAdminEditing && (
          <div className="space-y-4">
            <h4 className="text-xs font-bold font-serif text-[#800000] border-b border-[#D4AF37]/20 pb-1.5 uppercase tracking-wider flex items-center gap-1.5">
              <Lock size={12} className="text-[#800000]" />
              5. Login Credentials
            </h4>
            
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-neutral-500 uppercase">Change Account Password *</label>
              <input
                type="text"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="Enter a secure login password"
                className="w-full bg-white text-sm border border-neutral-200 focus:border-[#800000] rounded-xl px-4 py-2.5 outline-none transition-all text-neutral-800"
                required
              />
              <p className="text-[10px] text-neutral-400 font-semibold italic mt-1">
                Your password is encrypted locally. You will use this password to log in next time.
              </p>
            </div>
          </div>
        )}

        {/* Submit / Cancel Actions */}
        <div className="pt-4 border-t border-neutral-200 flex flex-col sm:flex-row gap-3">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold py-3 px-4 rounded-xl text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer order-2 sm:order-1"
            >
              Fill Details Later
            </button>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="flex-1 bg-[#800000] hover:bg-[#5d0000] text-[#D4AF37] border-2 border-[#D4AF37] hover:border-white font-bold py-3 px-4 rounded-xl text-sm uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer order-1 sm:order-2 disabled:opacity-75"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save size={18} />
            )}
            {isSaving ? 'SAVING PROFILE...' : (isInitialSetup ? 'SAVE DETAILS & GENERATE QR CARD' : 'SAVE CHANGES')}
          </button>
        </div>
      </form>

      {/* Confirmation Popup Modal */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#FFFDD0] border-4 border-double border-[#D4AF37] rounded-3xl p-6 max-w-md w-full shadow-2xl text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-amber-100 text-[#800000] rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={28} />
            </div>
            <h4 className="font-bold text-[#800000] font-serif text-lg">Confirm Registration Details</h4>
            <p className="text-xs text-neutral-600 leading-relaxed font-semibold">
              "Once you click Proceed, these details will be saved permanently and cannot be edited later.
              <br />
              If you are sure, click Proceed to continue."
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProceedSave}
                className="flex-1 bg-[#800000] hover:bg-[#5d0000] text-[#D4AF37] border border-[#D4AF37]/30 font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
