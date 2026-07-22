import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, UserPlus, Mail, Lock, User, ShieldAlert, Sparkles, X, Key, Fingerprint, Eye, EyeOff } from 'lucide-react';
import VajranadLogo from './VajranadLogo';
import { store } from '../services/store';
import { Member } from '../types';

interface LoginFormProps {
  onAuthSuccess: (member: Member) => void;
}

export default function LoginForm({ onAuthSuccess }: LoginFormProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pathakId, setPathakId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // OTP-specific states
  const [isSignupOtpSent, setIsSignupOtpSent] = useState(false);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [signupOtp, setSignupOtp] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [isSendingSignupOtp, setIsSendingSignupOtp] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);

  // Secure admin modal state
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminId, setAdminId] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const handleAdminLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError(null);

    // Validate admin credentials:
    // USERNAME: ZHENDE PARSHURAM
    // ID: VAJRAnad_7716
    // password: KINGofNORTH
    const isCorrectUsername = adminUsername.trim().toUpperCase() === 'ZHENDE PARSHURAM';
    const isCorrectId = adminId.trim().toUpperCase() === 'VAJRANAD_7716';
    const isCorrectPassword = adminPassword.trim() === 'KINGofNORTH';

    if (isCorrectUsername && isCorrectId && isCorrectPassword) {
      // Login with system administrator privileges via the secret route
      const result = store.login('admin@vajranad.com', 'admin123', true);
      if (result.success && result.member) {
        onAuthSuccess(result.member);
        setShowAdminModal(false);
      } else {
        setAdminError('Failed to initiate administrator session.');
      }
    } else {
      setAdminError('Invalid administrator details! Access denied.');
    }
  };

  const handleSendSignupOtp = async () => {
    setError(null);
    setIsSendingSignupOtp(true);

    if (!name || !email || !pathakId) {
      setError('Please fill in Full Name, Pathak ID, and Email Address first.');
      setIsSendingSignupOtp(false);
      return;
    }

    if (pathakId.trim() !== 'VDTP@772016_BGM') {
      setError('Invalid PATHAK ID! You must enter the correct ID for Vajranad Dhol Tasha Pathak to register.');
      setIsSendingSignupOtp(false);
      return;
    }

    // Validate signup constraints (e.g. email must be unique)
    const members = store.getMembers();
    const normEmail = email.trim().toLowerCase();
    if (members.some(m => m.email.toLowerCase() === normEmail)) {
      setError('An account with this email already exists.');
      setIsSendingSignupOtp(false);
      return;
    }

    // Request backend to send a secure 6-digit OTP code to email
    try {
      const response = await fetch('/api/otp/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: normEmail,
          name: name.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        setError(data.error || 'Failed to send verification email. Please check your connection and try again.');
        setIsSendingSignupOtp(false);
        return;
      }

      setIsSignupOtpSent(true);
      setError(null);
      setSignupOtp('');
      if (data.warning) {
        setOtpNotice(data.message);
      } else {
        setOtpNotice(null);
      }
    } catch (err: any) {
      console.error('OTP Send error:', err);
      setError('Error connecting to authentication service. Please try again.');
    } finally {
      setIsSendingSignupOtp(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isLogin) {
      setLoading(true);
      if (!email || !password) {
        setError('Please fill in both email and password.');
        setLoading(false);
        return;
      }

      // Check if it's admin or regular login
      const result = store.login(email, password);
      if (result.success && result.member) {
        onAuthSuccess(result.member);
      } else {
        setError(result.error || 'Authentication failed. Incorrect email or password.');
        setLoading(false);
      }
    } else {
      // Sign Up verification & creation
      if (!isSignupOtpSent) {
        setError('Please fill in details and click "Send OTP" first.');
        return;
      }

      if (!signupOtp || signupOtp.trim().length !== 6) {
        setError('Please enter the 6-digit OTP code sent to your email.');
        return;
      }

      if (!signupPassword || signupPassword.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }

      if (signupPassword !== signupConfirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      setLoading(true);

      // Verify OTP and then sign up
      try {
        const response = await fetch('/api/otp/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            otp: signupOtp.trim()
          }),
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          setError(data.error || 'Invalid or expired OTP code. Please request a new one.');
          setLoading(false);
          return;
        }

        // Create member with verified password
        const result = store.signup(name, email, signupPassword);
        if (result.success && result.member) {
          onAuthSuccess(result.member);
        } else {
          setError(result.error || 'Registration failed.');
        }
      } catch (err) {
        console.error('Signup OTP verify error:', err);
        setError('Network error occurred during verification. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div
      id="login-screen"
      className="min-h-screen bg-[#FFFDD0] flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden"
    >
      {/* Decorative Traditional Royal Maroon and Gold Accents */}
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#D4AF37] via-[#800000] to-[#D4AF37]" />
      <div className="absolute -top-20 -left-20 w-48 h-48 rounded-full bg-[#800000] opacity-[0.04] pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full bg-[#D4AF37] opacity-[0.04] pointer-events-none" />

      {/* Main Container with Rounded Corners and Artistic Shadow */}
      <div className="w-full max-w-md bg-white rounded-[32px] border-4 border-double border-[#D4AF37] p-8 shadow-[0_20px_50px_rgba(128,0,0,0.08)] backdrop-blur-sm relative z-10">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="mb-4"
          >
            <VajranadLogo size={140} animate={true} />
          </motion.div>
          
          <h2 className="text-2xl font-bold font-serif tracking-wide text-[#800000] uppercase mt-1">
            Vajranad Dhol Tasha Pathak
          </h2>
          <p className="text-xs text-[#D4AF37] font-black tracking-widest uppercase mt-0.5">
            Belgav
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex bg-[#FFFDD0]/60 rounded-xl p-1 mb-6 border border-[#D4AF37]/20">
          <button
            type="button"
            onClick={() => { setIsLogin(true); setError(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${
              isLogin
                ? 'bg-[#800000] text-[#D4AF37] shadow-md'
                : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <LogIn size={16} />
            Login
          </button>
          <button
            type="button"
            onClick={() => { setIsLogin(false); setError(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${
              !isLogin
                ? 'bg-[#800000] text-[#D4AF37] shadow-md'
                : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <UserPlus size={16} />
            Sign Up
          </button>
        </div>

        {/* Error Feedback */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-start gap-2"
          >
            <ShieldAlert size={16} className="shrink-0 mt-0.5 text-red-600" />
            <span>{error}</span>
          </motion.div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Sign Up Fields */}
          {!isLogin && (
            <>
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-600 uppercase tracking-wide flex items-center gap-1">
                  <User size={12} className="text-[#800000]" />
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                  disabled={isSignupOtpSent}
                  className="w-full bg-[#FFFDD0]/40 text-neutral-800 placeholder-neutral-400 text-sm rounded-xl border border-[#D4AF37]/30 focus:border-[#800000] focus:ring-1 focus:ring-[#800000] px-4 py-3 outline-none transition-all disabled:opacity-75"
                />
              </div>

              {/* Pathak ID */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-600 uppercase tracking-wide flex items-center gap-1">
                  <Key size={12} className="text-[#800000]" />
                  Pathak ID (ओळखपत्र) *
                </label>
                <input
                  type="text"
                  value={pathakId}
                  onChange={(e) => setPathakId(e.target.value)}
                  placeholder="Enter Pathak ID"
                  required
                  disabled={isSignupOtpSent}
                  className="w-full bg-[#FFFDD0]/40 text-neutral-800 placeholder-neutral-400 text-sm rounded-xl border border-[#D4AF37]/30 focus:border-[#800000] focus:ring-1 focus:ring-[#800000] px-4 py-3 outline-none transition-all disabled:opacity-75"
                />
                {!isSignupOtpSent && (
                  <p className="text-[10px] text-neutral-400 font-semibold italic">
                    Ask administrative leaders for the official pathak registration ID code.
                  </p>
                )}
              </div>

              {/* Email Address with Send OTP button beside it */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-600 uppercase tracking-wide flex items-center gap-1">
                  <Mail size={12} className="text-[#800000]" />
                  Email Address
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter Email Address"
                    required
                    disabled={isSignupOtpSent}
                    className="flex-1 bg-[#FFFDD0]/40 text-neutral-800 placeholder-neutral-400 text-sm rounded-xl border border-[#D4AF37]/30 focus:border-[#800000] focus:ring-1 focus:ring-[#800000] px-4 py-3 outline-none transition-all disabled:opacity-75"
                  />
                  {isSignupOtpSent ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignupOtpSent(false);
                        setOtpNotice(null);
                        setSignupOtp('');
                        setError(null);
                      }}
                      className="bg-[#FAF6EE] hover:bg-[#FAF6EE]/80 text-[#800000] border border-[#800000]/30 font-bold text-xs px-4 rounded-xl transition-all cursor-pointer shadow-sm flex items-center justify-center whitespace-nowrap shrink-0"
                    >
                      Edit Email
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendSignupOtp}
                      disabled={isSendingSignupOtp || !email || !name || !pathakId}
                      className="bg-[#800000] hover:bg-[#5d0000] disabled:bg-neutral-200 text-[#D4AF37] disabled:text-neutral-400 border border-[#D4AF37]/40 font-bold text-xs px-4 rounded-xl transition-all cursor-pointer shadow-sm flex items-center justify-center whitespace-nowrap shrink-0"
                    >
                      {isSendingSignupOtp ? (
                        <div className="w-4 h-4 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
                      ) : (
                        'Send OTP'
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Dynamic Downward Section: OTP, Create Password, Confirm Password */}
              <AnimatePresence>
                {isSignupOtpSent && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-4 pt-2 overflow-hidden"
                  >
                    <div className="border-t border-[#D4AF37]/20 pt-4">
                      <p className="text-xs text-green-700 font-bold mb-2 flex items-center gap-1">
                        ✓ Verification OTP Sent to your email!
                      </p>
                      {otpNotice && (
                        <div className="bg-[#FAF6EE] border-2 border-dashed border-[#D4AF37] text-[#800000] p-3 rounded-xl text-xs font-bold leading-relaxed mt-2 mb-2">
                          💡 {otpNotice}
                        </div>
                      )}
                    </div>

                    {/* Verification OTP */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-neutral-600 uppercase tracking-wide flex items-center gap-1">
                          <Key size={12} className="text-[#800000]" />
                          Enter OTP Code
                        </label>
                        <button
                          type="button"
                          onClick={handleSendSignupOtp}
                          disabled={isSendingSignupOtp}
                          className="text-[#800000] hover:text-[#5d0000] hover:underline text-[10px] font-black uppercase cursor-pointer disabled:opacity-50"
                        >
                          {isSendingSignupOtp ? 'Sending...' : 'Resend OTP'}
                        </button>
                      </div>
                      <input
                        type="text"
                        maxLength={6}
                        value={signupOtp}
                        onChange={(e) => setSignupOtp(e.target.value.replace(/\D/g, ''))}
                        placeholder="000000"
                        required
                        className="w-full bg-[#FFFDD0]/40 text-neutral-800 placeholder-neutral-400 text-sm tracking-[4px] font-bold rounded-xl border border-[#D4AF37]/30 focus:border-[#800000] focus:ring-1 focus:ring-[#800000] px-4 py-3 outline-none transition-all"
                      />
                    </div>

                    {/* New Password */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-neutral-600 uppercase tracking-wide flex items-center gap-1">
                        <Lock size={12} className="text-[#800000]" />
                        Create Password
                      </label>
                      <div className="relative">
                        <input
                          type={showSignupPassword ? "text" : "password"}
                          value={signupPassword}
                          onChange={(e) => setSignupPassword(e.target.value)}
                          placeholder="••••••••"
                          required
                          className="w-full bg-[#FFFDD0]/40 text-neutral-800 placeholder-neutral-400 text-sm rounded-xl border border-[#D4AF37]/30 focus:border-[#800000] focus:ring-1 focus:ring-[#800000] pl-4 pr-11 py-3 outline-none transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSignupPassword(!showSignupPassword)}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-neutral-400 hover:text-[#800000] transition-colors"
                        >
                          {showSignupPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Confirm Password */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-neutral-600 uppercase tracking-wide flex items-center gap-1">
                        <Lock size={12} className="text-[#800000]" />
                        Confirm Password
                      </label>
                      <div className="relative">
                        <input
                          type={showSignupConfirmPassword ? "text" : "password"}
                          value={signupConfirmPassword}
                          onChange={(e) => setSignupConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          required
                          className="w-full bg-[#FFFDD0]/40 text-neutral-800 placeholder-neutral-400 text-sm rounded-xl border border-[#D4AF37]/30 focus:border-[#800000] focus:ring-1 focus:ring-[#800000] pl-4 pr-11 py-3 outline-none transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSignupConfirmPassword(!showSignupConfirmPassword)}
                          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-neutral-400 hover:text-[#800000] transition-colors"
                        >
                          {showSignupConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {/* Login Fields */}
          {isLogin && (
            <>
              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-600 uppercase tracking-wide flex items-center gap-1">
                  <Mail size={12} className="text-[#800000]" />
                  Email Address / Username / ID
                </label>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter Email, Username, or ID"
                  required
                  className="w-full bg-[#FFFDD0]/40 text-neutral-800 placeholder-neutral-400 text-sm rounded-xl border border-[#D4AF37]/30 focus:border-[#800000] focus:ring-1 focus:ring-[#800000] px-4 py-3 outline-none transition-all"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-600 uppercase tracking-wide flex items-center gap-1">
                  <Lock size={12} className="text-[#800000]" />
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full bg-[#FFFDD0]/40 text-neutral-800 placeholder-neutral-400 text-sm rounded-xl border border-[#D4AF37]/30 focus:border-[#800000] focus:ring-1 focus:ring-[#800000] pl-4 pr-11 py-3 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-neutral-400 hover:text-[#800000] transition-colors"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Action Submit Buttons */}
          <div className="pt-2">
            {!isLogin && !isSignupOtpSent ? (
              <div className="text-center bg-[#FFFDD0]/30 border border-[#D4AF37]/20 p-3 rounded-xl text-xs text-neutral-500 font-semibold">
                Please enter Name, Pathak ID, Email and click <span className="text-[#800000] font-bold">"Send OTP"</span> beside email address to unlock signup options.
              </div>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#800000] text-[#D4AF37] border-2 border-[#D4AF37] hover:bg-[#5d0000] font-bold py-3.5 px-4 rounded-xl text-sm tracking-wider uppercase transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
                ) : isLogin ? (
                  <>
                    <LogIn size={18} />
                    LOG IN
                  </>
                ) : (
                  <>
                    <UserPlus size={18} />
                    COMPLETE SIGN UP
                  </>
                )}
              </button>
            )}
          </div>
        </form>

        {/* Traditional Pathak Tagline & Clickable Hidden Admin Access */}
        <div className="mt-8 pt-6 border-t border-[#D4AF37]/20 flex flex-col items-center space-y-2">
          <p className="text-sm text-[#800000] font-bold text-center tracking-wide">
            वज्रनाद ढोल ताशा पथक, बेळगाव
          </p>
          <p className="text-xs text-[#800000] font-serif text-center font-medium leading-relaxed">
            <span 
              onClick={() => {
                setShowAdminModal(true);
                setAdminUsername('');
                setAdminId('');
                setAdminPassword('');
                setAdminError(null);
              }} 
              className="cursor-pointer font-black hover:underline transition-colors"
              title="Click here for Admin access"
            >
              हृदयात
            </span>
            {" घुमतो ज्याचा नाद, तो पथक म्हणजे वज्रनाद"}
          </p>
        </div>
      </div>

      {/* Admin Login Popup Modal */}
      <AnimatePresence>
        {showAdminModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md rounded-[28px] border-4 border-double border-[#D4AF37] p-6 shadow-2xl relative"
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={() => setShowAdminModal(false)}
                className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-700 bg-neutral-100 p-1.5 rounded-full transition-all cursor-pointer"
              >
                <X size={16} />
              </button>

              {/* Modal Header */}
              <div className="text-center mb-6 mt-2">
                <div className="w-12 h-12 rounded-full bg-[#800000]/10 flex items-center justify-center mx-auto mb-3 text-[#800000]">
                  <Fingerprint size={24} />
                </div>
                <h3 className="font-serif font-black text-lg text-[#800000] uppercase tracking-wide">
                  Admin Verification
                </h3>
                <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
                  Secure Pathak Command Suite
                </p>
              </div>

              {/* Admin Error Alert */}
              {adminError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-start gap-2">
                  <ShieldAlert size={16} className="shrink-0 mt-0.5 text-red-600" />
                  <span>{adminError}</span>
                </div>
              )}

              {/* Admin login form */}
              <form onSubmit={handleAdminLoginSubmit} className="space-y-4">
                {/* Username Input */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                    Username (नाव)
                  </label>
                  <input
                    type="text"
                    required
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder="ENTER USERNAME"
                    className="w-full bg-[#FFFDD0]/30 text-neutral-800 placeholder-neutral-400 text-xs font-semibold rounded-xl border border-[#D4AF37]/30 focus:border-[#800000] focus:ring-1 focus:ring-[#800000] px-3.5 py-2.5 outline-none transition-all uppercase"
                  />
                </div>

                {/* ID Input */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                    ID number (ओळखपत्र)
                  </label>
                  <input
                    type="text"
                    required
                    value={adminId}
                    onChange={(e) => setAdminId(e.target.value)}
                    placeholder="ENTER ID NUMBER"
                    className="w-full bg-[#FFFDD0]/30 text-neutral-800 placeholder-neutral-400 text-xs font-semibold rounded-xl border border-[#D4AF37]/30 focus:border-[#800000] focus:ring-1 focus:ring-[#800000] px-3.5 py-2.5 outline-none transition-all"
                  />
                </div>

                {/* Password Input */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                    Access Password (संकेतशब्द)
                  </label>
                  <div className="relative">
                    <input
                      type={showAdminPassword ? "text" : "password"}
                      required
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="ENTER PASSWORD"
                      className="w-full bg-[#FFFDD0]/30 text-neutral-800 placeholder-neutral-400 text-xs font-semibold rounded-xl border border-[#D4AF37]/30 focus:border-[#800000] focus:ring-1 focus:ring-[#800000] pl-3.5 pr-10 py-2.5 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword(!showAdminPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-[#800000] transition-colors"
                      title={showAdminPassword ? "Hide password" : "Show password"}
                    >
                      {showAdminPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {/* Action Submit */}
                <button
                  type="submit"
                  className="w-full mt-2 bg-[#800000] hover:bg-[#5d0000] text-[#D4AF37] border-2 border-[#D4AF37] font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Key size={14} />
                  Authorize Suite Access
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Legal Credit Tagline */}
      <div className="mt-8 text-center text-[10px] text-neutral-400 font-mono tracking-widest z-10">
        VAJRANAD DHOL TASHA PATHAK • DIGITAL MANAGEMENT SUITE
      </div>
    </div>
  );
}
