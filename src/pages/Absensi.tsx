import React, { useState, useEffect, useMemo } from 'react';
import { store, Student, Attendance, Settings, CustomHoliday, pauseNotifications, resumeNotifications } from '../lib/store';
import { v4 as uuidv4 } from 'uuid';
import { Download, Save, Calendar, Trash2, Plus, Info, AlertTriangle, CheckSquare, Pencil } from 'lucide-react';
import Pagination from '../components/Pagination';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import toast from 'react-hot-toast';

interface AbsensiProps {
  semester: string;
  role: 'guru' | 'kepsek';
  settings: Settings | null;
  setSettings: React.Dispatch<React.SetStateAction<Settings | null>>;
}

export default function Absensi({ semester, role, settings, setSettings }: AbsensiProps) {
  const [activeTab, setActiveTab] = useState<'Harian' | 'Rekap' | 'Libur'>('Harian');
  const [rekapFilter, setRekapFilter] = useState<'Hari Ini' | 'Minggu Ini' | 'Bulan Ini' | 'Semester' | 'Kustom'>('Semester');
  const [customStartDate, setCustomStartDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState<string>(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [students, setStudents] = useState<Student[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  
  // Local modifications before saving
  const [localStatuses, setLocalStatuses] = useState<Record<string, 'Hadir' | 'Sakit' | 'Izin' | 'Alpa'>>({});

  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [filterClass, setFilterClass] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [targetAttendance, setTargetAttendance] = useState<number>(80);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterClass, activeTab, semester, selectedDate]);

  // Form states for creating custom holidays
  const [newHolidayName, setNewHolidayName] = useState('');
  const [holidayType, setHolidayType] = useState<'perhari' | 'kolektif'>('perhari');
  const [holidayDate, setHolidayDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [holidayStartDate, setHolidayStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [holidayEndDate, setHolidayEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [editingHolidayId, setEditingHolidayId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [semester, selectedDate]);

  const loadData = async () => {
    const sList: Student[] = [];
    await store.students.iterate<Student, void>((v) => {
      if (!v.semester || v.semester === semester) {
        if (v.kelas && v.kelas.toLowerCase() === 'alumni') {
          return;
        }
        sList.push(v);
      }
    });
    setStudents(sList.sort((a, b) => a.no - b.no));

    const aList: Attendance[] = [];
    const localVals: Record<string, 'Hadir' | 'Sakit' | 'Izin' | 'Alpa'> = {};
    await store.attendance.iterate<Attendance, void>((v) => {
      if (v.semester === semester) {
        aList.push(v);
        if (v.tanggal === selectedDate) {
          localVals[v.id_siswa] = v.status;
        }
      }
    });
    setAttendances(aList);
    setLocalStatuses(localVals);
  };

  const filteredStudents = students.filter(s => filterClass 
    ? s.kelas === filterClass 
    : (!s.kelas || s.kelas.toLowerCase() !== 'alumni'));
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const uniqueClasses = Array.from(new Set(students.map(s => s.kelas))).filter(Boolean);

  // Helper to determine if a date is Sunday, Saturday (if 5-day school), or a custom holiday
  const checkHoliday = (date: Date): { isLibur: boolean; desc: string } => {
    if (date.getDay() === 0) {
      return { isLibur: true, desc: 'Hari Minggu' };
    }
    const isFiveDaySchool = (settings?.hari_sekolah ?? 5) === 5;
    if (isFiveDaySchool && date.getDay() === 6) {
      return { isLibur: true, desc: 'Hari Sabtu (Libur Akhir Pekan)' };
    }
    const customHols = settings?.holidays || [];
    const dateStr = format(date, 'yyyy-MM-dd');
    const found = customHols.find(h => dateStr >= h.tanggal_mulai && dateStr <= h.tanggal_selesai);
    if (found) {
      return { isLibur: true, desc: found.nama };
    }
    return { isLibur: false, desc: '' };
  };

  // Determine holiday status of the currently selected date
  const currentHolidayStatus = useMemo(() => {
    try {
      const d = parseISO(selectedDate);
      return checkHoliday(d);
    } catch (e) {
      return { isLibur: false, desc: '' };
    }
  }, [selectedDate, settings?.holidays]);

  // Determine rekap range
  const rekapRange = useMemo(() => {
    const now = new Date();
    let startDate = now;
    let endDate = now;

    if (rekapFilter === 'Hari Ini') {
      startDate = now;
      endDate = now;
    } else if (rekapFilter === 'Minggu Ini') {
      startDate = startOfWeek(now, { weekStartsOn: 1 });
      endDate = endOfWeek(now, { weekStartsOn: 1 });
    } else if (rekapFilter === 'Bulan Ini') {
      startDate = startOfMonth(now);
      endDate = endOfMonth(now);
    } else if (rekapFilter === 'Kustom') {
      try {
        startDate = parseISO(customStartDate);
        endDate = parseISO(customEndDate);
      } catch (e) {
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
      }
    }

    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
  }, [rekapFilter, customStartDate, customEndDate]);

  // List of all dates in selected rekap range
  const datesList = useMemo(() => {
    if (rekapFilter === 'Semester') return [];
    const { startDate, endDate } = rekapRange;
    
    const list: Date[] = [];
    let curr = new Date(startDate);
    curr.setHours(0, 0, 0, 0);
    const last = new Date(endDate);
    last.setHours(0, 0, 0, 0);
    
    let count = 0;
    while (curr <= last && count < 365) {
      list.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
      count++;
    }
    return list;
  }, [rekapRange, rekapFilter]);

  // If period length <= 31 days, show detailed daily grid
  const isDetailed = useMemo(() => {
    return rekapFilter !== 'Semester' && datesList.length <= 31;
  }, [rekapFilter, datesList]);

  // Calculate stats for each student in the range
  const rekapData = useMemo(() => {
    const { startDate, endDate } = rekapRange;
    const isSem = rekapFilter === 'Semester';

    // In semester mode, estimate active range from actual attendance records
    let calcStart = startDate;
    let calcEnd = endDate;

    if (isSem) {
      if (attendances.length > 0) {
        const dates = attendances.map(a => a.tanggal).filter(Boolean).sort();
        if (dates.length > 0) {
          try {
            calcStart = parseISO(dates[0]);
            calcEnd = parseISO(dates[dates.length - 1]);
          } catch (e) {}
        }
      }
    }

    // Generate date sequence for calculating holiday totals
    const rangeDates: Date[] = [];
    let curr = new Date(calcStart);
    curr.setHours(0, 0, 0, 0);
    const last = new Date(calcEnd);
    last.setHours(0, 0, 0, 0);
    
    let count = 0;
    while (curr <= last && count < 366) {
      rangeDates.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
      count++;
    }

    // Precalculate holidays & Sundays in range
    let liburCount = 0;
    rangeDates.forEach(d => {
      const hol = checkHoliday(d);
      if (hol.isLibur) liburCount++;
    });
    
    const activeDaysCount = rangeDates.length - liburCount;

    return filteredStudents.map(s => {
      const sAtt = attendances.filter(a => {
        if (a.id_siswa !== s.id) return false;
        if (isSem) return true;
        try {
          const aDate = parseISO(a.tanggal);
          return isWithinInterval(aDate, { start: startDate, end: endDate });
        } catch (e) {
          return false;
        }
      });

      const Hadir = sAtt.filter(a => a.status === 'Hadir').length;
      const Sakit = sAtt.filter(a => a.status === 'Sakit').length;
      const Izin = sAtt.filter(a => a.status === 'Izin').length;
      const Alpa = sAtt.filter(a => a.status === 'Alpa').length;

      // Ensure active days calculation reflects actual recorded statuses if not in detailed mode
      const activeDays = activeDaysCount > 0 ? activeDaysCount : (Hadir + Sakit + Izin + Alpa);
      const persentase = activeDays > 0 ? Math.round((Hadir / activeDays) * 100) : 0;

      return {
        ...s,
        rawAttendances: sAtt,
        Hadir,
        Sakit,
        Izin,
        Alpa,
        Libur: liburCount,
        HariAktif: activeDays,
        PersentaseKehadiran: persentase
      };
    });
  }, [attendances, filteredStudents, rekapFilter, rekapRange, settings?.holidays]);

  const paginatedRekapData = useMemo(() => {
    return rekapData.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [rekapData, currentPage, pageSize]);

  const setLocalStatus = (studentId: string, status: 'Hadir' | 'Sakit' | 'Izin' | 'Alpa') => {
    setLocalStatuses(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  const markAll = (status: 'Hadir' | 'Sakit' | 'Izin' | 'Alpa') => {
    if (currentHolidayStatus.isLibur) return;
    const newStatuses = { ...localStatuses };
    filteredStudents.forEach(s => {
      if (s.kelas !== 'Alumni') {
        newStatuses[s.id] = status;
      }
    });
    setLocalStatuses(newStatuses);
  };

  const saveAbsensi = async () => {
    if (currentHolidayStatus.isLibur) {
      toast.error('Tidak dapat menyimpan absensi pada hari libur.');
      return;
    }
    setIsSaving(true);
    pauseNotifications();
    try {
      const promises: Promise<any>[] = [];
      for (const student of filteredStudents) {
        if (student.kelas === 'Alumni') continue;
        const status = localStatuses[student.id];
        if (status) {
          const existing = attendances.find(a => a.id_siswa === student.id && a.tanggal === selectedDate);
          if (existing) {
            if (existing.status !== status) {
              existing.status = status;
              promises.push(store.attendance.setItem(existing.id, existing));
            }
          } else {
            const newAtt: Attendance = {
              id: uuidv4(),
              id_siswa: student.id,
              tanggal: selectedDate,
              status,
              semester
            };
            promises.push(store.attendance.setItem(newAtt.id, newAtt));
          }
        }
      }
      if (promises.length > 0) {
        await Promise.all(promises);
      }
      toast.success('Absensi berhasil disimpan!', { duration: 3000 });
      loadData();
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch(e) {
      console.error(e);
      toast.error('Gagal menyimpan absensi', { duration: 3000 });
    } finally {
      setIsSaving(false);
      resumeNotifications(true);
    }
  };

  const handleStartEditHoliday = (h: CustomHoliday) => {
    setEditingHolidayId(h.id);
    setNewHolidayName(h.nama);
    setHolidayType(h.jenis);
    if (h.jenis === 'perhari') {
      setHolidayDate(h.tanggal_mulai);
    } else {
      setHolidayStartDate(h.tanggal_mulai);
      setHolidayEndDate(h.tanggal_selesai);
    }
  };

  const handleCancelEditHoliday = () => {
    setEditingHolidayId(null);
    setNewHolidayName('');
    setHolidayType('perhari');
    setHolidayDate(format(new Date(), 'yyyy-MM-dd'));
    setHolidayStartDate(format(new Date(), 'yyyy-MM-dd'));
    setHolidayEndDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const handleAddHoliday = async () => {
    if (!newHolidayName.trim()) {
      toast.error('Nama hari libur harus diisi');
      return;
    }

    const tMulai = holidayType === 'perhari' ? holidayDate : holidayStartDate;
    const tSelesai = holidayType === 'perhari' ? holidayDate : holidayEndDate;

    if (tMulai > tSelesai) {
      toast.error('Tanggal mulai tidak boleh melebihi tanggal selesai');
      return;
    }

    const currentHolidays = settings?.holidays || [];
    let updatedHolidays: CustomHoliday[] = [];

    if (editingHolidayId) {
      updatedHolidays = currentHolidays.map(h => {
        if (h.id === editingHolidayId) {
          return {
            ...h,
            nama: newHolidayName,
            tanggal_mulai: tMulai,
            tanggal_selesai: tSelesai,
            jenis: holidayType
          };
        }
        return h;
      });
    } else {
      const newHoliday: CustomHoliday = {
        id: uuidv4(),
        nama: newHolidayName,
        tanggal_mulai: tMulai,
        tanggal_selesai: tSelesai,
        jenis: holidayType
      };
      updatedHolidays = [...currentHolidays, newHoliday];
    }

    if (settings && setSettings) {
      const updatedSettings: Settings = {
        ...settings,
        holidays: updatedHolidays
      };
      
      try {
        await store.settings.setItem('app_settings', updatedSettings);
        setSettings(updatedSettings);
        toast.success(editingHolidayId ? 'Hari libur berhasil diperbarui!' : 'Hari libur berhasil ditambahkan!');
        setNewHolidayName('');
        setEditingHolidayId(null);
        window.dispatchEvent(new Event('data-changed'));
        window.dispatchEvent(new Event('trigger-immediate-sync'));
      } catch (err) {
        console.error(err);
        toast.error('Gagal menyimpan hari libur');
      }
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    if (!settings || !setSettings) return;

    const currentHolidays = settings.holidays || [];
    const updatedHolidays = currentHolidays.filter(h => h.id !== id);

    const updatedSettings: Settings = {
      ...settings,
      holidays: updatedHolidays
    };

    try {
      await store.settings.setItem('app_settings', updatedSettings);
      setSettings(updatedSettings);
      toast.success('Hari libur berhasil dihapus');
      window.dispatchEvent(new Event('data-changed'));
      window.dispatchEvent(new Event('trigger-immediate-sync'));
    } catch (err) {
      console.error(err);
      toast.error('Gagal menghapus hari libur');
    }
  };

  const exportExcel = async () => {
    const data = rekapData.map(s => {
      const row: any = {
        No: s.no,
        Kelas: s.kelas,
        NISN: s.nisn || '-',
        Nama: s.nama,
      };

      if (isDetailed) {
        datesList.forEach(d => {
          const dateStr = format(d, 'yyyy-MM-dd');
          const colLabel = format(d, 'dd/MM');
          const hol = checkHoliday(d);
          if (hol.isLibur) {
            row[colLabel] = 'L';
          } else {
            const att = s.rawAttendances.find(a => a.tanggal === dateStr);
            row[colLabel] = att ? att.status[0] : '-';
          }
        });
        row['Hari Aktif'] = s.HariAktif;
        row['Hadir'] = s.Hadir;
        row['Sakit'] = s.Sakit;
        row['Izin'] = s.Izin;
        row['Alpa'] = s.Alpa;
        row['Libur'] = s.Libur;
        row['% Kehadiran'] = `${s.PersentaseKehadiran}%`;
      } else {
        row['Hari Aktif'] = s.HariAktif;
        row['Hadir'] = s.Hadir;
        row['Sakit'] = s.Sakit;
        row['Izin'] = s.Izin;
        row['Alpa'] = s.Alpa;
        row['Libur'] = s.Libur;
        row['% Kehadiran'] = `${s.PersentaseKehadiran}%`;
      }

      return row;
    });
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Absensi");
    XLSX.writeFile(wb, `Rekap_Absensi_${semester}_${filterClass || 'Semua'}_${rekapFilter}.xlsx`);
  };

  const exportPDF = async () => {
    const doc = new jsPDF({
      orientation: isDetailed ? 'landscape' : 'portrait'
    });

    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // Helper to draw vector Tut Wuri Handayani logo
    const drawTutWuriLogo = (x: number, y: number) => {
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.5);
      doc.ellipse(x, y, 9, 9, 'S');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(6);
      doc.text('TUT WURI', x, y - 2, { align: 'center' });
      doc.text('HANDAYANI', x, y + 1, { align: 'center' });
      doc.setFontSize(5);
      doc.text('★ ★ ★', x, y + 4, { align: 'center' });
    };

    // Draw customizable Kop Surat
    const pda = settings?.kop_pemerintah || 'PEMERINTAH KOTA / KABUPATEN';
    const dinas = settings?.kop_dinas || 'DINAS PENDIDIKAN DAN KEBUDAYAAN';
    const sekolah = settings?.nama_sekolah || 'NAMA SEKOLAH BELUM DIATUR';
    const alamat = settings?.alamat || 'Alamat Sekolah Belum Diatur';
    const npsn = settings?.npsn || '-';
    const email = settings?.email || '-';
    const logoType = settings?.kop_logo_type || 'tutwuri';
    const logoBase64 = settings?.kop_logo_base64;

    const hasLogo = logoType !== 'none';
    const textShiftX = hasLogo ? 10 : 0;

    if (hasLogo) {
      if (logoType === 'custom' && logoBase64) {
        try {
          doc.addImage(logoBase64, 'PNG', 14, 8, 22, 22);
        } catch (e) {
          console.error('Error rendering custom logo:', e);
          drawTutWuriLogo(25, 19);
        }
      } else {
        drawTutWuriLogo(25, 19);
      }
    }

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text(pda.toUpperCase(), pageWidth / 2 + textShiftX, 12, { align: 'center' });
    doc.text(dinas.toUpperCase(), pageWidth / 2 + textShiftX, 17, { align: 'center' });
    
    doc.setFontSize(14);
    doc.text(sekolah.toUpperCase(), pageWidth / 2 + textShiftX, 23, { align: 'center' });
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Alamat: ${alamat}  |  NPSN: ${npsn}  |  Email: ${email}`, pageWidth / 2 + textShiftX, 28, { align: 'center' });
    
    // Double lines divider
    doc.setLineWidth(0.8);
    doc.setDrawColor(148, 163, 184);
    doc.line(14, 31, pageWidth - 14, 31);
    doc.setLineWidth(0.2);
    doc.line(14, 32.2, pageWidth - 14, 32.2);

    // 2. Document Title and Metadata
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text('REKAPITULASI KEHADIRAN SISWA', pageWidth / 2, 40, { align: 'center' });
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Semester: ${semester} | Periode: ${rekapFilter} | Kelas: ${filterClass || 'Semua Kelas'}`, pageWidth / 2, 45, { align: 'center' });

    let headers: string[][];
    let body: any[][];

    if (isDetailed) {
      const dateHeaders = datesList.map(d => format(d, 'd/M'));
      headers = [['No', 'Kelas', 'Nama', ...dateHeaders, 'Aktif', 'Hadir', 'Sakit', 'Izin', 'Alpa', 'Libur', '%']];
      body = rekapData.map(s => {
        const dateVals = datesList.map(d => {
          const dateStr = format(d, 'yyyy-MM-dd');
          const hol = checkHoliday(d);
          if (hol.isLibur) return 'L';
          const att = s.rawAttendances.find(a => a.tanggal === dateStr);
          return att ? att.status[0] : '-';
        });
        return [
          s.no, s.kelas, s.nama,
          ...dateVals,
          s.HariAktif, s.Hadir, s.Sakit, s.Izin, s.Alpa, s.Libur, `${s.PersentaseKehadiran}%`
        ];
      });
    } else {
      headers = [['No', 'Kelas', 'Nama', 'Hari Aktif', 'Hadir', 'Sakit', 'Izin', 'Alpa', 'Libur', '% Kehadiran']];
      body = rekapData.map(s => [
        s.no, s.kelas, s.nama,
        s.HariAktif, s.Hadir, s.Sakit, s.Izin, s.Alpa, s.Libur, `${s.PersentaseKehadiran}%`
      ]);
    }

    autoTable(doc, {
      head: headers,
      body: body,
      startY: 49,
      styles: {
        fontSize: isDetailed ? 7 : 9,
        cellPadding: isDetailed ? 1 : 2,
        halign: 'center',
        textColor: [30, 41, 59]
      },
      headStyles: {
        fillColor: [79, 70, 229], // Indigo 600
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      }
    });
    
    const finalY = (doc as any).lastAutoTable.finalY || 49;
    
    // Signatures Section (Tanda Tangan)
    let sigY = finalY + 12;
    if (sigY + 35 > pageHeight) {
      doc.addPage();
      sigY = 20;
    }

    const getCityFromAlamat = (alamatStr?: string) => {
      if (!alamatStr || alamatStr.trim() === 'Alamat Sekolah Belum Diatur' || alamatStr.trim() === '') return 'Jakarta';
      const cleanAlamat = alamatStr.replace(/[\r\n]+/g, ' ').trim();
      const parts = cleanAlamat.split(',').map(p => p.trim()).filter(Boolean);
      for (const part of parts) {
        const pLower = part.toLowerCase();
        if (pLower.startsWith('kota ')) return part.substring(5).trim();
        if (pLower.startsWith('kabupaten ')) return part.substring(10).trim();
        if (pLower.startsWith('kab. ')) return part.substring(5).trim();
      }
      const filteredParts = parts.filter(p => !/^\d+$/.test(p));
      if (filteredParts.length > 0) {
        const lastPart = filteredParts[filteredParts.length - 1];
        if (lastPart.length < 25) return lastPart;
      }
      return 'Jakarta';
    };

    const city = getCityFromAlamat(settings?.alamat);
    const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    
    // Left signature (Kepala Sekolah)
    const leftX = 20;
    doc.text('Mengetahui,', leftX, sigY);
    doc.text('Kepala Sekolah,', leftX, sigY + 5);
    doc.setFont('Helvetica', 'bold');
    doc.text(settings?.nama_kepala_sekolah || '................................................', leftX, sigY + 25);
    doc.setFont('Helvetica', 'normal');
    doc.text(`NIP. ${settings?.nip_kepala_sekolah || '................................................'}`, leftX, sigY + 29);
    
    // Right signature (Wali Kelas)
    const rightX = isDetailed ? pageWidth - 80 : pageWidth - 70;
    doc.text(`${city}, ${today}`, rightX, sigY);
    doc.text('Guru Kelas / Wali Kelas,', rightX, sigY + 5);
    doc.setFont('Helvetica', 'bold');
    doc.text(settings?.nama_wali_kelas || '................................................', rightX, sigY + 25);
    doc.setFont('Helvetica', 'normal');
    doc.text(`NIP. ${settings?.nip_wali_kelas || '................................................'}`, rightX, sigY + 29);

    // Page numbers loop
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      if (totalPages > 1) {
        doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
      } else {
        doc.text(`Halaman ${i}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
      }
    }

    doc.save(`Rekap_Absensi_${semester}_${filterClass || 'Semua'}_${rekapFilter}.pdf`);
  };

  return (
    <div className="flex flex-col h-full text-slate-200">
      <div className="p-4 border-b border-slate-700/50 flex flex-wrap justify-between items-center bg-slate-900/40 gap-4">
        <div className="flex bg-slate-800 rounded-xl border border-slate-700 p-1">
          {(['Harian', 'Rekap', 'Libur'] as const).map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === tab ? 'bg-indigo-500/20 text-indigo-300 shadow-[inset_0_1px_0_0_rgba(99,102,241,0.2)]' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
            >
              {tab === 'Libur' ? 'Hari Libur' : tab}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          {activeTab === 'Harian' && (
            <input 
              type="date" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 [color-scheme:dark] transition-all"
            />
          )}

          {activeTab === 'Rekap' && (
            <div className="flex items-center gap-2">
              <select 
                value={rekapFilter}
                onChange={e => setRekapFilter(e.target.value as any)}
                className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all cursor-pointer"
              >
                <option value="Hari Ini">Hari Ini</option>
                <option value="Minggu Ini">Minggu Ini</option>
                <option value="Bulan Ini">Bulan Ini</option>
                <option value="Semester">Semester</option>
                <option value="Kustom">Kustom</option>
              </select>
              {rekapFilter === 'Kustom' && (
                <div className="flex items-center gap-2 ml-2">
                  <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 [color-scheme:dark] transition-all" />
                  <span className="text-slate-500">-</span>
                  <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 [color-scheme:dark] transition-all" />
                </div>
              )}
            </div>
          )}

          {activeTab !== 'Libur' && (
            <select 
              value={filterClass}
              onChange={e => setFilterClass(e.target.value)}
              className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all cursor-pointer"
            >
              <option value="">Semua Kelas</option>
              {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
        
        <div className="flex gap-3">
          {activeTab === 'Harian' && role === 'guru' && (
            <>
              <button 
                onClick={() => markAll('Hadir')} 
                disabled={currentHolidayStatus.isLibur}
                className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-5 py-2 rounded-xl text-sm font-medium hover:bg-emerald-500/30 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
              >
                Hadir Semua
              </button>
              <button 
                onClick={saveAbsensi} 
                disabled={isSaving || currentHolidayStatus.isLibur} 
                className="bg-indigo-500 disabled:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-500/20 flex items-center gap-2"
              >
                <Save size={16} /> Simpan
              </button>
            </>
          )}
          {activeTab === 'Rekap' && (
            <>
              <button onClick={exportExcel} className="bg-emerald-600 hover:bg-emerald-500 border border-slate-700 px-4 py-2 rounded-xl flex items-center gap-2 text-sm text-white font-medium shadow-lg shadow-emerald-500/20 transition-colors ml-2">
                <Download size={16} /> Rekap Excel
              </button>
              <button onClick={exportPDF} className="bg-rose-600 hover:bg-rose-500 border border-slate-700 px-4 py-2 rounded-xl flex items-center gap-2 text-sm text-white font-medium shadow-lg shadow-rose-500/20 transition-colors">
                <Download size={16} /> Rekap PDF
              </button>
            </>
          )}
        </div>
      </div>

      {activeTab === 'Harian' && currentHolidayStatus.isLibur && (
        <div className="mx-6 my-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center gap-3 text-amber-300 shadow-lg">
          <Info size={20} className="shrink-0 text-amber-400" />
          <div className="text-xs">
            <span className="font-bold">Pemberitahuan Hari Libur: </span>
            Tanggal yang dipilih adalah <span className="underline font-semibold">{currentHolidayStatus.desc}</span>. Absensi tidak aktif dan siswa otomatis ditandai libur.
          </div>
        </div>
      )}

      <div className="overflow-auto flex-1 custom-scrollbar">
        {activeTab === 'Harian' && (
          <>
            <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase bg-slate-800/80 sticky top-0 backdrop-blur-sm z-10 text-slate-400">
              <tr>
                <th className="px-6 py-4 border-b border-slate-700/50 w-16 font-medium">No</th>
                <th className="px-6 py-4 border-b border-slate-700/50 w-28 font-medium">Kelas</th>
                <th className="px-6 py-4 border-b border-r border-slate-700/50 sticky left-0 bg-slate-800/90 backdrop-blur-md shadow-[1px_0_0_0_rgba(51,65,85,0.5)] font-medium z-20">Nama Siswa</th>
                <th className="px-6 py-4 border-b border-slate-700/50 text-center w-28 text-emerald-400">Hadir</th>
                <th className="px-6 py-4 border-b border-slate-700/50 text-center w-28 text-amber-400">Sakit</th>
                <th className="px-6 py-4 border-b border-slate-700/50 text-center w-28 text-sky-400">Izin</th>
                <th className="px-6 py-4 border-b border-slate-700/50 text-center w-28 text-rose-400">Alpa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {paginatedStudents.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">Belum ada data siswa.</td></tr>
              ) : (
                paginatedStudents.map((student, index) => {
                  const status = currentHolidayStatus.isLibur ? undefined : localStatuses[student.id];
                  return (
                    <tr key={student.id} className="hover:bg-slate-700/30 transition-colors group">
                      <td className="px-6 py-4 text-slate-400">{(currentPage - 1) * pageSize + index + 1}</td>
                      <td className="px-6 py-4 text-slate-400">{student.kelas}</td>
                      <td className="px-6 py-4 border-r border-slate-700/50 font-medium text-slate-200 sticky left-0 bg-slate-800/40 backdrop-blur-md shadow-[1px_0_0_0_rgba(51,65,85,0.5)] z-10 group-hover:bg-slate-700/50 transition-colors">
                        {student.nama}
                      </td>
                      
                      {['Hadir', 'Sakit', 'Izin', 'Alpa'].map((opt) => (
                        <td key={opt} className="px-6 py-4 text-center">
                          <label className={`flex items-center justify-center w-full h-full p-2 rounded-lg transition-colors ${role === 'guru' && student.kelas !== 'Alumni' && !currentHolidayStatus.isLibur ? 'cursor-pointer hover:bg-slate-700/50' : 'cursor-not-allowed opacity-50'}`}>
                            <input 
                              type="radio" 
                              name={`status-${student.id}`}
                              checked={status === opt}
                              disabled={role === 'kepsek' || student.kelas === 'Alumni' || currentHolidayStatus.isLibur}
                              onChange={() => {
                                if (student.kelas !== 'Alumni' && !currentHolidayStatus.isLibur) {
                                  setLocalStatus(student.id, opt as any);
                                }
                              }}
                              className="w-4 h-4 cursor-pointer text-indigo-500 focus:ring-indigo-500 bg-slate-800 border-slate-600 disabled:cursor-not-allowed"
                            />
                          </label>
                        </td>
                      ))}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
          <Pagination
            totalItems={filteredStudents.length}
            currentPage={currentPage}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            itemName="siswa"
          />
          </>
        )}

        {activeTab === 'Rekap' && (
          <>
            {/* Target Percentage Config & Alert Banner */}
            <div className="bg-slate-800/35 border border-slate-700/50 rounded-2xl p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl animate-pulse">
                  <Info size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">Batas Target Kehadiran Minimal</h4>
                  <p className="text-xs text-slate-400">Tentukan batas persentase kehadiran minimum untuk memantau siswa secara otomatis</p>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-700/60 p-2 rounded-xl">
                <span className="text-xs text-slate-400 font-medium pl-1">Target Kehadiran:</span>
                <input 
                  type="number" 
                  min="0" 
                  max="100" 
                  value={targetAttendance} 
                  onChange={e => setTargetAttendance(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                  className="w-16 px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-sm text-center outline-none focus:ring-2 focus:ring-indigo-500 font-bold font-mono text-indigo-300 cursor-pointer"
                />
                <span className="text-sm font-bold text-indigo-400">%</span>
              </div>
            </div>

            {/* Attendance Alert Banner */}
            {rekapData.filter(s => s.PersentaseKehadiran < targetAttendance).length > 0 && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-4 rounded-xl mb-6 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-slate-100">Pemberitahuan Kehadiran di Bawah Target ({targetAttendance}%)</p>
                  <p className="text-slate-300 mt-1">
                    Terdapat <span className="font-bold text-rose-300">{rekapData.filter(s => s.PersentaseKehadiran < targetAttendance).length} siswa</span> dengan persentase kehadiran di bawah target minimal. Hubungi orang tua siswa yang ditandai merah untuk melakukan tindak lanjut.
                  </p>
                </div>
              </div>
            )}

            <table className="w-full text-sm text-left border-collapse border border-slate-700/60">
            <thead className="text-xs uppercase bg-slate-800/90 sticky top-0 backdrop-blur-sm z-10 text-slate-400">
              <tr>
                <th className="px-4 py-4 border border-slate-700/60 w-12 font-medium">No</th>
                <th className="px-4 py-4 border border-slate-700/60 w-16 font-medium">Kelas</th>
                <th className="px-4 py-4 border border-r border-slate-700/60 sticky left-0 bg-slate-800/95 backdrop-blur-md shadow-[1px_0_0_0_rgba(51,65,85,0.5)] font-bold z-20 min-w-[160px]">Nama Siswa</th>
                
                {/* Rincian perhari jika <= 31 hari */}
                {isDetailed && datesList.map(d => {
                  const dStr = format(d, 'yyyy-MM-dd');
                  const hol = checkHoliday(d);
                  return (
                    <th 
                      key={dStr} 
                      className={`px-1 py-3 border border-slate-700/60 text-center min-w-[38px] text-[10px] ${
                        hol.isLibur ? 'bg-rose-500/10 text-rose-300' : 'text-slate-300'
                      }`}
                      title={hol.isLibur ? hol.desc : format(d, 'EEEE, d MMMM yyyy', { locale: id })}
                    >
                      <div className="font-bold">{format(d, 'd')}</div>
                      <div className="text-[8px] opacity-65 uppercase">{format(d, 'eee', { locale: id }).substring(0, 3)}</div>
                    </th>
                  );
                })}

                {/* Kolom rincian agregat akhir */}
                <th className="px-3 py-4 border border-slate-700/60 text-center w-16 text-indigo-400 font-semibold text-xs">Aktif</th>
                <th className="px-3 py-4 border border-slate-700/60 text-center w-16 text-emerald-400 font-semibold text-xs">Hadir</th>
                <th className="px-3 py-4 border border-slate-700/60 text-center w-16 text-amber-400 font-semibold text-xs">Sakit</th>
                <th className="px-3 py-4 border border-slate-700/60 text-center w-16 text-sky-400 font-semibold text-xs">Izin</th>
                <th className="px-3 py-4 border border-slate-700/60 text-center w-16 text-rose-400 font-semibold text-xs">Alpa</th>
                <th className="px-3 py-4 border border-slate-700/60 text-center w-16 text-slate-400 font-semibold text-xs">Libur</th>
                <th className="px-4 py-4 border border-slate-700/60 text-center w-24 text-indigo-300 font-bold text-xs">% Hadir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {paginatedRekapData.length === 0 ? (
                <tr>
                  <td colSpan={isDetailed ? 10 + datesList.length : 10} className="px-6 py-12 text-center text-slate-500">
                    Belum ada data rekap.
                  </td>
                </tr>
              ) : (
                paginatedRekapData.map((student, index) => (
                  <tr key={student.id} className="hover:bg-slate-700/20 transition-colors group">
                    <td className="px-4 py-3.5 border border-slate-700/60 text-slate-400">{(currentPage - 1) * pageSize + index + 1}</td>
                    <td className="px-4 py-3.5 border border-slate-700/60 text-slate-400">{student.kelas}</td>
                    <td className="px-4 py-3.5 border border-slate-700/60 font-medium text-slate-200 sticky left-0 bg-slate-800/40 backdrop-blur-md shadow-[1px_0_0_0_rgba(51,65,85,0.5)] z-10 group-hover:bg-slate-700/50 transition-colors">
                      {student.nama}
                    </td>

                    {/* Sel rincian per hari */}
                    {isDetailed && datesList.map(d => {
                      const dStr = format(d, 'yyyy-MM-dd');
                      const hol = checkHoliday(d);
                      if (hol.isLibur) {
                        return (
                          <td 
                            key={dStr} 
                            className="px-1 py-3.5 border border-slate-700/60 text-center text-xs font-bold text-rose-400/80 bg-rose-500/5 select-none"
                            title={hol.desc}
                          >
                            L
                          </td>
                        );
                      }

                      const att = student.rawAttendances.find(a => a.tanggal === dStr);
                      let statusLetter = '-';
                      let statusStyle = 'text-slate-600';

                      if (att) {
                        statusLetter = att.status[0]; // H, S, I, A
                        if (att.status === 'Hadir') statusStyle = 'text-emerald-400 font-bold';
                        else if (att.status === 'Sakit') statusStyle = 'text-amber-400 font-bold';
                        else if (att.status === 'Izin') statusStyle = 'text-sky-400 font-bold';
                        else if (att.status === 'Alpa') statusStyle = 'text-rose-400 font-bold';
                      }

                      return (
                        <td key={dStr} className={`px-1 py-3.5 border border-slate-700/60 text-center text-xs ${statusStyle}`}>
                          {statusLetter}
                        </td>
                      );
                    })}

                    {/* Kolom rincian akhir */}
                    <td className="px-3 py-3.5 border border-slate-700/60 text-center text-indigo-300 font-mono font-medium">{student.HariAktif}</td>
                    <td className="px-3 py-3.5 border border-slate-700/60 text-center text-emerald-400 font-mono font-bold bg-emerald-500/5">{student.Hadir}</td>
                    <td className="px-3 py-3.5 border border-slate-700/60 text-center text-amber-400 font-mono bg-amber-500/5">{student.Sakit}</td>
                    <td className="px-3 py-3.5 border border-slate-700/60 text-center text-sky-400 font-mono bg-sky-500/5">{student.Izin}</td>
                    <td className="px-3 py-3.5 border border-slate-700/60 text-center text-rose-400 font-mono bg-rose-500/5">{student.Alpa}</td>
                    <td className="px-3 py-3.5 border border-slate-700/60 text-center text-slate-400 font-mono font-medium">{student.Libur}</td>
                    <td className={`px-4 py-3.5 border border-slate-700/60 text-center font-mono font-bold ${
                      student.PersentaseKehadiran < targetAttendance 
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                        : 'bg-indigo-500/5 text-indigo-300'
                    }`}>
                      <div className="flex items-center justify-center gap-1">
                        <span>{student.PersentaseKehadiran}%</span>
                        {student.PersentaseKehadiran < targetAttendance && (
                          <span className="text-[10px] bg-rose-500 text-white px-1 rounded-md font-bold animate-pulse shrink-0" title={`Kehadiran di bawah target ${targetAttendance}%`}>⚠️</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination
            totalItems={rekapData.length}
            currentPage={currentPage}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            itemName="siswa"
          />
          </>
        )}

        {activeTab === 'Libur' && (
          <div className="p-8 max-w-6xl mx-auto flex flex-col gap-8">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Calendar className="text-indigo-400" /> Kelola Hari Libur Sekolah
              </h2>
              <p className="text-sm text-slate-400">
                Atur hari libur nasional, libur semester, atau cuti bersama secara kolektif maupun perhari. Hari Minggu diidentifikasi sebagai libur otomatis.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Form Tambah Hari Libur */}
              <div className="lg:col-span-5 bg-slate-800/30 border border-slate-700/60 p-6 rounded-2xl flex flex-col gap-4">
                <h3 className="text-md font-bold text-slate-200 border-b border-slate-700/50 pb-2">
                  {editingHolidayId ? 'Edit Hari Libur' : 'Tambah Hari Libur Baru'}
                </h3>
                
                {role === 'guru' ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Nama Hari Libur</label>
                      <input 
                        type="text"
                        placeholder="contoh: Hari Kemerdekaan RI"
                        value={newHolidayName}
                        onChange={e => setNewHolidayName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Jenis Hari Libur</label>
                      <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1 rounded-xl border border-slate-700">
                        <button
                          type="button"
                          onClick={() => setHolidayType('perhari')}
                          className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            holidayType === 'perhari' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Per Hari
                        </button>
                        <button
                          type="button"
                          onClick={() => setHolidayType('kolektif')}
                          className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            holidayType === 'kolektif' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Kolektif / Rentang
                        </button>
                      </div>
                    </div>

                    {holidayType === 'perhari' ? (
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tanggal Libur</label>
                        <input 
                          type="date"
                          value={holidayDate}
                          onChange={e => setHolidayDate(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-slate-200 [color-scheme:dark] outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Mulai</label>
                          <input 
                            type="date"
                            value={holidayStartDate}
                            onChange={e => setHolidayStartDate(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-slate-200 [color-scheme:dark] outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Selesai</label>
                          <input 
                            type="date"
                            value={holidayEndDate}
                            onChange={e => setHolidayEndDate(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-slate-200 [color-scheme:dark] outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      {editingHolidayId && (
                        <button
                          type="button"
                          onClick={handleCancelEditHoliday}
                          className="flex-1 mt-2 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold text-sm rounded-xl transition-all border border-slate-600/80 cursor-pointer"
                        >
                          Batal
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleAddHoliday}
                        className="mt-2 py-3 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-sm rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 cursor-pointer"
                        style={{ flexGrow: editingHolidayId ? 2 : 1, width: editingHolidayId ? 'auto' : '100%' }}
                      >
                        {editingHolidayId ? <Save size={18} /> : <Plus size={18} />} {editingHolidayId ? 'Simpan Perubahan' : 'Tambah Hari Libur'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-900/20 border border-dashed border-slate-700/50 rounded-xl">
                    <AlertTriangle className="text-amber-500/80 mb-2" size={32} />
                    <p className="text-xs text-slate-400 font-medium">Hanya Guru yang dapat mengatur hari libur sekolah.</p>
                  </div>
                )}
              </div>

              {/* Daftar Hari Libur Kustom */}
              <div className="lg:col-span-7 bg-slate-800/30 border border-slate-700/60 p-6 rounded-2xl flex flex-col gap-4">
                <h3 className="text-md font-bold text-slate-200 border-b border-slate-700/50 pb-2">
                  Daftar Hari Libur Kustom
                </h3>

                <div className="space-y-3 overflow-y-auto max-h-[360px] pr-2 custom-scrollbar">
                  {settings?.holidays && settings.holidays.length > 0 ? (
                    settings.holidays.map(h => {
                      let tDisplay = '';
                      try {
                        const start = format(parseISO(h.tanggal_mulai), 'd MMMM yyyy', { locale: id });
                        if (h.jenis === 'perhari' || h.tanggal_mulai === h.tanggal_selesai) {
                          tDisplay = start;
                        } else {
                          const end = format(parseISO(h.tanggal_selesai), 'd MMMM yyyy', { locale: id });
                          tDisplay = `${start} s.d ${end}`;
                        }
                      } catch (e) {
                        tDisplay = `${h.tanggal_mulai} - ${h.tanggal_selesai}`;
                      }

                      return (
                        <div 
                          key={h.id} 
                          className="bg-slate-900/40 border border-slate-700/40 rounded-xl p-4 flex justify-between items-center gap-4 hover:border-slate-700 transition-all"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="bg-indigo-500/10 text-indigo-400 p-2 rounded-lg border border-indigo-500/20 shrink-0">
                              <Calendar size={18} />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-sm font-semibold text-slate-200 truncate">{h.nama}</h4>
                              <p className="text-xs text-slate-400 mt-1">{tDisplay}</p>
                              <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 mt-2 rounded bg-slate-800 text-indigo-300 capitalize">
                                {h.jenis === 'perhari' ? 'Per Hari' : 'Kolektif'}
                              </span>
                            </div>
                          </div>

                          {role === 'guru' && (
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => handleStartEditHoliday(h)}
                                className="text-indigo-400 hover:text-indigo-300 p-2 rounded-lg hover:bg-indigo-500/10 transition-colors cursor-pointer"
                                title="Edit Hari Libur"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteHoliday(h.id)}
                                className="text-rose-400 hover:text-rose-300 p-2 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
                                title="Hapus Hari Libur"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 border border-dashed border-slate-700/40 rounded-2xl bg-slate-900/10">
                      <Calendar size={36} className="text-slate-600 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-slate-400">Belum ada hari libur kustom</p>
                      <p className="text-xs text-slate-500 mt-1">Daftar hari libur yang ditambahkan akan muncul di sini.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
