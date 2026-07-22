import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Users, CalendarDays, Award, TrendingUp, Sparkles, PieChart as PieIcon } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { Member, AttendanceRecord, AttendanceSession } from '../types';

interface AnalyticsDashboardProps {
  members: Member[];
  sessions: AttendanceSession[];
  records: AttendanceRecord[];
}

const COLORS = ['#800000', '#D4AF37', '#2E7D32', '#1565C0', '#FF8F00', '#6A1B9A'];

export default function AnalyticsDashboard({ members, sessions, records }: AnalyticsDashboardProps) {
  const [selectedDayInfo, setSelectedDayInfo] = useState<any | null>(null);
  
  // Calculate top numbers
  const totalMembers = members.filter(m => m.isDetailsFilled).length;

  const multiInstrumentMembers = useMemo(() => {
    return members.filter(m => m.isDetailsFilled && m.instruments && m.instruments.length > 1);
  }, [members]);
  
  const activeSession = useMemo(() => sessions.find(s => s.isActive), [sessions]);
  
  const todayCount = useMemo(() => {
    if (!activeSession) return 0;
    return records.filter(r => r.sessionId === activeSession.id).length;
  }, [activeSession, records]);

  // Overall Attendance Percentage
  const overallAttendancePct = useMemo(() => {
    if (sessions.length === 0 || totalMembers === 0) return 0;
    const totalPossiblePoints = sessions.length * totalMembers;
    const totalActualPoints = records.length;
    return Math.round((totalActualPoints / totalPossiblePoints) * 100) || 0;
  }, [sessions, totalMembers, records]);

  // Practice vs Performance vs Meeting Average
  const averagesByType = useMemo(() => {
    const types = { Practice: { sum: 0, count: 0 }, Performance: { sum: 0, count: 0 }, Meeting: { sum: 0, count: 0 } };
    sessions.forEach(s => {
      const recs = records.filter(r => r.sessionId === s.id).length;
      if (s.type in types) {
        types[s.type as keyof typeof types].sum += recs;
        types[s.type as keyof typeof types].count += 1;
      }
    });
    return {
      Practice: types.Practice.count ? Math.round(types.Practice.sum / types.Practice.count) : 0,
      Performance: types.Performance.count ? Math.round(types.Performance.sum / types.Performance.count) : 0,
      Meeting: types.Meeting.count ? Math.round(types.Meeting.sum / types.Meeting.count) : 0,
    };
  }, [sessions, records]);

  // Chart 1: Member strength present for Practice and Performance based on Year Joined
  const strengthData = useMemo(() => {
    // Grouping criteria:
    // 2026 - New Vadak (नवीन वादक)
    // 2024 & 2025 - Experienced Vadak (अनुभवी वादक)
    // Before 2024 - Old Vadak (जुने वादक)
    const practiceSessions = sessions.filter(s => s.type === 'Practice');
    const performanceSessions = sessions.filter(s => s.type === 'Performance');

    // Calculate registered strength per cohort
    const cohortRegistered = {
      new: 0,
      experienced: 0,
      old: 0
    };

    members.forEach(m => {
      if (m.isDetailsFilled) {
        const yr = m.yearJoined || 0;
        if (yr >= 2026) cohortRegistered.new++;
        else if (yr >= 2024) cohortRegistered.experienced++;
        else cohortRegistered.old++;
      }
    });

    // Practice attendance sum
    const practiceCounts = { new: 0, experienced: 0, old: 0 };
    // Performance attendance sum
    const performanceCounts = { new: 0, experienced: 0, old: 0 };

    sessions.forEach(s => {
      const sessRecords = records.filter(r => r.sessionId === s.id);
      sessRecords.forEach(r => {
        const member = members.find(m => m.id === r.memberId);
        const yr = member?.yearJoined || 0;
        
        if (s.type === 'Practice') {
          if (yr >= 2026) practiceCounts.new++;
          else if (yr >= 2024) practiceCounts.experienced++;
          else practiceCounts.old++;
        } else if (s.type === 'Performance') {
          if (yr >= 2026) performanceCounts.new++;
          else if (yr >= 2024) performanceCounts.experienced++;
          else performanceCounts.old++;
        }
      });
    });

    // Average per session of each type (or fallback to cohort count estimates if no records to avoid blank graphs in empty states)
    const avgPractice = {
      new: practiceSessions.length ? Math.round((practiceCounts.new / practiceSessions.length) * 10) / 10 : (records.length ? 0 : Math.max(2, Math.round(cohortRegistered.new * 0.75))),
      experienced: practiceSessions.length ? Math.round((practiceCounts.experienced / practiceSessions.length) * 10) / 10 : (records.length ? 0 : Math.max(3, Math.round(cohortRegistered.experienced * 0.7))),
      old: practiceSessions.length ? Math.round((practiceCounts.old / practiceSessions.length) * 10) / 10 : (records.length ? 0 : Math.max(1, Math.round(cohortRegistered.old * 0.65))),
    };

    const avgPerformance = {
      new: performanceSessions.length ? Math.round((performanceCounts.new / performanceSessions.length) * 10) / 10 : (records.length ? 0 : Math.max(2, Math.round(cohortRegistered.new * 0.85))),
      experienced: performanceSessions.length ? Math.round((performanceCounts.experienced / performanceSessions.length) * 10) / 10 : (records.length ? 0 : Math.max(4, Math.round(cohortRegistered.experienced * 0.8))),
      old: performanceSessions.length ? Math.round((performanceCounts.old / performanceSessions.length) * 10) / 10 : (records.length ? 0 : Math.max(1, Math.round(cohortRegistered.old * 0.75))),
    };

    return [
      {
        category: 'Old Vadak (<2024)',
        'Practice Strength': avgPractice.old,
        'Performance Strength': avgPerformance.old,
        'Registered': cohortRegistered.old
      },
      {
        category: 'Exp. Vadak (2024-25)',
        'Practice Strength': avgPractice.experienced,
        'Performance Strength': avgPerformance.experienced,
        'Registered': cohortRegistered.experienced
      },
      {
        category: 'New Vadak (2026)',
        'Practice Strength': avgPractice.new,
        'Performance Strength': avgPerformance.new,
        'Registered': cohortRegistered.new
      }
    ];
  }, [members, sessions, records]);

  // Chart 2: Gender ratio
  const genderData = useMemo(() => {
    let male = 0;
    let female = 0;
    members.forEach(m => {
      if (m.isDetailsFilled) {
        if (m.gender === 'Female') female++;
        else male++;
      }
    });
    return [
      { name: 'Male', value: male },
      { name: 'Female', value: female }
    ];
  }, [members]);

  // Chart 3: Trends across recent sessions
  const trendData = useMemo(() => {
    // Sort sessions chronologically
    const sorted = [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return sorted.map(s => {
      const recs = records.filter(r => r.sessionId === s.id).length;
      const percent = totalMembers ? Math.round((recs / totalMembers) * 100) : 0;
      return {
        date: s.date.substring(5), // MM-DD
        title: s.title.substring(0, 10) + '...',
        'Present Count': recs,
        'Attendance %': percent
      };
    });
  }, [sessions, records, totalMembers]);

  // Chart 4: Heatmap grid generation for the current month
  const heatmapDays = useMemo(() => {
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const list = [];
    
    // Map dates to records counts
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      // Find session on this day
      const sessionToday = sessions.find(s => s.date === dateStr);
      const recsToday = sessionToday ? records.filter(r => r.sessionId === sessionToday.id).length : 0;
      const ratio = totalMembers ? recsToday / totalMembers : 0;

      list.push({
        day,
        date: dateStr,
        session: sessionToday,
        attendanceRatio: ratio,
        count: recsToday
      });
    }
    return list;
  }, [sessions, records, totalMembers]);

  // Counts by specific role
  const playerCounts = useMemo(() => {
    const counts = {
      dhol: 0,
      tasha: 0,
      dwajadharak: 0,
      toll: 0,
      volunteer: 0,
      committee: 0
    };

    members.forEach(m => {
      if (m.isDetailsFilled) {
        const selectedInsts = m.instruments && m.instruments.length > 0 ? m.instruments : (m.instrument ? [m.instrument] : []);

        if (selectedInsts.includes('Dhol Vadak')) counts.dhol++;
        if (selectedInsts.includes('Tasha Vadak')) counts.tasha++;
        if (selectedInsts.includes('Dhwaja Dharak')) counts.dwajadharak++;
        if (selectedInsts.includes('Toll Vadak')) counts.toll++;
        if (selectedInsts.includes('Volunteer')) counts.volunteer++;
        if (m.isCommitteeMember || selectedInsts.includes('Committee Member') || m.instrument === 'Committee Member') counts.committee++;
      }
    });

    return counts;
  }, [members]);

  return (
    <div className="space-y-6">
      
      {/* Players Section & Roles Breakdown */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 border-b border-neutral-100 pb-3 mb-5">
          <Sparkles className="text-[#800000]" size={18} />
          <h3 className="font-bold text-sm text-neutral-800 uppercase tracking-wider">
            Vajranad Vadak Directory & Strength Breakdown
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Card 1: Dhol Vadak */}
          <div className="bg-[#FAF6EE] border border-neutral-200 p-4 rounded-xl flex flex-col items-center text-center shadow-2xs hover:shadow-xs transition-all">
            <span className="text-2xl font-black text-[#800000]">{playerCounts.dhol}</span>
            <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mt-1.5">Dhol Vadak</span>
            <span className="text-[8px] text-neutral-400 font-medium mt-0.5 uppercase">Dhol Vadak</span>
          </div>

          {/* Card 2: Tasha Vadak */}
          <div className="bg-[#FAF6EE] border border-neutral-200 p-4 rounded-xl flex flex-col items-center text-center shadow-2xs hover:shadow-xs transition-all">
            <span className="text-2xl font-black text-[#800000]">{playerCounts.tasha}</span>
            <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mt-1.5">Tasha Vadak</span>
            <span className="text-[8px] text-neutral-400 font-medium mt-0.5 uppercase">Tasha Vadak</span>
          </div>

          {/* Card 3: Dwajadharak */}
          <div className="bg-[#FAF6EE] border border-neutral-200 p-4 rounded-xl flex flex-col items-center text-center shadow-2xs hover:shadow-xs transition-all">
            <span className="text-2xl font-black text-[#800000]">{playerCounts.dwajadharak}</span>
            <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mt-1.5">Dhwaja Dharak</span>
            <span className="text-[8px] text-neutral-400 font-medium mt-0.5 uppercase">Dhwaja Dharak</span>
          </div>

          {/* Card 4: Toll Vadak */}
          <div className="bg-[#FAF6EE] border border-neutral-200 p-4 rounded-xl flex flex-col items-center text-center shadow-2xs hover:shadow-xs transition-all">
            <span className="text-2xl font-black text-[#800000]">{playerCounts.toll}</span>
            <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mt-1.5">Toll Vadak</span>
            <span className="text-[8px] text-neutral-400 font-medium mt-0.5 uppercase">Toll Vadak</span>
          </div>

          {/* Card 5: Volunteer */}
          <div className="bg-[#FAF6EE] border border-neutral-200 p-4 rounded-xl flex flex-col items-center text-center shadow-2xs hover:shadow-xs transition-all">
            <span className="text-2xl font-black text-[#800000]">{playerCounts.volunteer}</span>
            <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider mt-1.5">Volunteer</span>
            <span className="text-[8px] text-neutral-400 font-medium mt-0.5 uppercase">Supporting Staff</span>
          </div>

          {/* Card 6: Committee Member */}
          <div className="bg-[#FAF6EE] border border-[#D4AF37]/50 border-2 p-4 rounded-xl flex flex-col items-center text-center shadow-2xs hover:shadow-xs transition-all">
            <span className="text-2xl font-black text-[#800000]">{playerCounts.committee}</span>
            <span className="text-[10px] text-[#800000] font-black uppercase tracking-wider mt-1.5">Committee</span>
            <span className="text-[8px] text-neutral-400 font-medium mt-0.5 uppercase">Signatory Members</span>
          </div>
        </div>
      </div>

      {/* Multi-Instrument Vadak Section */}
      <div className="bg-white border-2 border-[#D4AF37]/40 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Award className="text-[#800000]" size={18} />
            <h3 className="font-bold text-sm text-neutral-800 uppercase tracking-wider">
              Multi-Instrument Vadak (बहू-वाद्य वादक)
            </h3>
          </div>
          <span className="bg-[#800000] text-[#D4AF37] text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
            {multiInstrumentMembers.length} Registered
          </span>
        </div>

        {multiInstrumentMembers.length === 0 ? (
          <p className="text-xs text-neutral-400 italic text-center py-6">
            No members have registered for more than one instrument yet. Members can configure multiple instruments in their profile settings.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {multiInstrumentMembers.map((m) => (
              <div 
                key={m.id}
                className="bg-[#FAF6EE] border border-[#D4AF37]/20 p-4 rounded-xl flex items-center gap-3 shadow-2xs hover:shadow-sm transition-all"
              >
                <img
                  src={m.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80'}
                  alt={m.name}
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-full border border-neutral-200 object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-neutral-800 text-xs truncate">{m.name}</h4>
                  <p className="text-[10px] text-neutral-400 font-medium truncate mb-1.5">{m.email}</p>
                  <div className="flex flex-wrap gap-1">
                    {m.instruments?.map((inst) => (
                      <span 
                        key={inst}
                        className="bg-white text-[#800000] border border-neutral-200 text-[8.5px] font-bold px-1.5 py-0.5 rounded"
                      >
                        {inst === 'Dhol Vadak' ? '🥁 Dhol' : inst === 'Tasha Vadak' ? '👑 Tasha' : inst === 'Toll Vadak' ? '🔔 Toll' : inst === 'Dhwaja Dharak' ? '🚩 Dhwaja' : inst === 'Committee Member' ? '💼 Committee' : '🤝 Volunteer'}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats Summary Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Total Members */}
        <div className="bg-white border border-neutral-200/80 p-5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="p-3 bg-[#800000]/5 rounded-xl text-[#800000]">
            <Users size={24} />
          </div>
          <div>
            <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">Total Members</span>
            <span className="text-xl font-extrabold text-neutral-800">{totalMembers} Members</span>
          </div>
        </div>

        {/* Card 2: Today's Attendance */}
        <div className="bg-white border border-neutral-200/80 p-5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 rounded-xl text-[#D4AF37]">
            <CalendarDays size={24} />
          </div>
          <div>
            <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">Today's Attendance</span>
            <span className="text-xl font-extrabold text-neutral-800">
              {activeSession ? `${todayCount} Present` : 'No Session'}
            </span>
          </div>
        </div>

        {/* Card 3: Overall Attendance % */}
        <div className="bg-white border border-neutral-200/80 p-5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="p-3 bg-green-50 rounded-xl text-[#2E7D32]">
            <TrendingUp size={24} />
          </div>
          <div>
            <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">Attendance Rate</span>
            <span className="text-xl font-extrabold text-[#2E7D32]">{overallAttendancePct}% Avg</span>
          </div>
        </div>
      </div>

      {/* Interactive Charts Panel */}
      {records.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-[#D4AF37]/30 rounded-[28px] p-10 text-center space-y-4 shadow-xs">
          <TrendingUp className="mx-auto text-[#D4AF37] w-12 h-12 animate-bounce" />
          <h4 className="font-bold text-neutral-800 font-serif text-lg">Analytics & Attendance Charts Inactive</h4>
          <p className="text-xs text-neutral-500 max-w-lg mx-auto leading-relaxed font-semibold">
            No attendance sessions or records have been logged in the system yet. Once administrative practice or performance sessions are completed and the first member QR code is scanned, interactive trend charts, gender ratio distributions, cohort analysis, and monthly attendance heatmaps will activate and populate automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Chart 1: Cohort strength based on Year Joined */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm">
          <h4 className="font-bold text-xs text-neutral-500 uppercase tracking-wider border-b border-neutral-100 pb-2 mb-4">
            Batch Attendance Strength (Practice vs. Vadan)
          </h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={strengthData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                <XAxis dataKey="category" tick={{ fontSize: 9, fontWeight: 700 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 12 }} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 10, fontWeight: 700, paddingTop: 10 }} />
                <Bar dataKey="Practice Strength" fill="#800000" radius={[4, 4, 0, 0]} name="🥁 Practice Strength" />
                <Bar dataKey="Performance Strength" fill="#D4AF37" radius={[4, 4, 0, 0]} name="👑 Vadan Strength" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Gender Distribution */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm">
          <h4 className="font-bold text-xs text-neutral-500 uppercase tracking-wider border-b border-neutral-100 pb-2 mb-4 flex items-center gap-1.5">
            <PieIcon size={14} className="text-[#800000]" />
            Gender Ratio
          </h4>
          <div className="h-64 flex flex-col justify-center">
            <ResponsiveContainer width="100%" height="80%">
              <PieChart>
                <Pie
                  data={genderData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell fill="#800000" />
                  <Cell fill="#D4AF37" />
                </Pie>
                <Tooltip />
                <Legend layout="horizontal" align="center" verticalAlign="bottom" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Attendance Trends */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm md:col-span-2">
          <h4 className="font-bold text-xs text-neutral-500 uppercase tracking-wider border-b border-neutral-100 pb-2 mb-4">
            Recent Session Attendance Trends
          </h4>
          <div className="h-64">
            {trendData.length === 0 ? (
              <div className="h-full flex items-center justify-center italic text-neutral-400">
                Not enough session records to plot trend data.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <XAxis dataKey="date" style={{ fontSize: 10 }} />
                  <YAxis style={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Present Count" stroke="#800000" strokeWidth={3} activeDot={{ r: 8 }} />
                  <Line type="monotone" dataKey="Attendance %" stroke="#D4AF37" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Custom Attendance Heatmap Grid */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm md:col-span-2">
          <div className="flex flex-wrap items-center justify-between border-b border-neutral-100 pb-2 mb-4 gap-2">
            <h4 className="font-bold text-xs text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
              <CalendarDays size={14} className="text-[#800000]" />
              Monthly Attendance Heatmap
            </h4>
            {/* Legend */}
            <div className="flex items-center gap-3 text-[10px] font-bold">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-neutral-100 border border-neutral-200 rounded" />
                <span className="text-neutral-400">No Event</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-[#800000]/30 rounded" />
                <span className="text-neutral-500">Low Attendance</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-[#800000]/60 rounded" />
                <span className="text-neutral-500">Med</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-[#800000] rounded" />
                <span className="text-neutral-500">High (100%)</span>
              </div>
            </div>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-2.5">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
              <div key={idx} className="text-center font-mono text-[10px] font-bold text-neutral-400 py-1 uppercase">{day}</div>
            ))}
            {/* Padding for month offsets is skipped for literal grid representation */}
            {heatmapDays.map((day) => {
              let color = 'bg-neutral-50 border border-neutral-200/50';
              if (day.session) {
                if (day.attendanceRatio >= 0.8) color = 'bg-[#800000] text-white shadow-sm ring-1 ring-[#D4AF37]';
                else if (day.attendanceRatio >= 0.4) color = 'bg-[#800000]/60 text-white';
                else color = 'bg-[#800000]/30 text-neutral-800';
              }

              return (
                <div
                  key={day.day}
                  onClick={() => {
                    if (day.session) {
                      setSelectedDayInfo(day);
                    } else {
                      setSelectedDayInfo(null);
                    }
                  }}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center p-1 transition-all cursor-pointer hover:scale-105 ${color} ${day.session ? 'ring-2 ring-transparent hover:ring-[#D4AF37]' : ''}`}
                  title={day.session ? `${day.session.title}: ${day.count} Present (Click to view members)` : 'No Scheduled Event'}
                >
                  <span className="text-xs font-mono font-bold leading-none">{day.day}</span>
                  {day.session && (
                    <span className="text-[7px] font-black uppercase mt-0.5 opacity-80 leading-none">
                      {day.session.type[0]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Heatmap Cell Attendee Details Drawer */}
          {selectedDayInfo && (
            <div className="mt-6 border-2 border-[#D4AF37]/50 rounded-2xl bg-[#FAF6EE] p-5 shadow-inner animate-in fade-in slide-in-from-top-3 duration-200">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-neutral-200/60 pb-3 mb-4 gap-2">
                <div>
                  <h5 className="font-serif font-black text-neutral-800 text-sm">
                    {selectedDayInfo.session.title} (Present Members)
                  </h5>
                  <p className="text-[10px] text-neutral-500 font-bold uppercase mt-0.5">
                    Date: {selectedDayInfo.date} • Type: {selectedDayInfo.session.type}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDayInfo(null)}
                  className="p-1.5 hover:bg-neutral-200 rounded-lg text-neutral-500 hover:text-neutral-800 transition-all cursor-pointer font-bold text-[10px] uppercase flex items-center gap-1 border border-neutral-200 bg-white shadow-2xs"
                >
                  ✕ Close Details
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200/60 text-[10px] font-black uppercase text-neutral-400 tracking-wider">
                      <th className="py-2.5 px-3">Vadak Name</th>
                      <th className="py-2.5 px-3">Instrument</th>
                      <th className="py-2.5 px-3 text-center">Scan Timing</th>
                      <th className="py-2.5 px-3 text-right">Scanned By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200/40">
                    {records.filter(r => r.sessionId === selectedDayInfo.session.id).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center italic text-neutral-400">
                          No attendance records found for this date.
                        </td>
                      </tr>
                    ) : (
                      records
                        .filter(r => r.sessionId === selectedDayInfo.session.id)
                        .map((rec) => (
                          <tr key={rec.id} className="hover:bg-white/50 transition-colors">
                            <td className="py-3 px-3 font-bold text-neutral-800">{rec.memberName}</td>
                            <td className="py-3 px-3">
                              <span className="bg-[#800000]/5 text-[#800000] text-[9px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider">
                                {rec.instrument}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center font-mono font-bold text-neutral-500">{rec.scanTime}</td>
                            <td className="py-3 px-3 text-right font-medium text-neutral-500">{rec.scannedBy}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      </div>
      )}
    </div>
  );
}
