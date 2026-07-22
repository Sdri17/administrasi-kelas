import React, { useState, useEffect } from 'react';
import { store, Student, Grade, Attendance, Settings } from '../lib/store';
import { getSyncStats } from '../lib/sync';
import { Users, BookOpen, CheckSquare, TrendingUp, Filter, BarChart2, PieChart as PieIcon, Cloud, AlertCircle, CheckSquare as CheckIcon, Clock, Calendar, Download, Phone, AlertTriangle } from 'lucide-react';
import { startOfMonth, endOfMonth, parseISO, format, isWithinInterval, startOfWeek, endOfWeek } from 'date-fns';
import { id } from 'date-fns/locale';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, CartesianGrid, AreaChart, Area } from 'recharts';
import toast from 'react-hot-toast';

interface DashboardProps {
  semester: string;
  syncData?: () => Promise<void>;
  onPullData?: () => Promise<void>;
  isSyncing?: boolean;
}

export default function Dashboard({ semester, syncData, onPullData, isSyncing }: DashboardProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [filterKelas, setFilterKelas] = useState<string>('Semua');
  const [filterWaktu, setFilterWaktu] = useState<'Hari Ini' | 'Minggu Ini' | 'Bulan Ini' | 'Semester' | 'Kustom'>('Semester');
  const [filterMapel, setFilterMapel] = useState<string>('Semua');
  const [activeTrendTab, setActiveTrendTab] = useState<'kehadiran' | 'nilai'>('kehadiran');
  
  const [customStartDate, setCustomStartDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState<string>(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  
  const [weeklyAttendance, setWeeklyAttendance] = useState<number>(-1);
  const [studentsAttention, setStudentsAttention] = useState<any[]>([]);
  
  const [attendanceChartData, setAttendanceChartData] = useState<any[]>([]);
  const [subjectChartData, setSubjectChartData] = useState<any[]>([]);
  const [attendanceTrendData, setAttendanceTrendData] = useState<any[]>([]);
  const [gradeTrendData, setGradeTrendData] = useState<any[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [showPullConfirm, setShowPullConfirm] = useState(false);

  // Contact Parent Modal States
  const [selectedContactStudent, setSelectedContactStudent] = useState<any | null>(null);
  const [selectedTemplateType, setSelectedTemplateType] = useState<'akademik' | 'kehadiran' | 'keduanya' | 'kustom'>('akademik');
  const [editedMessage, setEditedMessage] = useState('');

  useEffect(() => {
    const handleDataChange = () => {
      setDataVersion(prev => prev + 1);
    };
    window.addEventListener('data-changed', handleDataChange);
    return () => {
      window.removeEventListener('data-changed', handleDataChange);
    };
  }, []);

  // Name resolving states for sync queue items
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [allGrades, setAllGrades] = useState<Grade[]>([]);
  const [allAttendance, setAllAttendance] = useState<Attendance[]>([]);

  const [syncStats, setSyncStats] = useState({
    percentage: 100,
    unsyncedCount: 0,
    totalItems: 0,
    queueItems: [] as { store: string; id: string; action: string }[]
  });

  const [stats, setStats] = useState({
    totalStudents: 0,
    classes: 0,
    attendanceToday: 0,
    attendanceTodayOnly: -1,
    avgGrades: 0,
    totalAlumni: 0
  });

  const [rosterToday, setRosterToday] = useState<any[]>([]);
  const [piketToday, setPiketToday] = useState<any[]>([]);
  const [upcomingHolidays, setUpcomingHolidays] = useState<any[]>([]);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);

  const ATTENDANCE_COLORS = {
    Hadir: '#10b981', // emerald
    Sakit: '#f59e0b', // amber
    Izin: '#6366f1',  // indigo
    Alpa: '#f43f5e'   // rose
  };

  useEffect(() => {
    const loadSettings = async () => {
      const s = await store.settings.getItem<Settings>('app_settings');
      setSettings(s);
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const loadSync = async () => {
      const statsObj = await getSyncStats();
      setSyncStats(statsObj);
    };
    loadSync();
    
    window.addEventListener('data-changed', loadSync);
    window.addEventListener('sync-status-changed', loadSync);
    return () => {
      window.removeEventListener('data-changed', loadSync);
      window.removeEventListener('sync-status-changed', loadSync);
    };
  }, []);

  useEffect(() => {
    const loadSyncLogs = async () => {
      const list: any[] = [];
      await store.syncLogs.iterate((v) => {
        list.push(v);
      });
      list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      setSyncLogs(list.slice(0, 10)); // Top 10 logs
    };
    loadSyncLogs();
    window.addEventListener('sync-log-changed', loadSyncLogs);
    return () => {
      window.removeEventListener('sync-log-changed', loadSyncLogs);
    };
  }, []);

  useEffect(() => {
    const loadStats = async () => {
      const sList: Student[] = [];
      await store.students.iterate<Student, void>((v) => { sList.push(v); });
      setAllStudents(sList);
      
      const uniqueClasses = Array.from(new Set(sList.map(s => s.kelas).filter(Boolean)));
      setAvailableClasses(uniqueClasses);

      const totalAlumni = sList.filter(s => s.kelas && s.kelas.toLowerCase() === 'alumni').length;
      const activeClassesCount = uniqueClasses.filter(c => c && c.toLowerCase() !== 'alumni').length;

      let filteredStudents = sList;
      if (filterKelas === 'Semua') {
        // Only active students (excluding Alumni)
        filteredStudents = sList.filter(s => !s.kelas || s.kelas.toLowerCase() !== 'alumni');
      } else {
        filteredStudents = sList.filter(s => s.kelas === filterKelas);
      }

      // Fetch all raw grades and attendance for name resolving and trends
      const rawGList: Grade[] = [];
      await store.grades.iterate<Grade, void>((v) => { rawGList.push(v); });
      setAllGrades(rawGList);

      const rawAList: Attendance[] = [];
      await store.attendance.iterate<Attendance, void>((v) => { rawAList.push(v); });
      setAllAttendance(rawAList);

      const aList: Attendance[] = [];
      const today = new Date();
      
      let startDate = new Date(2000, 0, 1);
      let endDate = new Date(2100, 0, 1);
      
      if (filterWaktu === 'Hari Ini') {
        startDate = today;
        endDate = today;
      } else if (filterWaktu === 'Minggu Ini') {
        startDate = startOfWeek(today);
        endDate = endOfWeek(today);
      } else if (filterWaktu === 'Bulan Ini') {
        startDate = startOfMonth(today);
        endDate = endOfMonth(today);
      } else if (filterWaktu === 'Kustom') {
        startDate = parseISO(customStartDate);
        endDate = parseISO(customEndDate);
        endDate.setHours(23, 59, 59, 999);
      }

      rawAList.forEach((v) => {
        if (v.semester !== semester) return;
        if (filterMapel !== 'Semua' && v.mata_pelajaran && v.mata_pelajaran !== filterMapel) return;
        
        const attDate = new Date(v.tanggal);
        if (filterWaktu === 'Semester') {
          aList.push(v);
        } else if (isWithinInterval(attDate, { start: startDate, end: endDate })) {
          aList.push(v);
        }
      });

      const gList: Grade[] = [];
      rawGList.forEach((v) => {
        if (v.semester !== semester) return;
        if (filterMapel !== 'Semua' && v.mata_pelajaran && v.mata_pelajaran !== filterMapel) return;

        if (filterWaktu === 'Semester' || !v.tanggal) {
          gList.push(v);
        } else {
          const gDate = new Date(v.tanggal);
          if (isWithinInterval(gDate, { start: startDate, end: endDate })) {
            gList.push(v);
          }
        }
      });

      const studentIds = new Set(filteredStudents.map(s => s.id));
      const filteredAList = aList.filter(a => studentIds.has(a.id_siswa));
      const filteredGList = gList.filter(g => studentIds.has(g.id_siswa));

      const presentCount = filteredAList.filter(a => a.status === 'Hadir').length;
      const attendancePerc = filteredStudents.length > 0 && filteredAList.length > 0 ? (presentCount / filteredAList.length) * 100 : 0;
      
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const todayAttendance = rawAList.filter(a => a.tanggal === todayStr && a.semester === semester);
      const filteredTodayAttendance = todayAttendance.filter(a => studentIds.has(a.id_siswa));
      const presentToday = filteredTodayAttendance.filter(a => a.status === 'Hadir').length;
      const attendanceTodayPerc = filteredStudents.length > 0 && filteredTodayAttendance.length > 0
        ? (presentToday / filteredTodayAttendance.length) * 100
        : -1;

      const validGrades = filteredGList.filter(g => g.nilai > 0);
      const avgG = validGrades.length > 0 ? validGrades.reduce((a, b) => a + b.nilai, 0) / validGrades.length : 0;

      // 1. Calculate Weekly Attendance for the current filtered class selection
      const startOfCurWeek = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday
      const endOfCurWeek = endOfWeek(new Date(), { weekStartsOn: 1 }); // Sunday
      const weeklyAttendances = rawAList.filter(a => {
        if (a.semester !== semester) return false;
        
        // Filter by class if needed
        if (filterKelas !== 'Semua') {
          const studentObj = sList.find(s => s.id === a.id_siswa);
          if (!studentObj || studentObj.kelas !== filterKelas) return false;
        } else {
          // Exclude alumni
          const studentObj = sList.find(s => s.id === a.id_siswa);
          if (!studentObj || (studentObj.kelas && studentObj.kelas.toLowerCase() === 'alumni')) return false;
        }

        try {
          const d = parseISO(a.tanggal);
          return isWithinInterval(d, { start: startOfCurWeek, end: endOfCurWeek });
        } catch (e) {
          return false;
        }
      });
      const weeklyPresent = weeklyAttendances.filter(a => a.status === 'Hadir').length;
      const weeklyTotal = weeklyAttendances.length;
      const weeklyAttendancePerc = weeklyTotal > 0 ? (weeklyPresent / weeklyTotal) * 100 : -1;
      setWeeklyAttendance(weeklyAttendancePerc);

      // 2. Compile warning list for student attention
      const attentionList: {
        id: string;
        nama: string;
        kelas: string;
        tipe: 'nilai' | 'absen' | 'keduanya';
        detailNilai?: string;
        detailAbsen?: string;
        nilaiRata?: number;
        absenPersen?: number;
      }[] = [];

      filteredStudents.forEach(s => {
        if (s.kelas && s.kelas.toLowerCase() === 'alumni') return;

        // Calculate student average grade
        const sGrades = rawGList.filter(g => g.id_siswa === s.id && g.semester === semester && g.nilai > 0);
        const avgGrade = sGrades.length > 0 
          ? sGrades.reduce((acc, curr) => acc + curr.nilai, 0) / sGrades.length 
          : null;
        
        const hasBelowKKM = sGrades.some(g => g.nilai < 75); // KKM default 75
        const belowKKMSubjects = sGrades.filter(g => g.nilai < 75).map(g => `${g.mata_pelajaran || 'Umum'} (${g.nama_kolom}: ${g.nilai})`);

        // Calculate student attendance percentage
        const sAtt = rawAList.filter(a => a.id_siswa === s.id && a.semester === semester);
        const totalAtt = sAtt.length;
        const hadirAtt = sAtt.filter(a => a.status === 'Hadir').length;
        const studentAttendancePerc = totalAtt > 0 ? (hadirAtt / totalAtt) * 100 : null;

        const isLowAttendance = studentAttendancePerc !== null && studentAttendancePerc < 80;
        const isLowGrade = avgGrade !== null && (avgGrade < 75 || hasBelowKKM);

        if (isLowGrade || isLowAttendance) {
          let tipe: 'nilai' | 'absen' | 'keduanya' = 'nilai';
          if (isLowGrade && isLowAttendance) tipe = 'keduanya';
          else if (isLowAttendance) tipe = 'absen';

          const detailNilai = belowKKMSubjects.length > 0 
            ? `Nilai di bawah KKM: ${belowKKMSubjects.slice(0, 2).join(', ')}${belowKKMSubjects.length > 2 ? '...' : ''}`
            : avgGrade !== null && avgGrade < 75 
              ? `Rata-rata nilai (${avgGrade.toFixed(1)}) di bawah KKM (75)` 
              : undefined;

          const detailAbsen = studentAttendancePerc !== null 
            ? `Kehadiran ${studentAttendancePerc.toFixed(1)}% (di bawah target 80%)` 
            : undefined;

          attentionList.push({
            id: s.id,
            nama: s.nama,
            kelas: s.kelas || '',
            tipe,
            detailNilai,
            detailAbsen,
            nilaiRata: avgGrade !== null ? Number(avgGrade.toFixed(1)) : undefined,
            absenPersen: studentAttendancePerc !== null ? Number(studentAttendancePerc.toFixed(1)) : undefined
          });
        }
      });
      setStudentsAttention(attentionList);

      setStats({
        totalStudents: filteredStudents.length,
        classes: activeClassesCount,
        attendanceToday: attendancePerc,
        attendanceTodayOnly: attendanceTodayPerc,
        avgGrades: avgG,
        totalAlumni
      });

      // Load today's Roster, Piket and Holidays
      const INDO_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const todayDayName = INDO_DAYS[new Date().getDay()];

      const rosterList: any[] = [];
      await store.roster.iterate((v: any) => {
        if (v.semester === semester && (filterKelas === 'Semua' || v.kelas === filterKelas)) {
          rosterList.push(v);
        }
      });

      const piketList: any[] = [];
      await store.piket.iterate((v: any) => {
        if (v.semester === semester && (filterKelas === 'Semua' || v.kelas === filterKelas)) {
          piketList.push(v);
        }
      });

      const todayRoster = rosterList
        .filter(r => r.hari === todayDayName)
        .sort((a, b) => a.jam_mulai.localeCompare(b.jam_mulai));

      const todayPiket = piketList
        .filter(p => p.hari === todayDayName)
        .map(p => {
          const studentObj = filteredStudents.find(s => s.id === p.id_siswa);
          return {
            ...p,
            nama_siswa: studentObj ? studentObj.nama : 'Siswa'
          };
        });

      setRosterToday(todayRoster);
      setPiketToday(todayPiket);

      const currentSettings = await store.settings.getItem<Settings>('app_settings');
      const activeHolidays = currentSettings?.holidays || [];
      const todayDate = new Date();
      const next30Days = new Date();
      next30Days.setDate(todayDate.getDate() + 30);

      const filteredHols = activeHolidays.filter(h => {
        try {
          const start = parseISO(h.tanggal_mulai);
          const end = parseISO(h.tanggal_selesai);
          return (start >= todayDate && start <= next30Days) || (end >= todayDate && end <= next30Days) || (start <= todayDate && end >= todayDate);
        } catch (e) {
          return false;
        }
      });
      setUpcomingHolidays(filteredHols);

      // Aggregate attendance status counts for interactive Pie Chart
      const statusCounts = { Hadir: 0, Sakit: 0, Izin: 0, Alpa: 0 };
      filteredAList.forEach(a => {
        if (a.status in statusCounts) {
          statusCounts[a.status as keyof typeof statusCounts]++;
        }
      });
      const attendancePieData = Object.entries(statusCounts).map(([name, value]) => ({
        name,
        value
      }));
      setAttendanceChartData(attendancePieData);

      // Aggregate subject averages for interactive Bar Chart
      const mapelAvg: Record<string, { sum: number; count: number }> = {};
      filteredGList.forEach(g => {
        const mapel = g.mata_pelajaran || 'Umum';
        if (g.nilai > 0) {
          if (!mapelAvg[mapel]) {
            mapelAvg[mapel] = { sum: 0, count: 0 };
          }
          mapelAvg[mapel].sum += g.nilai;
          mapelAvg[mapel].count++;
        }
      });
      const mapelChartData = Object.entries(mapelAvg).map(([name, val]) => ({
        name,
        'Rata-rata': Number((val.sum / val.count).toFixed(1))
      })).sort((a, b) => b['Rata-rata'] - a['Rata-rata']);
      setSubjectChartData(mapelChartData);

      // Calculate daily attendance trend (percentage of Hadir by date)
      const attTrendMap: Record<string, { total: number; hadir: number }> = {};
      filteredAList.forEach(a => {
        if (!a.tanggal) return;
        const dateStr = a.tanggal;
        if (!attTrendMap[dateStr]) {
          attTrendMap[dateStr] = { total: 0, hadir: 0 };
        }
        attTrendMap[dateStr].total++;
        if (a.status === 'Hadir') {
          attTrendMap[dateStr].hadir++;
        }
      });

      const attTrendData = Object.entries(attTrendMap)
        .map(([date, val]) => {
          let formatted = date;
          try {
            formatted = format(parseISO(date), 'dd MMM');
          } catch (e) {}
          return {
            tanggal: date,
            formattedTanggal: formatted,
            'Persentase Hadir': Number(((val.hadir / val.total) * 100).toFixed(1))
          };
        })
        .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
      setAttendanceTrendData(attTrendData);

      // Calculate daily grade average trend (average score by date)
      const grTrendMap: Record<string, { sum: number; count: number }> = {};
      filteredGList.forEach(g => {
        if (!g.tanggal || g.nilai <= 0) return;
        const dateStr = g.tanggal;
        if (!grTrendMap[dateStr]) {
          grTrendMap[dateStr] = { sum: 0, count: 0 };
        }
        grTrendMap[dateStr].sum += g.nilai;
        grTrendMap[dateStr].count++;
      });

      const grTrendData = Object.entries(grTrendMap)
        .map(([date, val]) => {
          let formatted = date;
          try {
            formatted = format(parseISO(date), 'dd MMM');
          } catch (e) {}
          return {
            tanggal: date,
            formattedTanggal: formatted,
            'Rata-rata': Number((val.sum / val.count).toFixed(1))
          };
        })
        .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
      setGradeTrendData(grTrendData);
    };
    loadStats();
  }, [semester, filterKelas, filterWaktu, customStartDate, customEndDate, filterMapel, dataVersion]);

  // Check if charts have any data
  const hasAttendanceData = attendanceChartData.some(d => d.value > 0);
  const hasSubjectData = subjectChartData.length > 0;

  const getQueueItemDetails = (item: { store: string; id: string; action: string }, studentsList: Student[], gradesList: Grade[], attendanceList: Attendance[]) => {
    const actionLabel = item.action === 'delete' ? 'Hapus' : 'Ubah';
    let targetName = 'Data';
    let desc = `ID: ${item.id}`;

    if (item.store === 'students') {
      targetName = 'Siswa';
      const std = studentsList.find(s => s.id === item.id);
      if (std) desc = std.nama;
    } else if (item.store === 'grades') {
      targetName = 'Nilai';
      const gr = gradesList.find(g => g.id === item.id);
      if (gr) {
        const std = studentsList.find(s => s.id === gr.id_siswa);
        desc = `${std ? std.nama : 'Siswa'} - ${gr.mata_pelajaran || 'Umum'} (${gr.nama_kolom}: ${gr.nilai})`;
      }
    } else if (item.store === 'attendance') {
      targetName = 'Absen';
      const att = attendanceList.find(a => a.id === item.id);
      if (att) {
        const std = studentsList.find(s => s.id === att.id_siswa);
        desc = `${std ? std.nama : 'Siswa'} - ${att.tanggal} (${att.status})`;
      }
    }

    return { targetName, actionLabel, desc };
  };

  const getWhatsAppTemplate = (
    student: any,
    teacherName: string,
    schoolName: string,
    type: 'akademik' | 'kehadiran' | 'keduanya' | 'kustom'
  ) => {
    const sName = student.nama || '';
    const sClass = student.kelas || '';
    const tName = teacherName || 'Wali Kelas';
    const schName = schoolName || 'Sekolah';
    const aPersen = student.absenPersen !== undefined ? `${student.absenPersen}%` : '-';

    if (type === 'akademik') {
      return `Yth. Bapak/Ibu Orang Tua/Wali dari ${sName},\n\nPerkenalkan saya Bapak/Ibu ${tName}, selaku Wali Kelas di ${schName}. Melalui pesan ini, kami ingin menginformasikan mengenai perkembangan hasil belajar akademik ${sName} di kelas ${sClass}.\n\nSaat ini, rata-rata nilai akademik ${sName} memerlukan perhatian khusus karena berada di bawah batas Kriteria Ketuntasan Minimal (KKM). ${student.detailNilai ? `(${student.detailNilai})` : ''}\n\nMohon bantuannya untuk mendampingi, memberikan bimbingan, serta memotivasi putra/putri Bapak/Ibu saat belajar di rumah agar dapat memperbaiki nilai-nilainya.\n\nTerima kasih atas perhatian dan kerja samanya. 🙏`;
    }
    
    if (type === 'kehadiran') {
      return `Yth. Bapak/Ibu Orang Tua/Wali dari ${sName},\n\nPerkenalkan saya Bapak/Ibu ${tName}, selaku Wali Kelas di ${schName}. Melalui pesan ini, kami ingin menginformasikan mengenai tingkat kehadiran ${sName} di sekolah.\n\nSaat ini persentase kehadiran ${sName} di kelas adalah ${aPersen}, yang mana berada di bawah target minimal 80%. Kehadiran yang rutin sangat penting untuk memastikan kelancaran proses pembelajaran putra/putri Bapak/Ibu.\n\nMohon bantuan dan kerja samanya untuk memotivasi serta memastikan ${sName} dapat hadir ke sekolah secara rutin dan tepat waktu.\n\nTerima kasih banyak atas perhatian Bapak/Ibu. 🙏`;
    }
    
    if (type === 'keduanya') {
      return `Yth. Bapak/Ibu Orang Tua/Wali dari ${sName},\n\nPerkenalkan saya Bapak/Ibu ${tName}, selaku Wali Kelas di ${schName}. Melalui pesan ini, kami ingin berkonsultasi mengenai perkembangan putra/putri Bapak/Ibu, ${sName}.\n\nKami mendapati bahwa saat ini ${sName} memerlukan dukungan dan perhatian ekstra, baik di bidang kehadiran maupun hasil belajar akademik. Tingkat kehadirannya saat ini ${aPersen} (di bawah target 80%), serta terdapat beberapa capaian nilai yang berada di bawah KKM. ${student.detailNilai ? `(${student.detailNilai})` : ''}\n\nKami sangat mengharapkan kerja sama Bapak/Ibu untuk memberikan perhatian lebih, membimbing belajarnya di rumah, serta memastikan kesiapannya hadir ke sekolah secara rutin.\n\nTerima kasih atas perhatian dan kerja samanya. 🙏`;
    }

    return `Yth. Bapak/Ibu Orang Tua/Wali dari ${sName},\n\nPerkenalkan saya Bapak/Ibu ${tName}, selaku Wali Kelas di ${schName}. Melalui pesan ini, kami ingin bersilaturahmi sekaligus menginformasikan perkembangan ${sName} di kelas ${sClass}.\n\n[Tulis pesan kustom Anda di sini]\n\nTerima kasih atas perhatian Bapak/Ibu. 🙏`;
  };

  const handleContactParent = (studentId: string, studentName: string) => {
    const student = allStudents.find(s => s.id === studentId);
    const alert = studentsAttention.find(a => a.id === studentId);
    if (student) {
      const parentPhone = student.no_telp_ortu || '';
      if (parentPhone) {
        const combined = {
          ...student,
          tipe: alert?.tipe || 'kustom',
          detailNilai: alert?.detailNilai,
          detailAbsen: alert?.detailAbsen,
          nilaiRata: alert?.nilaiRata,
          absenPersen: alert?.absenPersen
        };

        const defaultType = alert?.tipe === 'nilai' ? 'akademik' : alert?.tipe === 'absen' ? 'kehadiran' : alert?.tipe === 'keduanya' ? 'keduanya' : 'kustom';

        setSelectedContactStudent(combined);
        setSelectedTemplateType(defaultType);
        
        const teacherName = settings?.nama_wali_kelas || 'Wali Kelas';
        const schoolName = settings?.nama_sekolah || 'Sekolah';
        const initialText = getWhatsAppTemplate(combined, teacherName, schoolName, defaultType);
        setEditedMessage(initialText);
      } else {
        toast.error(`Nomor telepon orang tua untuk ${studentName} belum dicatat.`);
      }
    }
  };

  const formatWhatsAppNumber = (phone: string): string => {
    if (!phone) return '';
    let cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('620')) {
      cleaned = '62' + cleaned.slice(3);
    }
    if (cleaned.startsWith('08')) {
      cleaned = '62' + cleaned.slice(1);
    } else if (cleaned.startsWith('8') && cleaned.length >= 9 && cleaned.length <= 13) {
      cleaned = '62' + cleaned;
    }
    return cleaned;
  };

  const handleTemplateTypeChange = (type: 'akademik' | 'kehadiran' | 'keduanya' | 'kustom') => {
    setSelectedTemplateType(type);
    if (selectedContactStudent) {
      const teacherName = settings?.nama_wali_kelas || 'Wali Kelas';
      const schoolName = settings?.nama_sekolah || 'Sekolah';
      const text = getWhatsAppTemplate(selectedContactStudent, teacherName, schoolName, type);
      setEditedMessage(text);
    }
  };

  return (
    <div className="p-8 h-full flex flex-col gap-6 text-slate-200">
      {/* Interactive Header Filters with Glassmorphism */}
      <div className="flex flex-wrap gap-4 bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-2 text-slate-400">
          <Filter size={18} />
          <span className="text-sm font-medium uppercase tracking-wider">Filter Dashboard:</span>
        </div>
        
        <select 
          value={filterKelas}
          onChange={e => setFilterKelas(e.target.value)}
          className="px-4 py-2 bg-slate-900/60 border border-slate-700/60 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all cursor-pointer hover:bg-slate-900"
        >
          <option value="Semua">Semua Kelas</option>
          {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="flex items-center gap-2">
          <select 
            value={filterWaktu}
            onChange={e => setFilterWaktu(e.target.value as any)}
            className="px-4 py-2 bg-slate-900/60 border border-slate-700/60 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all cursor-pointer hover:bg-slate-900"
          >
            <option value="Semester">Semester Ini</option>
            <option value="Hari Ini">Hari Ini</option>
            <option value="Minggu Ini">Minggu Ini</option>
            <option value="Bulan Ini">Bulan Ini</option>
            <option value="Kustom">Kustom</option>
          </select>

          {filterWaktu === 'Kustom' && (
            <div className="flex items-center gap-2 ml-2">
              <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="px-3 py-2 bg-slate-900/60 border border-slate-700/60 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 [color-scheme:dark] transition-all" />
              <span className="text-slate-500">-</span>
              <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="px-3 py-2 bg-slate-900/60 border border-slate-700/60 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 [color-scheme:dark] transition-all" />
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards Grid with Glassmorphism */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-lg transition-all hover:translate-y-[-2px] hover:border-slate-600/50">
          <div className="flex justify-between items-start mb-4">
            <p className="text-slate-400 text-sm">Total Siswa Aktif</p>
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg"><Users size={20} /></div>
          </div>
          <h3 className="text-3xl font-bold text-slate-100">{stats.totalStudents}</h3>
          <div className="mt-2 text-xs text-indigo-400">{filterKelas === 'Semua' ? `${stats.classes} Kelas Aktif` : `Kelas ${filterKelas}`}</div>
        </div>

        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-lg transition-all hover:translate-y-[-2px] hover:border-slate-600/50">
          <div className="flex justify-between items-start mb-4">
            <p className="text-slate-400 text-sm">Siswa Non Aktif</p>
            <div className="p-2 bg-rose-500/10 text-rose-400 rounded-lg"><Users size={20} /></div>
          </div>
          <h3 className="text-3xl font-bold text-slate-100">{stats.totalAlumni}</h3>
          <div className="mt-2 text-xs text-rose-400">Total Alumni/Lulus</div>
        </div>

        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-lg transition-all hover:translate-y-[-2px] hover:border-slate-600/50">
          <div className="flex justify-between items-start mb-4">
            <p className="text-slate-400 text-sm">Kehadiran Hari Ini</p>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg"><CheckSquare size={20} /></div>
          </div>
          <h3 className="text-3xl font-bold text-slate-100">
            {stats.attendanceTodayOnly === -1 ? 'Belum Diisi' : `${stats.attendanceTodayOnly.toFixed(1)}%`}
          </h3>
          <div className="mt-2 text-xs text-emerald-400">Rata-rata {filterWaktu}: {stats.attendanceToday.toFixed(1)}%</div>
        </div>

        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-lg transition-all hover:translate-y-[-2px] hover:border-slate-600/50">
          <div className="flex justify-between items-start mb-4">
            <p className="text-slate-400 text-sm">Kehadiran Mingguan</p>
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg"><Clock size={20} /></div>
          </div>
          <h3 className="text-3xl font-bold text-slate-100">
            {weeklyAttendance === -1 ? 'Belum Diisi' : `${weeklyAttendance.toFixed(1)}%`}
          </h3>
          <div className="mt-2 text-xs text-indigo-400">Rata-rata minggu berjalan</div>
        </div>

        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-lg transition-all hover:translate-y-[-2px] hover:border-slate-600/50">
          <div className="flex justify-between items-start mb-4">
            <p className="text-slate-400 text-sm">Rata-rata Nilai</p>
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg"><TrendingUp size={20} /></div>
          </div>
          <h3 className="text-3xl font-bold text-slate-100">{stats.avgGrades.toFixed(1)}</h3>
          <div className="mt-2 text-xs text-amber-400 italic">Keseluruhan Tugas & Harian</div>
        </div>

        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-lg transition-all hover:translate-y-[-2px] hover:border-slate-600/50">
          <div className="flex justify-between items-start mb-3">
            <p className="text-slate-400 text-sm">Sinkronisasi Database</p>
            <div className={`p-2 rounded-lg ${syncStats.unsyncedCount > 0 ? 'bg-amber-500/10 text-amber-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
              <Cloud size={20} className={syncStats.unsyncedCount > 0 ? 'animate-pulse' : ''} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold text-slate-100">{syncStats.percentage}%</h3>
            <span className="text-xs text-slate-400">Tersinkron</span>
          </div>
          
          <div className="mt-3 space-y-2">
            {/* Progress Bar */}
            <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
              <div 
                className={`h-1.5 rounded-full transition-all duration-500 ${syncStats.unsyncedCount > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${syncStats.percentage}%` }}
              ></div>
            </div>
            
            <div className="flex justify-between items-center text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                {syncStats.unsyncedCount > 0 ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                    <span className="text-amber-400 font-medium">{syncStats.unsyncedCount} antrean</span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span className="text-emerald-400 font-medium">Semua data aman</span>
                  </>
                )}
              </span>
              <span className="font-mono">({syncStats.totalItems - syncStats.unsyncedCount}/{syncStats.totalItems})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pusat Perhatian Wali Kelas - Siswa Perlu Perhatian Khusus */}
      <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl flex flex-col gap-4">
        <div className="flex justify-between items-center border-b border-slate-700/50 pb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="text-rose-400 w-5 h-5 animate-pulse" />
            <div>
              <h3 className="text-md font-semibold text-slate-100">Pusat Perhatian Wali Kelas (Siswa Perlu Tindak Lanjut)</h3>
              <p className="text-xs text-slate-400">Menampilkan siswa dengan pencapaian di bawah KKM (75) atau kehadiran di bawah target (80%)</p>
            </div>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-rose-500/15 text-rose-300 rounded-full border border-rose-500/20">
            {studentsAttention.length} Peringatan Aktif
          </span>
        </div>

        {studentsAttention.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center text-slate-400 bg-slate-900/20 rounded-xl border border-dashed border-slate-800 p-4">
            <CheckIcon className="text-emerald-400 w-8 h-8 mb-2" />
            <p className="font-semibold text-slate-200">Seluruh Siswa Aman</p>
            <p className="text-xs max-w-sm mt-1">Luar biasa! Tidak ada siswa dengan nilai rata-rata di bawah KKM atau kehadiran di bawah batas minimum.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
            {studentsAttention.map(alert => (
              <div 
                key={alert.id} 
                className={`p-4 rounded-xl border transition-all hover:scale-[1.01] flex flex-col justify-between ${
                  alert.tipe === 'keduanya' 
                    ? 'bg-purple-950/15 border-purple-500/30' 
                    : alert.tipe === 'nilai' 
                      ? 'bg-rose-950/15 border-rose-500/30' 
                      : 'bg-amber-950/15 border-amber-500/30'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div className="truncate">
                      <h4 className="font-semibold text-slate-200 text-sm leading-tight truncate">{alert.nama}</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">Kelas: <span className="font-medium text-slate-300">{alert.kelas}</span></p>
                    </div>
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                      alert.tipe === 'keduanya' 
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                        : alert.tipe === 'nilai' 
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      {alert.tipe === 'keduanya' ? 'Nilai & Absen' : alert.tipe === 'nilai' ? 'Nilai KKM' : 'Kehadiran'}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-300 mt-2">
                    {alert.detailNilai && (
                      <div className="flex items-start gap-1.5">
                        <AlertTriangle size={14} className="text-rose-400 shrink-0 mt-0.5" />
                        <span className="leading-tight">{alert.detailNilai}</span>
                      </div>
                    )}
                    {alert.detailAbsen && (
                      <div className="flex items-start gap-1.5">
                        <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                        <span className="leading-tight">{alert.detailAbsen}</span>
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  onClick={() => handleContactParent(alert.id, alert.nama)}
                  className="mt-4 w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-900/60 hover:bg-slate-900 text-slate-200 hover:text-white text-xs font-semibold rounded-lg border border-slate-700/60 transition-all cursor-pointer"
                >
                  <Phone size={12} />
                  <span>Hubungi Orang Tua</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Row with Trend Chart and Sync queue Details */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Interactive Trends Panel */}
        <div className="xl:col-span-2 bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl flex flex-col h-[420px]">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-6 shrink-0">
            <div className="flex items-center gap-2">
              <TrendingUp className="text-indigo-400 w-5 h-5" />
              <div>
                <h3 className="text-md font-semibold text-slate-100">Analisis Tren Real-Time</h3>
                <p className="text-xs text-slate-400">Tren statistik kehadiran dan pencapaian akademik harian</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Subject Filter inside Trend Panel */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Mata Pelajaran:</span>
                <select 
                  value={filterMapel}
                  onChange={e => setFilterMapel(e.target.value)}
                  className="px-3 py-1.5 bg-slate-900/60 border border-slate-700/60 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all cursor-pointer hover:bg-slate-900"
                >
                  <option value="Semua">Semua Mapel</option>
                  {(settings?.mata_pelajaran || []).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Tab Switcher */}
              <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-700/40">
                <button
                  onClick={() => setActiveTrendTab('kehadiran')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTrendTab === 'kehadiran'
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Kehadiran
                </button>
                <button
                  onClick={() => setActiveTrendTab('nilai')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTrendTab === 'nilai'
                      ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Rata-rata Nilai
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 relative">
            {activeTrendTab === 'kehadiran' ? (
              attendanceTrendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={attendanceTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorHadir" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.2)" />
                    <XAxis dataKey="formattedTanggal" stroke="#94a3b8" fontSize={10} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={10} domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                        borderRadius: '8px', 
                        borderColor: 'rgba(51, 65, 85, 0.5)',
                        color: '#f8fafc'
                      }} 
                      formatter={(value: any) => [`${value}%`, 'Tingkat Kehadiran']}
                    />
                    <Area type="monotone" dataKey="Persentase Hadir" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorHadir)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-900/10 rounded-xl border border-dashed border-slate-700/50">
                  <CheckIcon size={36} className="text-slate-500 mb-2" />
                  <p className="text-slate-400 text-sm font-medium">Tidak ada data tren kehadiran</p>
                  <p className="text-slate-500 text-xs mt-1">Ganti filter waktu atau input data absen di halaman Absensi.</p>
                </div>
              )
            ) : (
              gradeTrendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={gradeTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorNilai" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.2)" />
                    <XAxis dataKey="formattedTanggal" stroke="#94a3b8" fontSize={10} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={10} domain={[0, 100]} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                        borderRadius: '8px', 
                        borderColor: 'rgba(51, 65, 85, 0.5)',
                        color: '#f8fafc'
                      }} 
                      formatter={(value: any) => [value, 'Rata-rata Nilai']}
                    />
                    <Area type="monotone" dataKey="Rata-rata" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorNilai)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-900/10 rounded-xl border border-dashed border-slate-700/50">
                  <BarChart2 size={36} className="text-slate-500 mb-2" />
                  <p className="text-slate-400 text-sm font-medium">Tidak ada data tren nilai</p>
                  <p className="text-slate-500 text-xs mt-1">Ganti filter waktu atau input nilai ber-tanggal di halaman Nilai.</p>
                </div>
              )
            )}
          </div>
        </div>

        {/* Visibilitas Status Sinkronisasi & Antrean Data */}
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl flex flex-col h-[420px]">
          <div className="flex flex-wrap gap-2 justify-between items-center mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <Cloud className="text-indigo-400 w-5 h-5" />
              <div>
                <h3 className="text-md font-semibold text-slate-100">Status Sinkronisasi</h3>
                <p className="text-xs text-slate-400">Antrean perubahan data tertunda (pending)</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {onPullData && (
                <button 
                  onClick={() => setShowPullConfirm(true)}
                  disabled={isSyncing}
                  className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 disabled:opacity-40 rounded-xl text-xs font-semibold shadow-lg transition-all flex items-center gap-1 cursor-pointer"
                  title="Ambil / tarik seluruh data dari Google Sheets cloud"
                >
                  <Download size={12} />
                  <span>Tarik/Ambil Data</span>
                </button>
              )}
              {syncData && (
                <button 
                  onClick={syncData}
                  disabled={isSyncing || syncStats.unsyncedCount === 0}
                  className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-1 cursor-pointer"
                >
                  <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkron'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Overall progress indicator */}
          <div className="bg-slate-900/40 border border-slate-700/50 p-4 rounded-xl mb-4 shrink-0 flex items-center gap-4">
            <div className="relative flex items-center justify-center shrink-0">
              <svg className="w-12 h-12 transform -rotate-90">
                <circle cx="24" cy="24" r="20" stroke="rgba(51, 65, 85, 0.4)" strokeWidth="4" fill="transparent" />
                <circle 
                  cx="24" 
                  cy="24" 
                  r="20" 
                  stroke={syncStats.unsyncedCount > 0 ? '#f59e0b' : '#10b981'} 
                  strokeWidth="4" 
                  fill="transparent" 
                  strokeDasharray={`${2 * Math.PI * 20}`}
                  strokeDashoffset={`${2 * Math.PI * 20 * (1 - syncStats.percentage / 100)}`}
                  className="transition-all duration-500"
                />
              </svg>
              <span className="absolute text-xs font-bold font-mono text-slate-200">{syncStats.percentage}%</span>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-slate-300">
                {syncStats.unsyncedCount > 0 ? 'Beberapa Perubahan Tertunda' : 'Semua Data Tersinkron'}
              </h4>
              <p className="text-[10px] text-slate-400 truncate mt-0.5">
                {syncStats.unsyncedCount > 0 
                  ? `${syncStats.unsyncedCount} perubahan tersimpan secara lokal dan akan disinkronkan.` 
                  : 'Data lokal Anda sinkron dengan Cloud Google Sheets.'}
              </p>
            </div>
          </div>

          {/* Pending sync queue list */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Daftar Antrean</h4>
            
            <div className="space-y-2">
              {syncStats.queueItems && syncStats.queueItems.length > 0 ? (
                syncStats.queueItems.map((item, index) => {
                  const resolved = getQueueItemDetails(item, allStudents, allGrades, allAttendance);
                  return (
                    <div 
                      key={`${item.store}-${item.id}-${index}`} 
                      className="bg-slate-900/30 hover:bg-slate-900/50 border border-slate-700/30 rounded-xl p-3 flex justify-between items-center gap-3 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-indigo-300 capitalize shrink-0">
                            {resolved.targetName}
                          </span>
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                            resolved.actionLabel === 'Hapus' 
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}>
                            {resolved.actionLabel}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 font-medium truncate mt-1.5" title={resolved.desc}>{resolved.desc}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                        <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Tunda</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-6 bg-slate-900/10 rounded-xl border border-dashed border-slate-700/30 py-10">
                  <CheckIcon size={24} className="text-emerald-400/80 mb-2" />
                  <p className="text-slate-400 text-xs font-semibold">Tidak ada antrean tertunda</p>
                  <p className="text-slate-500 text-[10px] mt-0.5">Semua modifikasi Anda berhasil ter-sync!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Charts Panel with Glassmorphism */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance Statistics (Pie Chart) */}
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl flex flex-col h-[380px]">
          <div className="flex items-center gap-2 mb-4 shrink-0">
            <PieIcon className="text-indigo-400 w-5 h-5" />
            <h3 className="text-md font-semibold text-slate-100">Distribusi Kehadiran Siswa</h3>
          </div>
          
          <div className="flex-1 min-h-0 relative">
            {hasAttendanceData ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={attendanceChartData}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {attendanceChartData.map((entry) => (
                      <Cell 
                        key={`cell-${entry.name}`} 
                        fill={ATTENDANCE_COLORS[entry.name as keyof typeof ATTENDANCE_COLORS] || '#6366f1'} 
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                      borderRadius: '8px', 
                      borderColor: 'rgba(51, 65, 85, 0.5)',
                      color: '#f8fafc'
                    }} 
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    iconType="circle"
                    formatter={(value) => <span className="text-slate-300 text-xs font-medium">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-900/10 rounded-xl border border-dashed border-slate-700/50">
                <CheckSquare size={36} className="text-slate-500 mb-2" />
                <p className="text-slate-400 text-sm font-medium">Belum ada data absensi</p>
                <p className="text-slate-500 text-xs mt-1">Silakan tambahkan data absensi untuk menampilkan statistik visual.</p>
              </div>
            )}
          </div>
        </div>

        {/* Grades Statistics (Bar Chart) */}
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl flex flex-col h-[380px]">
          <div className="flex items-center gap-2 mb-4 shrink-0">
            <BarChart2 className="text-emerald-400 w-5 h-5" />
            <h3 className="text-md font-semibold text-slate-100">Rata-rata Nilai per Mata Pelajaran</h3>
          </div>
          
          <div className="flex-1 min-h-0 relative">
            {hasSubjectData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectChartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.2)" />
                  <XAxis 
                    dataKey="name" 
                    stroke="#94a3b8" 
                    fontSize={10} 
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={10} 
                    domain={[0, 100]} 
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                      borderRadius: '8px', 
                      borderColor: 'rgba(51, 65, 85, 0.5)',
                      color: '#f8fafc'
                    }} 
                  />
                  <Bar 
                    dataKey="Rata-rata" 
                    fill="#6366f1" 
                    radius={[6, 6, 0, 0]}
                  >
                    {subjectChartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={index % 2 === 0 ? '#6366f1' : '#10b981'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-900/10 rounded-xl border border-dashed border-slate-700/50">
                <BarChart2 size={36} className="text-slate-500 mb-2" />
                <p className="text-slate-400 text-sm font-medium">Belum ada data nilai</p>
                <p className="text-slate-500 text-xs mt-1">Silakan tambahkan data nilai mata pelajaran untuk melihat perbandingan statistik.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row with Upcoming Schedule & Sync History Logs */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-2">
        {/* Jadwal & Agenda Hari Ini */}
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl flex flex-col h-[380px]">
          <div className="flex items-center gap-2 mb-4 shrink-0">
            <BookOpen className="text-indigo-400 w-5 h-5" />
            <div>
              <h3 className="text-md font-semibold text-slate-100">Jadwal & Agenda Kelas Hari Ini</h3>
              <p className="text-xs text-slate-400">Roster, petugas piket harian, dan agenda mendatang</p>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-4 text-slate-300">
            {/* Hari & Tanggal */}
            <div className="flex justify-between items-center bg-slate-900/40 border border-slate-700/40 px-4 py-2.5 rounded-xl text-xs font-semibold">
              <span className="text-slate-300">Hari ini: <span className="text-indigo-400 font-bold uppercase">{['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][new Date().getDay()]}</span></span>
              <span className="text-slate-400 font-mono">{format(new Date(), 'dd MMMM yyyy', { locale: id })}</span>
            </div>

            {/* Roster & Piket Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Roster Card */}
              <div className="bg-slate-900/25 border border-slate-700/30 p-4 rounded-xl flex flex-col">
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2.5 flex items-center gap-1">
                  <Clock size={14} /> Roster Belajar
                </h4>
                {rosterToday.length > 0 ? (
                  <div className="space-y-2">
                    {rosterToday.map((r, i) => (
                      <div key={r.id || i} className="text-xs border-b border-slate-700/30 pb-2 last:border-0 last:pb-0">
                        <p className="font-bold text-slate-200 truncate">{r.mata_pelajaran}</p>
                        <p className="text-slate-400 text-[10px] flex items-center gap-1 mt-0.5 font-mono">
                          <span>{r.jam_mulai} - {r.jam_selesai}</span>
                          {r.guru && <span className="text-slate-500">({r.guru})</span>}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-xs italic my-auto py-4">Tidak ada jadwal belajar hari ini.</p>
                )}
              </div>

              {/* Piket Card */}
              <div className="bg-slate-900/25 border border-slate-700/30 p-4 rounded-xl flex flex-col">
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2.5 flex items-center gap-1">
                  <Users size={14} /> Petugas Piket
                </h4>
                {piketToday.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 py-1">
                    {piketToday.map((p, i) => (
                      <span key={p.id || i} className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-lg font-medium">
                        {p.nama_siswa}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-xs italic my-auto py-4">Tidak ada petugas piket hari ini.</p>
                )}
              </div>
            </div>

            {/* Upcoming Holidays / Agenda */}
            <div className="bg-slate-900/25 border border-slate-700/30 p-4 rounded-xl">
              <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2.5 flex items-center gap-1">
                <Calendar size={14} /> Agenda Libur / Event Mendatang (30 Hari)
              </h4>
              {upcomingHolidays.length > 0 ? (
                <div className="space-y-2.5">
                  {upcomingHolidays.map((h, i) => {
                    const isTodayHoliday = format(new Date(), 'yyyy-MM-dd') >= h.tanggal_mulai && format(new Date(), 'yyyy-MM-dd') <= h.tanggal_selesai;
                    return (
                      <div key={h.id || i} className={`text-xs p-2.5 rounded-lg border ${isTodayHoliday ? 'bg-rose-500/5 border-rose-500/20' : 'bg-slate-800/30 border-slate-700/30'} flex justify-between items-center gap-3`}>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-200 truncate">{h.nama}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {format(parseISO(h.tanggal_mulai), 'd MMM yyyy', { locale: id })} - {format(parseISO(h.tanggal_selesai), 'd MMM yyyy', { locale: id })}
                          </p>
                        </div>
                        {isTodayHoliday && (
                          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 uppercase tracking-wider shrink-0">Sedang Berlangsung</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-slate-500 text-xs italic py-2">Tidak ada agenda libur/event dalam 30 hari ke depan.</p>
              )}
            </div>
          </div>
        </div>

        {/* Riwayat Sinkronisasi (Log) */}
        <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-md shadow-xl flex flex-col h-[380px]">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <Cloud className="text-emerald-400 w-5 h-5" />
              <div>
                <h3 className="text-md font-semibold text-slate-100">Riwayat Sinkronisasi (Log)</h3>
                <p className="text-xs text-slate-400">Daftar log keberhasilan & kegagalan sinkronisasi data</p>
              </div>
            </div>
            
            <button 
              onClick={async () => {
                await store.syncLogs.clear();
                window.dispatchEvent(new CustomEvent('sync-log-changed'));
                toast.success('Log sinkronisasi dikosongkan!');
              }}
              className="px-2.5 py-1 text-rose-400 border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 rounded-lg text-[10px] font-bold uppercase transition-colors tracking-wider"
            >
              Hapus Log
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-2">
            {syncLogs.length > 0 ? (
              syncLogs.map((log, index) => {
                const isSuccess = log.status === 'success';
                const formattedTime = (() => {
                  try {
                    return format(parseISO(log.timestamp), 'dd MMM, HH:mm:ss');
                  } catch (e) {
                    return log.timestamp;
                  }
                })();
                return (
                  <div 
                    key={log.id || index} 
                    className={`p-3 rounded-xl border ${
                      isSuccess 
                        ? 'bg-emerald-500/5 border-emerald-500/20 text-slate-300' 
                        : 'bg-rose-500/5 border-rose-500/20 text-slate-300'
                    } flex justify-between items-center gap-4`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded tracking-wide uppercase ${
                          log.type === 'pull'
                            ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                            : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        }`}>
                          {log.type === 'pull' ? 'Ambil (Pull)' : 'Kirim (Push)'}
                        </span>
                        
                        <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded tracking-wide uppercase ${
                          isSuccess
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {isSuccess ? 'Sukses' : 'Gagal'}
                        </span>

                        <span className="text-[10px] text-slate-500 font-mono font-medium ml-auto">
                          {formattedTime}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 font-semibold mt-2">{log.message}</p>
                      {log.recordsCount !== undefined && log.recordsCount > 0 && (
                        <p className="text-[10px] text-slate-400 mt-1 font-mono">
                          Jumlah Record: <span className="font-bold text-slate-300">{log.recordsCount}</span>
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-6 bg-slate-900/10 rounded-xl border border-dashed border-slate-700/30 h-full">
                <Cloud size={32} className="text-slate-500 mb-2" />
                <p className="text-slate-400 text-xs font-semibold">Tidak ada log sinkronisasi</p>
                <p className="text-slate-500 text-[10px] mt-0.5">Lakukan sinkronisasi data untuk memantau integritas.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showPullConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Download className="text-emerald-400" size={24} />
              Konfirmasi Tarik Data
            </h3>
            <p className="text-slate-300 text-sm mb-4 leading-relaxed">
              Apakah Anda yakin ingin mengambil seluruh data dari Google Sheets cloud? 
              <br/><br/>
              <span className="text-rose-400 font-semibold">
                Perhatian: Perubahan lokal yang belum disinkronkan akan ditimpa oleh data dari cloud.
              </span>
            </p>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowPullConfirm(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-sm font-medium transition-colors"
              >
                Batal
              </button>
              <button
                onClick={async () => {
                  setShowPullConfirm(false);
                  if (onPullData) {
                    await onPullData();
                  }
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-emerald-600/20"
              >
                Ya, Tarik Data
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedContactStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 max-w-2xl w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-800 pb-4 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Phone className="text-indigo-400 animate-bounce-slow" size={20} />
                  Kirim Pesan Perhatian kepada Orang Tua
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Siswa: <strong className="text-indigo-300">{selectedContactStudent.nama}</strong> | Kelas: {selectedContactStudent.kelas}
                </p>
              </div>
              <button 
                onClick={() => setSelectedContactStudent(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-800/40 hover:bg-slate-850 transition-colors cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar my-4 pr-1 space-y-4">
              {/* Parent Info & Warning Detail */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/80 text-xs">
                <div className="space-y-1">
                  <p className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Informasi Orang Tua</p>
                  <p className="text-slate-300"><span className="text-slate-500">No. WA:</span> <strong className="text-slate-200 font-mono">{selectedContactStudent.no_telp_ortu}</strong></p>
                  <p className="text-slate-300"><span className="text-slate-500">Nama Ayah:</span> {selectedContactStudent.nama_ayah || '-'}</p>
                  <p className="text-slate-300"><span className="text-slate-500">Nama Ibu:</span> {selectedContactStudent.nama_ibu || '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Pusat Perhatian Guru</p>
                  {selectedContactStudent.detailNilai && (
                    <div className="text-rose-400 flex items-start gap-1">
                      <span className="mt-0.5">•</span>
                      <span>{selectedContactStudent.detailNilai}</span>
                    </div>
                  )}
                  {selectedContactStudent.detailAbsen && (
                    <div className="text-amber-400 flex items-start gap-1">
                      <span className="mt-0.5">•</span>
                      <span>{selectedContactStudent.detailAbsen}</span>
                    </div>
                  )}
                  {!selectedContactStudent.detailNilai && !selectedContactStudent.detailAbsen && (
                    <p className="text-slate-400 italic">Tidak ada detail peringatan sistem.</p>
                  )}
                </div>
              </div>

              {/* Template Type Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Pilih Template Pesan WhatsApp:</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleTemplateTypeChange('akademik')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all text-left flex flex-col justify-between cursor-pointer h-16 ${
                      selectedTemplateType === 'akademik'
                        ? 'bg-rose-500/10 text-rose-300 border-rose-500/50 shadow-md shadow-rose-500/5'
                        : 'bg-slate-800/40 text-slate-400 border-transparent hover:border-slate-700/60 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-[9px] opacity-60 font-bold uppercase tracking-wider">Akademik</span>
                    <span className="truncate mt-1 text-[11px]">⚠️ Nilai & KKM</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTemplateTypeChange('kehadiran')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all text-left flex flex-col justify-between cursor-pointer h-16 ${
                      selectedTemplateType === 'kehadiran'
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/50 shadow-md shadow-amber-500/5'
                        : 'bg-slate-800/40 text-slate-400 border-transparent hover:border-slate-700/60 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-[9px] opacity-60 font-bold uppercase tracking-wider">Absensi</span>
                    <span className="truncate mt-1 text-[11px]">📅 Kehadiran</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTemplateTypeChange('keduanya')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all text-left flex flex-col justify-between cursor-pointer h-16 ${
                      selectedTemplateType === 'keduanya'
                        ? 'bg-purple-500/10 text-purple-300 border-purple-500/50 shadow-md shadow-purple-500/5'
                        : 'bg-slate-800/40 text-slate-400 border-transparent hover:border-slate-700/60 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-[9px] opacity-60 font-bold uppercase tracking-wider">Keduanya</span>
                    <span className="truncate mt-1 text-[11px]">🚨 Nilai & Absen</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTemplateTypeChange('kustom')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all text-left flex flex-col justify-between cursor-pointer h-16 ${
                      selectedTemplateType === 'kustom'
                        ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/50 shadow-md shadow-indigo-500/5'
                        : 'bg-slate-800/40 text-slate-400 border-transparent hover:border-slate-700/60 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-[9px] opacity-60 font-bold uppercase tracking-wider">Bebas</span>
                    <span className="truncate mt-1 text-[11px]">✏️ Pesan Kustom</span>
                  </button>
                </div>
              </div>

              {/* Message Input / Editor */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Isi Pesan WhatsApp:</label>
                  <span className="text-[10px] text-slate-500 font-medium font-mono">Dapat diedit langsung sesuai kebutuhan</span>
                </div>
                <textarea
                  value={editedMessage}
                  onChange={e => setEditedMessage(e.target.value)}
                  rows={8}
                  className="w-full p-4 bg-slate-950 text-slate-200 border border-slate-850 focus:border-indigo-500/60 rounded-xl text-xs outline-none focus:ring-1 focus:ring-indigo-500/30 transition-all font-sans leading-relaxed custom-scrollbar"
                  placeholder="Ketik pesan Anda untuk orang tua siswa..."
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col sm:flex-row gap-3 justify-between border-t border-slate-800 pt-4 shrink-0">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(editedMessage);
                  toast.success('Pesan berhasil disalin ke clipboard!');
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-slate-700/30"
              >
                Salin Pesan
              </button>
              
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedContactStudent(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer border border-transparent"
                >
                  Batal
                </button>
                <a
                  href={`https://wa.me/${formatWhatsAppNumber(selectedContactStudent.no_telp_ortu)}?text=${encodeURIComponent(editedMessage)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setSelectedContactStudent(null)}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-lg shadow-emerald-600/10 flex items-center justify-center gap-1.5"
                >
                  Kirim via WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
