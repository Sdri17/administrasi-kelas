import React, { useState, useEffect } from 'react';
import { store, Student, Grade, Settings, RaporCapaian, Attendance } from '../lib/store';
import { FileText, Save, Download, User, CheckSquare, Calendar as CalendarIcon, Settings as SettingsIcon, Printer, ChevronDown, ChevronUp, X, Edit3, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { v4 as uuidv4 } from 'uuid';

export default function Rapor({ settings, setSettings, semester, role = 'guru' }: { settings: Settings | null, setSettings?: (s: Settings | null) => void, semester: string, role?: 'guru' | 'kepsek' }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [capaian, setCapaian] = useState<RaporCapaian[]>([]);
  
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [filterKelas, setFilterKelas] = useState<string>('all');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [piagamTemplate, setPiagamTemplate] = useState<'classic' | 'modern' | 'emerald' | 'creative'>('classic');
  
  // Settings
  const [includeHarian, setIncludeHarian] = useState(true);
  const [includeTugas, setIncludeTugas] = useState(true);
  const [includeUjian, setIncludeUjian] = useState(true);
  const [includeHarianBulanan, setIncludeHarianBulanan] = useState(true);
  const [includeTugasBulanan, setIncludeTugasBulanan] = useState(true);
  const [includeUjianBulanan, setIncludeUjianBulanan] = useState(false);
  const [raporType, setRaporType] = useState<'bulanan' | 'semester'>('semester');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [signatureDate, setSignatureDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [signaturePlace, setSignaturePlace] = useState<string>('Jakarta');
  
  // Bobot States
  const [bobotHarian, setBobotHarian] = useState<number>(30);
  const [bobotTugas, setBobotTugas] = useState<number>(30);
  const [bobotUjian, setBobotUjian] = useState<number>(40);

  // Posisi: 'left', 'center', 'right', 'hidden'
  const [posWaliKelas, setPosWaliKelas] = useState<'left'|'center'|'right'|'hidden'>('right');
  const [posOrangTua, setPosOrangTua] = useState<'left'|'center'|'right'|'hidden'>('left');
  const [posKepsek, setPosKepsek] = useState<'left'|'center'|'right'|'hidden'>('hidden');

  // Input States for Capaian
  const [formData, setFormData] = useState<Partial<RaporCapaian>>({});
  const [activeTab, setActiveTab] = useState<'cetak' | 'urutan' | 'rekap' | 'piagan'>('cetak');
  const [urutanMapel, setUrutanMapel] = useState<string[]>([]);
  
  // Piagam States
  const [piagamSiswaId, setPiagamSiswaId] = useState<string>('');
  const [piagamJuara, setPiagamJuara] = useState<string>('Juara 1');
  const [piagamKategori, setPiagamKategori] = useState<string>('Peringkat Kelas Terbaik');
  const [piagamNo, setPiagamNo] = useState<string>('001/PP/2026');

  // Preset management states
  const [presetManagerType, setPresetManagerType] = useState<'capaian' | 'catatan' | null>(null);
  const [editingPresetIdx, setEditingPresetIdx] = useState<number | null>(null);
  const [editingPresetText, setEditingPresetText] = useState<string>('');
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState<number | null>(null);

  const defaultCapaianPresets = [
    "Menunjukkan penguasaan kompetensi yang sangat baik dalam memahami konsep-konsep materi serta mampu menerapkannya dalam tugas-tugas harian dengan mandiri.",
    "Perlu bimbingan dan pendampingan yang lebih tekun terutama dalam menganalisis soal cerita dan menerapkan teori ke dalam praktik pembelajaran.",
    "Memiliki kemauan belajar yang tinggi, sangat baik dalam berdiskusi kelompok, serta aktif berpartisipasi menyampaikan ide-ide kreatif di kelas.",
    "Menunjukkan pemahaman yang stabil di semua mata pelajaran, dengan kemampuan berpikir kritis yang terus berkembang dari waktu ke waktu.",
    "Secara umum telah mencapai kriteria ketuntasan minimal, namun masih memerlukan latihan tambahan untuk memperkuat pemahaman konsep dasar yang esensial."
  ];

  const defaultCatatanPresets = [
    "Sangat bangga dengan prestasimu! Pertahankan nilai yang luar biasa ini dan teruslah menjadi inspirasi bagi teman-temanmu.",
    "Prestasi yang cukup bagus. Tingkatkan kembali kedisiplinan, fokus belajar di kelas, dan kurangi hal-hal yang dapat mengalihkan konsentrasimu.",
    "Tingkatkan terus motivasi belajarmu, jangan mudah menyerah. Lakukan bimbingan belajar tambahan dan tingkatkan kehadiranmu di kelas.",
    "Ananda menunjukkan sikap yang sangat baik dan aktif dalam setiap pembelajaran. Pertahankan semangat ini di semester berikutnya!",
    "Terus asah bakat dan minatmu, baik akademik maupun non-akademik. Semangat belajar harus tetap menyala demi masa depan yang gemilang!"
  ];

  useEffect(() => {
    if (settings) {
      if (raporType === 'bulanan') {
        setBobotHarian(settings.bobot_harian_bulanan !== undefined ? settings.bobot_harian_bulanan : 50);
        setBobotTugas(settings.bobot_tugas_bulanan !== undefined ? settings.bobot_tugas_bulanan : 50);
        setBobotUjian(settings.bobot_ujian_bulanan !== undefined ? settings.bobot_ujian_bulanan : 0);
        setIncludeHarianBulanan(settings.include_harian_bulanan !== undefined ? settings.include_harian_bulanan : true);
        setIncludeTugasBulanan(settings.include_tugas_bulanan !== undefined ? settings.include_tugas_bulanan : true);
        setIncludeUjianBulanan(settings.include_ujian_bulanan !== undefined ? settings.include_ujian_bulanan : false);
      } else {
        setBobotHarian(settings.bobot_harian !== undefined ? settings.bobot_harian : 30);
        setBobotTugas(settings.bobot_tugas !== undefined ? settings.bobot_tugas : 30);
        setBobotUjian(settings.bobot_ujian !== undefined ? settings.bobot_ujian : 40);
        setIncludeHarian(settings.include_harian !== undefined ? settings.include_harian : true);
        setIncludeTugas(settings.include_tugas !== undefined ? settings.include_tugas : true);
        setIncludeUjian(settings.include_ujian !== undefined ? settings.include_ujian : true);
      }
      setUrutanMapel(settings.urutan_mata_pelajaran_rapor && settings.urutan_mata_pelajaran_rapor.length > 0 ? settings.urutan_mata_pelajaran_rapor : settings.mata_pelajaran || []);
    }
  }, [settings, raporType]);

  useEffect(() => {
    loadData();
    window.addEventListener('data-changed', loadData);
    return () => window.removeEventListener('data-changed', loadData);
  }, [semester]);

  const loadData = async () => {
    const sList: Student[] = [];
    const gList: Grade[] = [];
    const aList: Attendance[] = [];
    const cList: RaporCapaian[] = [];

    await store.students.iterate((s: Student) => {
      if (!s.semester || s.semester === semester) {
        if (s.kelas && s.kelas.toLowerCase() === 'alumni') return;
        sList.push(s);
      }
    });
    sList.sort((a, b) => a.nama.localeCompare(b.nama));
    setStudents(sList);

    await store.grades.iterate((g: Grade) => {
      if (g.semester === semester) gList.push(g);
    });
    setGrades(gList);

    await store.attendance.iterate((a: Attendance) => {
      if (a.semester === semester) aList.push(a);
    });
    setAttendances(aList);

    await store.raporCapaian.iterate((c: RaporCapaian) => {
      if (c.semester === semester) cList.push(c);
    });
    setCapaian(cList);

    if (sList.length > 0 && !selectedStudentId) {
      setSelectedStudentId(sList[0].id);
    }
  };

  const getAutoCapaianAndCatatan = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student || !settings) {
      return { capaian: '', catatan: '' };
    }

    const gradesData = getStudentGrades(studentId);
    const att = getAttendanceSummary(studentId);

    // Let's analyze grades
    const mapelAverages = urutanMapel.map(mapel => {
      const g = gradesData[mapel];
      return { mapel, final: g?.final || 0 };
    }).filter(m => m.final > 0);

    let highestMapel = '';
    let lowestMapel = '';
    let highestVal = -1;
    let lowestVal = 101;

    mapelAverages.forEach(m => {
      if (m.final > highestVal) {
        highestVal = m.final;
        highestMapel = m.mapel;
      }
      if (m.final < lowestVal) {
        lowestVal = m.final;
        lowestMapel = m.mapel;
      }
    });

    // Auto-generate capaian kompetensi
    let generatedCapaian = '';
    if (mapelAverages.length > 0) {
      generatedCapaian += `Menunjukkan penguasaan kompetensi yang sangat baik pada mata pelajaran ${highestMapel} dengan nilai ${highestVal.toFixed(1)}. `;
      if (lowestMapel && lowestMapel !== highestMapel) {
        generatedCapaian += `Perlu peningkatan pemahaman dan bimbingan yang lebih tekun pada mata pelajaran ${lowestMapel} agar mencapai hasil belajar yang lebih optimal.`;
      }
    } else {
      generatedCapaian = 'Belum ada data nilai yang terekam pada periode ini.';
    }

    // Auto-generate catatan wali kelas
    let generatedCatatan = '';
    const avgScore = mapelAverages.length > 0 
      ? mapelAverages.reduce((acc, m) => acc + m.final, 0) / mapelAverages.length 
      : 0;

    if (avgScore >= 85) {
      generatedCatatan = `Sangat bangga dengan prestasimu! Pertahankan nilai yang luar biasa ini dan teruslah menjadi teladan yang baik bagi teman-temanmu.`;
    } else if (avgScore >= 75) {
      generatedCatatan = `Prestasi yang cukup bagus. Tingkatkan kembali kedisiplinan dan fokus belajar di kelas agar nilaimu bisa meningkat di masa depan.`;
    } else {
      generatedCatatan = `Tingkatkan terus motivasi belajarmu, jangan mudah menyerah. Lakukan bimbingan belajar tambahan dan kurangi bermain agar nilaimu dapat membaik.`;
    }

    if (att.sakit > 0 || att.izin > 0 || att.alpa > 0) {
      const detailAbsensi = [
        att.sakit > 0 ? `${att.sakit} kali sakit` : null,
        att.izin > 0 ? `${att.izin} kali izin` : null,
        att.alpa > 0 ? `${att.alpa} kali alpa` : null
      ].filter(Boolean).join(', ');
      generatedCatatan += ` Catatan kehadiran: terdata ketidakhadiran sebanyak ${detailAbsensi}. Harap tingkatkan persentase kehadiran di sekolah.`;
    } else {
      generatedCatatan += ` Tingkat kehadiran sangat baik (100% Hadir). Pertahankan kedisiplinanmu!`;
    }

    return { capaian: generatedCapaian, catatan: generatedCatatan };
  };

  useEffect(() => {
    if (selectedStudentId && students.length > 0 && settings) {
      const existing = capaian.find(c => c.id_siswa === selectedStudentId);
      if (existing) {
        setFormData({
          id_siswa: selectedStudentId,
          semester: semester,
          capaian_kompetensi: existing.capaian_kompetensi || '',
          catatan_wali_kelas: existing.catatan_wali_kelas || '',
          saran_orang_tua: existing.saran_orang_tua || '',
          tinggi_badan: existing.tinggi_badan || '',
          berat_badan: existing.berat_badan || '',
          pendengaran: existing.pendengaran || '',
          penglihatan: existing.penglihatan || '',
          gigi: existing.gigi || '',
          kokurikuler: existing.kokurikuler || '',
          ekstra_nama_1: existing.ekstra_nama_1 || '',
          ekstra_ket_1: existing.ekstra_ket_1 || '',
          ekstra_nama_2: existing.ekstra_nama_2 || '',
          ekstra_ket_2: existing.ekstra_ket_2 || '',
          kenaikan_kelas: existing.kenaikan_kelas || '',
          id: existing.id
        });
      } else {
        const auto = getAutoCapaianAndCatatan(selectedStudentId);
        setFormData({
          id_siswa: selectedStudentId,
          semester: semester,
          capaian_kompetensi: auto.capaian,
          catatan_wali_kelas: auto.catatan,
          saran_orang_tua: '',
          tinggi_badan: '',
          berat_badan: '',
          pendengaran: '',
          penglihatan: '',
          gigi: '',
          kokurikuler: '',
          ekstra_nama_1: '',
          ekstra_ket_1: '',
          ekstra_nama_2: '',
          ekstra_ket_2: '',
          kenaikan_kelas: ''
        });
      }
    }
  }, [selectedStudentId, capaian, semester, students, settings]);

  const handleSaveCapaian = async () => {
    if (!selectedStudentId) return;
    try {
      const dataToSave = {
        ...formData,
        id: formData.id || uuidv4(),
        id_siswa: selectedStudentId,
        semester
      } as RaporCapaian;
      
      await store.raporCapaian.setItem(dataToSave.id, dataToSave);
      toast.success('Profil capaian berhasil disimpan');
      loadData(); // refresh state
    } catch (error) {
      toast.error('Gagal menyimpan profil capaian');
    }
  };

  const getStudentGrades = (studentId: string) => {
    const studentGrades = grades.filter(g => {
      if (g.id_siswa !== studentId) return false;
      if (raporType === 'bulanan' && selectedMonth !== 'all') {
        if (!g.tanggal) return false;
        const parts = g.tanggal.split('-');
        if (parts.length >= 2 && parts[1] !== selectedMonth) {
          return false;
        }
      }
      return true;
    });
    const curIncludeHarian = raporType === 'bulanan' ? includeHarianBulanan : includeHarian;
    const curIncludeTugas = raporType === 'bulanan' ? includeTugasBulanan : includeTugas;
    const curIncludeUjian = raporType === 'bulanan' ? includeUjianBulanan : includeUjian;

    const result: Record<string, { harian: number[], tugas: number[], ujian: number[], avgHarian: number, avgTugas: number, avgUjian: number, final: number, predikat: string }> = {};

    urutanMapel.forEach(mapel => {
      const mapelGrades = studentGrades.filter(g => g.mata_pelajaran === mapel);
      const harian = mapelGrades.filter(g => g.jenis_nilai === 'Harian').map(g => g.nilai);
      const tugas = mapelGrades.filter(g => g.jenis_nilai === 'Tugas').map(g => g.nilai);
      const ujian = mapelGrades.filter(g => g.jenis_nilai === 'Ujian').map(g => g.nilai);

      const avgHarian = harian.length > 0 ? harian.reduce((a, b) => a + b, 0) / harian.length : 0;
      const avgTugas = tugas.length > 0 ? tugas.reduce((a, b) => a + b, 0) / tugas.length : 0;
      const avgUjian = ujian.length > 0 ? ujian.reduce((a, b) => a + b, 0) / ujian.length : 0;

      let final = 0;
      let totalBobot = 0;
      
      if (curIncludeHarian) {
        final += avgHarian * (bobotHarian / 100);
        totalBobot += bobotHarian;
      }
      if (curIncludeTugas) {
        final += avgTugas * (bobotTugas / 100);
        totalBobot += bobotTugas;
      }
      if (curIncludeUjian) {
        final += avgUjian * (bobotUjian / 100);
        totalBobot += bobotUjian;
      }

      // Normalize if totalBobot is not 100
      if (totalBobot > 0 && totalBobot !== 100) {
        final = final * (100 / totalBobot);
      }

      let predikat = 'D';
      if (final >= 90) predikat = 'A';
      else if (final >= 80) predikat = 'B';
      else if (final >= 75) predikat = 'C';

      result[mapel] = { harian, tugas, ujian, avgHarian, avgTugas, avgUjian, final, predikat };
    });

    return result;
  };

  const getAttendanceSummary = (studentId: string) => {
    const studentAtt = attendances.filter(a => {
      if (a.id_siswa !== studentId) return false;
      if (raporType === 'bulanan' && selectedMonth !== 'all') {
        if (!a.tanggal) return false;
        const parts = a.tanggal.split('-');
        if (parts.length >= 2 && parts[1] !== selectedMonth) {
          return false;
        }
      }
      return true;
    });
    let sakit = 0, izin = 0, alpa = 0;
    studentAtt.forEach(a => {
      if (a.status === 'Sakit') sakit++;
      if (a.status === 'Izin') izin++;
      if (a.status === 'Alpa') alpa++;
    });
    return { sakit, izin, alpa };
  };

  const getRankedStudents = () => {
    const studentData = students.map(student => {
      const gradesData = getStudentGrades(student.id);
      
      let total = 0;
      let count = 0;
      urutanMapel.forEach(mapel => {
        const val = gradesData[mapel]?.final || 0;
        total += val;
        count++;
      });
      const avg = count > 0 ? total / count : 0;
      
      return {
        student,
        total,
        avg,
        gradesData
      };
    });

    // Sort descending by avg/total
    studentData.sort((a, b) => b.avg - a.avg);

    // Assign rank, handling ties
    let currentRank = 1;
    const ranked = studentData.map((item, idx) => {
      if (idx > 0 && Math.abs(studentData[idx - 1].avg - item.avg) > 0.001) {
        currentRank = idx + 1;
      }
      return {
        ...item,
        rank: currentRank
      };
    });

    return ranked;
  };

  const handleExportRekapRankingPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4'); // landscape is better for many columns!
    const pageWidth = doc.internal.pageSize.width;
    
    // Draw Kop Surat
    const pda = settings?.kop_pemerintah || 'PEMERINTAH KOTA / KABUPATEN';
    const dinas = settings?.kop_dinas || 'DINAS PENDIDIKAN DAN KEBUDAYAAN';
    const sekolah = settings?.nama_sekolah || 'NAMA SEKOLAH BELUM DIATUR';
    const alamat = settings?.alamat || 'Alamat Sekolah Belum Diatur';
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(pda.toUpperCase(), pageWidth / 2, 12, { align: 'center' });
    doc.text(dinas.toUpperCase(), pageWidth / 2, 17, { align: 'center' });
    doc.setFontSize(14);
    doc.text(sekolah.toUpperCase(), pageWidth / 2, 23, { align: 'center' });
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Alamat: ${alamat}`, pageWidth / 2, 28, { align: 'center' });
    
    doc.setLineWidth(0.8);
    doc.line(14, 31, pageWidth - 14, 31);
    doc.setLineWidth(0.2);
    doc.line(14, 32.2, pageWidth - 14, 32.2);
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`REKAPITULASI HASIL BELAJAR & PERINGKAT SISWA`, 14, 40);
    doc.setFontSize(9);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Kelas: ${settings?.nama_kelas || ''} | Semester: ${semester} | Periode Rapor: ${raporType === 'bulanan' ? 'Bulanan' : 'Semester'}`, 14, 45);
    
    const ranked = getRankedStudents();
    const headers = ['No', 'Peringkat', 'Nama Siswa', ...urutanMapel, 'Total', 'Rata-rata'];
    const rows = ranked.map((item, idx) => {
      const row: any[] = [
        idx + 1,
        item.rank,
        item.student.nama
      ];
      urutanMapel.forEach(mapel => {
        row.push(item.gradesData[mapel]?.final?.toFixed(1) || '0.0');
      });
      row.push(item.total.toFixed(1));
      row.push(item.avg.toFixed(1));
      return row;
    });
    
    autoTable(doc, {
      startY: 50,
      head: [headers],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [49, 46, 129], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 18, fontStyle: 'bold' },
        2: { cellWidth: 40, fontStyle: 'bold' }
      }
    });
    
    doc.save(`Rekap_Ranking_${semester}_Kelas_${settings?.nama_kelas || ''}.pdf`);
  };

  const handleExportRekapRankingExcel = () => {
    const ranked = getRankedStudents();
    const data = ranked.map((item, idx) => {
      const row: any = {
        'No': idx + 1,
        'Peringkat': item.rank,
        'Nama Siswa': item.student.nama,
        'NISN': item.student.nisn || '-',
      };
      urutanMapel.forEach(mapel => {
        row[mapel] = item.gradesData[mapel]?.final || 0;
      });
      row['Total Nilai'] = item.total;
      row['Rata-rata'] = item.avg;
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Ranking");
    XLSX.writeFile(wb, `Rekap_Ranking_${semester}_Kelas_${settings?.nama_kelas || ''}.xlsx`);
  };

  const handlePrintPiagam = (studentId: string, juara: string, kategori: string, no: string, template: 'classic' | 'modern' | 'emerald' | 'creative' = 'classic') => {
    const student = students.find(s => s.id === studentId);
    if (!student) {
      toast.error('Pilih siswa terlebih dahulu');
      return;
    }

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const w = 297;
    const h = 210;

    // Define color presets
    let primaryColor = [30, 41, 59]; // Slate 800
    let accentColor = [194, 120, 3]; // Gold
    let textColor = [51, 65, 85]; // Slate 700
    let darkTextColor = [30, 41, 59]; // Slate 800
    let lightTextColor = [71, 85, 105]; // Slate 600

    if (template === 'modern') {
      primaryColor = [79, 70, 229]; // Indigo
      accentColor = [99, 102, 241]; // Light Indigo
      textColor = [51, 65, 85];
      darkTextColor = [30, 41, 59];
      lightTextColor = [100, 116, 139];
    } else if (template === 'emerald') {
      primaryColor = [6, 78, 59]; // Emerald 900
      accentColor = [5, 150, 105]; // Emerald 600
      textColor = [31, 41, 55];
      darkTextColor = [17, 24, 39];
      lightTextColor = [75, 85, 99];
    } else if (template === 'creative') {
      primaryColor = [15, 118, 110]; // Teal 700
      accentColor = [13, 148, 136]; // Teal 600
      textColor = [15, 23, 42];
      darkTextColor = [2, 6, 23];
      lightTextColor = [71, 85, 105];
    }

    // --- DRAW BORDERS & ORNAMENTS ---
    if (template === 'classic') {
      // Outer thin border
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.4);
      doc.rect(10, 10, w - 20, h - 20);

      // Inner thick border
      doc.setDrawColor(194, 120, 3); // Gold
      doc.setLineWidth(1.5);
      doc.rect(13, 13, w - 26, h - 26);

      // Corner decorations
      doc.setFillColor(194, 120, 3);
      const corners = [
        { x: 13, y: 13 },
        { x: w - 13, y: 13 },
        { x: 13, y: h - 13 },
        { x: w - 13, y: h - 13 }
      ];
      corners.forEach(c => {
        doc.rect(c.x - 3, c.y - 3, 6, 6, 'FD');
      });
    } else if (template === 'modern') {
      // Sleek Indigo Border
      doc.setDrawColor(79, 70, 229); // Indigo
      doc.setLineWidth(0.8);
      doc.rect(12, 12, w - 24, h - 24);

      doc.setDrawColor(224, 231, 255); // Indigo 100
      doc.setLineWidth(0.3);
      doc.rect(14, 14, w - 28, h - 28);

      // Minimalist corners
      doc.setDrawColor(79, 70, 229);
      doc.setLineWidth(1.2);
      // Top Left
      doc.line(8, 16, 20, 16);
      doc.line(16, 8, 16, 20);
      // Top Right
      doc.line(w - 8, 16, w - 20, 16);
      doc.line(w - 16, 8, w - 16, 20);
      // Bottom Left
      doc.line(8, h - 16, 20, h - 16);
      doc.line(16, h - 8, 16, h - 20);
      // Bottom Right
      doc.line(w - 8, h - 16, w - 20, h - 16);
      doc.line(w - 16, h - 8, w - 16, h - 20);
    } else if (template === 'emerald') {
      // Emerald Border with inner gold accent
      doc.setDrawColor(6, 78, 59); // Emerald 900
      doc.setLineWidth(2.0);
      doc.rect(11, 11, w - 22, h - 22);

      doc.setDrawColor(217, 119, 6); // Gold/Amber 600
      doc.setLineWidth(0.5);
      doc.rect(14, 14, w - 28, h - 28);

      // Diamond corner ornaments
      doc.setFillColor(6, 78, 59);
      doc.setDrawColor(217, 119, 6);
      doc.setLineWidth(0.5);
      const diamondCorners = [
        { x: 14, y: 14 },
        { x: w - 14, y: 14 },
        { x: 14, y: h - 14 },
        { x: w - 14, y: h - 14 }
      ];
      diamondCorners.forEach(c => {
        doc.triangle(c.x, c.y - 3, c.x - 3, c.y, c.x, c.y + 3, 'FD');
        doc.triangle(c.x, c.y - 3, c.x + 3, c.y, c.x, c.y + 3, 'FD');
      });
    } else if (template === 'creative') {
      // Creative Teal template
      doc.setDrawColor(15, 118, 110); // Teal 700
      doc.setLineWidth(1.5);
      doc.rect(10, 10, w - 20, h - 20);

      doc.setDrawColor(45, 212, 191); // Teal 400
      doc.setLineWidth(0.5);
      doc.rect(12.5, 12.5, w - 25, h - 25);

      // Creative brackets in corners
      doc.setDrawColor(13, 148, 136); // Teal 600
      doc.setLineWidth(1.8);
      // Top Left
      doc.line(12.5, 12.5, 12.5 + 12, 12.5);
      doc.line(12.5, 12.5, 12.5, 12.5 + 12);
      // Top Right
      doc.line(w - 12.5, 12.5, w - 12.5 - 12, 12.5);
      doc.line(w - 12.5, 12.5, w - 12.5, 12.5 + 12);
      // Bottom Left
      doc.line(12.5, h - 12.5, 12.5 + 12, h - 12.5);
      doc.line(12.5, h - 12.5, 12.5, h - 12.5 - 12);
      // Bottom Right
      doc.line(w - 12.5, h - 12.5, w - 12.5 - 12, h - 12.5);
      doc.line(w - 12.5, h - 12.5, w - 12.5, h - 12.5 - 12);
    }

    // --- Header ---
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(lightTextColor[0], lightTextColor[1], lightTextColor[2]);
    doc.text('KEMENTERIAN PENDIDIKAN, KEBUDAYAAN, RISET, DAN TEKNOLOGI', w / 2, 19, { align: 'center' });

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(28); // Increased from 22 for emphasis as requested!
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text((settings?.nama_sekolah || 'NAMA SEKOLAH').toUpperCase(), w / 2, 29, { align: 'center' });
    
    doc.setFontSize(9);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(lightTextColor[0], lightTextColor[1], lightTextColor[2]);
    doc.text(`Alamat: ${settings?.alamat || 'Alamat Sekolah Belum Diatur'}`, w / 2, 35, { align: 'center' });

    // Premium dual horizontal line as header ribbon
    doc.setDrawColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.setLineWidth(1.2);
    doc.line(30, 39, w - 30, 39);

    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setLineWidth(0.4);
    doc.line(45, 41, w - 45, 41);

    // --- Title ---
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.text('PIAGAM PENGHARGAAN', w / 2, 54, { align: 'center' });

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(lightTextColor[0], lightTextColor[1], lightTextColor[2]);
    if (no && no.trim() !== '') {
      doc.text(`Nomor: ${no}`, w / 2, 60, { align: 'center' });
    }

    // --- Body ---
    doc.setFontSize(11);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.text('Diberikan Kepada:', w / 2, 71, { align: 'center' });

    // Student Name (Large and elegant)
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
    doc.text(student.nama.toUpperCase(), w / 2, 82, { align: 'center' });

    // Accent line below name
    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setLineWidth(0.4);
    doc.line(60, 86, w - 60, 86);

    // As Juara...
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.text('sebagai', w / 2, 93, { align: 'center' });

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.text(`${juara.toUpperCase()} - ${kategori.toUpperCase()}`, w / 2, 103, { align: 'center' });

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(lightTextColor[0], lightTextColor[1], lightTextColor[2]);
    doc.text(`Dalam Kelas ${student.kelas || settings?.nama_kelas || ''} Semester ${semester}`, w / 2, 111, { align: 'center' });
    doc.text('Atas prestasi luar biasa, dedikasi belajar, dan akhlak mulia yang ditunjukkan.', w / 2, 117, { align: 'center' });

    // --- Elegant Rosette Seal / Badge with Ribbons ---
    const sealX = w / 2;
    const sealY = 132;
    
    // 1. Draw hanging ribbon tails
    doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
    
    // Left Ribbon Polygon
    doc.triangle(sealX - 4, sealY + 3, sealX - 0.5, sealY + 3, sealX - 2.5, sealY + 17, 'F');
    doc.triangle(sealX - 4, sealY + 3, sealX - 2.5, sealY + 17, sealX - 6, sealY + 17, 'F');
    // Left Ribbon V-notch subtract (drawn in white page color)
    doc.setFillColor(255, 255, 255);
    doc.triangle(sealX - 6, sealY + 17, sealX - 2.5, sealY + 17, sealX - 4.25, sealY + 14.5, 'F');

    // Right Ribbon Polygon
    doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.triangle(sealX + 0.5, sealY + 3, sealX + 4, sealY + 3, sealX + 2.5, sealY + 17, 'F');
    doc.triangle(sealX + 4, sealY + 3, sealX + 2.5, sealY + 17, sealX + 6, sealY + 17, 'F');
    // Right Ribbon V-notch subtract
    doc.setFillColor(255, 255, 255);
    doc.triangle(sealX + 2.5, sealY + 17, sealX + 6, sealY + 17, sealX + 4.25, sealY + 14.5, 'F');

    // 2. Draw outer scallops of the rosette badge
    doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
    const radiusScallops = 2.2;
    const distanceScallops = 7.5;
    const angles = [0, 45, 90, 135, 180, 225, 270, 315];
    angles.forEach(angle => {
      const rad = (angle * Math.PI) / 180;
      const scallopX = sealX + distanceScallops * Math.cos(rad);
      const scallopY = sealY + distanceScallops * Math.sin(rad);
      doc.circle(scallopX, scallopY, radiusScallops, 'F');
    });

    // 3. Draw the shiny gold main ring over the petals
    doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.circle(sealX, sealY, 8.5, 'F');

    // 4. Draw a gold border outline ring for texture
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.4);
    doc.circle(sealX, sealY, 7.8, 'D');

    // 5. Draw the rich primary color core circle
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.circle(sealX, sealY, 6.8, 'F');

    // 6. Internal medal star symbol - Drawn geometrically for perfect PDF rendering with no encoding/font bugs (no "&" sign)
    const drawStar = (docObj: any, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number, fillColor: number[]) => {
      let rot = (Math.PI / 2) * 3;
      let x = cx;
      let y = cy;
      const step = Math.PI / spikes;
      docObj.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
      const points: {x: number, y: number}[] = [];
      for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        points.push({ x, y });
        rot += step;
        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        points.push({ x, y });
        rot += step;
      }
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        docObj.triangle(cx, cy, p1.x, p1.y, p2.x, p2.y, 'F');
      }
    };
    drawStar(doc, sealX, sealY, 5, 2.8, 1.1, [255, 255, 255]);

    // --- Signatures ---
    const dateFormatted = format(new Date(signatureDate), 'd MMMM yyyy', { locale: id });
    const placeAndDate = `${signaturePlace}, ${dateFormatted}`;

    doc.setFontSize(10);
    doc.setTextColor(darkTextColor[0], darkTextColor[1], darkTextColor[2]);
    doc.text(placeAndDate, w - 70, 142, { align: 'center' });

    // Wali Kelas
    doc.setFont('Helvetica', 'normal');
    doc.text('Wali Kelas,', 70, 148, { align: 'center' });
    doc.setFont('Helvetica', 'bold');
    doc.text(settings?.nama_wali_kelas || '____________________', 70, 172, { align: 'center' });
    
    // Solid line under signature name
    doc.setDrawColor(textColor[0], textColor[1], textColor[2]);
    doc.setLineWidth(0.2);
    doc.line(45, 174, 95, 174);
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`NIP. ${settings?.nip_wali_kelas || '-'}`, 70, 179, { align: 'center' });

    // Kepala Sekolah
    doc.setFontSize(10);
    doc.text('Kepala Sekolah,', w - 70, 148, { align: 'center' });
    doc.setFont('Helvetica', 'bold');
    doc.text(settings?.nama_kepala_sekolah || '____________________', w - 70, 172, { align: 'center' });
    
    // Solid line under signature name
    doc.line(w - 95, 174, w - 45, 174);
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`NIP. ${settings?.nip_kepala_sekolah || '-'}`, w - 70, 179, { align: 'center' });

    // Save PDF
    doc.save(`Piagam_${student.nama.replace(/\s+/g, '_')}_${juara.replace(/\s+/g, '_')}.pdf`);
    toast.success(`Berhasil mencetak piagam untuk ${student.nama}!`);
  };

  const handleTarikData = () => {
    const student = students.find(s => s.id === selectedStudentId);
    if (!student || !settings) {
      toast.error('Silakan pilih siswa terlebih dahulu');
      return;
    }

    const auto = getAutoCapaianAndCatatan(student.id);

    setFormData(prev => ({
      ...prev,
      capaian_kompetensi: auto.capaian,
      catatan_wali_kelas: auto.catatan
    }));

    toast.success('Berhasil menarik & menganalisis data nilai dan absensi siswa dari database!');
  };

  const handleSavePreset = async (type: 'capaian' | 'catatan', text: string) => {
    if (!text || text.trim() === '') {
      toast.error('Teks tidak boleh kosong.');
      return;
    }
    if (!settings || !setSettings) return;

    const key = type === 'capaian' ? 'capaian_kompetensi_templates' : 'catatan_wali_kelas_templates';
    const existing = settings[key] || [];
    
    if (existing.includes(text)) {
      toast.error('Preset ini sudah ada.');
      return;
    }

    const newSettings = { ...settings, [key]: [...existing, text] };
    setSettings(newSettings);
    try {
      await store.settings.setItem('app_settings', newSettings);
      toast.success('Berhasil menyimpan preset baru!');
    } catch (error) {
      toast.error('Gagal menyimpan preset.');
    }
  };

  const handleSaveUrutan = async () => {
    if (!settings || !setSettings) return;
    const newSettings = { ...settings, urutan_mata_pelajaran_rapor: urutanMapel };
    setSettings(newSettings);
    try {
      await store.settings.setItem('app_settings', newSettings);
      toast.success('Urutan mata pelajaran rapor berhasil disimpan!');
    } catch (e) {
      toast.error('Gagal menyimpan urutan');
    }
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newArr = [...urutanMapel];
    const temp = newArr[index - 1];
    newArr[index - 1] = newArr[index];
    newArr[index] = temp;
    setUrutanMapel(newArr);
  };

  const moveDown = (index: number) => {
    if (index === urutanMapel.length - 1) return;
    const newArr = [...urutanMapel];
    const temp = newArr[index + 1];
    newArr[index + 1] = newArr[index];
    newArr[index] = temp;
    setUrutanMapel(newArr);
  };
  const handleSaveBobot = async () => {
    if (!settings || !setSettings) return;
    
    const curIncludeHarian = raporType === 'bulanan' ? includeHarianBulanan : includeHarian;
    const curIncludeTugas = raporType === 'bulanan' ? includeTugasBulanan : includeTugas;
    const curIncludeUjian = raporType === 'bulanan' ? includeUjianBulanan : includeUjian;

    const total = (curIncludeHarian ? bobotHarian : 0) + (curIncludeTugas ? bobotTugas : 0) + (curIncludeUjian ? bobotUjian : 0);
    if (total !== 100) {
      toast.error(`Total bobot aktif harus 100%! Saat ini: ${total}%`);
      return;
    }

    const newSettings = {
      ...settings,
      ...(raporType === 'bulanan' ? {
        bobot_harian_bulanan: bobotHarian,
        bobot_tugas_bulanan: bobotTugas,
        bobot_ujian_bulanan: bobotUjian,
        include_harian_bulanan: includeHarianBulanan,
        include_tugas_bulanan: includeTugasBulanan,
        include_ujian_bulanan: includeUjianBulanan,
      } : {
        bobot_harian: bobotHarian,
        bobot_tugas: bobotTugas,
        bobot_ujian: bobotUjian,
        include_harian: includeHarian,
        include_tugas: includeTugas,
        include_ujian: includeUjian,
      })
    };
    setSettings(newSettings);
    try {
      await store.settings.setItem('app_settings', newSettings);
      toast.success('Bobot nilai berhasil disimpan ke pengaturan!');
    } catch (e) {
      toast.error('Gagal menyimpan bobot nilai');
    }
  };

  const handleEditPreset = async (type: 'capaian' | 'catatan', index: number, newText: string) => {
    if (!newText || newText.trim() === '') {
      toast.error('Preset tidak boleh kosong.');
      return;
    }
    if (!settings || !setSettings) return;

    const key = type === 'capaian' ? 'capaian_kompetensi_templates' : 'catatan_wali_kelas_templates';
    const templates = [...(settings[key] && settings[key].length > 0 ? settings[key] : (type === 'capaian' ? defaultCapaianPresets : defaultCatatanPresets))];
    templates[index] = newText;

    const newSettings = { ...settings, [key]: templates };
    setSettings(newSettings);
    try {
      await store.settings.setItem('app_settings', newSettings);
      toast.success('Berhasil memperbarui preset!');
      setEditingPresetIdx(null);
    } catch (error) {
      toast.error('Gagal memperbarui preset.');
    }
  };

  const handleDeletePresetAtIndex = async (type: 'capaian' | 'catatan', index: number) => {
    if (!settings || !setSettings) return;

    const key = type === 'capaian' ? 'capaian_kompetensi_templates' : 'catatan_wali_kelas_templates';
    const templates = [...(settings[key] && settings[key].length > 0 ? settings[key] : (type === 'capaian' ? defaultCapaianPresets : defaultCatatanPresets))];
    templates.splice(index, 1);

    const newSettings = { ...settings, [key]: templates };
    setSettings(newSettings);
    try {
      await store.settings.setItem('app_settings', newSettings);
      toast.success('Berhasil menghapus preset.');
    } catch (error) {
      toast.error('Gagal menghapus preset.');
    }
  };

  const handleDeletePreset = async (type: 'capaian' | 'catatan', text: string) => {
    if (!settings || !setSettings) return;

    const key = type === 'capaian' ? 'capaian_kompetensi_templates' : 'catatan_wali_kelas_templates';
    const existing = settings[key] || [];
    const newSettings = { ...settings, [key]: existing.filter((t: string) => t !== text) };
    
    setSettings(newSettings);
    try {
      await store.settings.setItem('app_settings', newSettings);
      toast.success('Berhasil menghapus preset.');
    } catch (error) {
      toast.error('Gagal menghapus preset.');
    }
  };

  const handlePrint = () => {
    if (selectedStudentIds.length > 0) {
      handlePrintMultiple(selectedStudentIds);
    } else if (selectedStudentId) {
      handlePrintMultiple([selectedStudentId]);
    }
  };

  const handlePrintMultiple = (studentIds: string[]) => {
    if (studentIds.length === 0) {
      toast.error('Tidak ada siswa yang terpilih untuk dicetak.');
      return;
    }
    if (!settings) {
      toast.error('Pengaturan belum dimuat.');
      return;
    }

    const doc = new jsPDF('p', 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const getMonthName = (monthCode: string) => {
      const months: Record<string, string> = {
        '01': 'Januari',
        '02': 'Februari',
        '03': 'Maret',
        '04': 'April',
        '05': 'Mei',
        '06': 'Juni',
        '07': 'Juli',
        '08': 'Agustus',
        '09': 'September',
        '10': 'Oktober',
        '11': 'November',
        '12': 'Desember'
      };
      return months[monthCode] || '';
    };

    // Helper to format subject-specific competence achievement description
    const getSubjectCapaianText = (mapel: string, finalVal: number) => {
      if (finalVal >= 90) {
        return `Mencapai Kompetensi dengan sangat baik dalam hal penguasaan materi pembelajaran ${mapel} serta mampu menerapkan konsep dengan sangat tepat dan mandiri.`;
      } else if (finalVal >= 80) {
        return `Mencapai Kompetensi dengan baik dalam hal memahami materi pokok ${mapel} serta menyelesaikan tugas-tugas harian dengan hasil yang baik.`;
      } else if (finalVal >= 75) {
        return `Menunjukkan penguasaan kompetensi yang cukup pada materi ${mapel}, namun perlu sedikit dorongan dan latihan untuk lebih optimal.`;
      } else {
        return `Perlu pendampingan dan bimbingan yang lebih tekun pada mata pelajaran ${mapel} terutama dalam memahami dasar-dasar konsep penting.`;
      }
    };

    // Helper to calculate Fase based on Kelas
    const getFase = (kelasStr: string) => {
      const k = String(kelasStr).toLowerCase();
      if (k.includes('1') || k.includes('2') || k.includes('i') || k.includes('ii') || k.includes('a')) return 'A';
      if (k.includes('3') || k.includes('4') || k.includes('iii') || k.includes('iv') || k.includes('b')) return 'B';
      if (k.includes('5') || k.includes('6') || k.includes('v') || k.includes('vi') || k.includes('c')) return 'C';
      return 'A'; // default
    };

    // Helper to calculate Semester representation
    const getSemesterRep = (semStr: string) => {
      const s = String(semStr).toLowerCase();
      if (s.includes('1') || s.includes('ganjil')) return '1';
      if (s.includes('2') || s.includes('genap')) return '2';
      return semStr;
    };

    // Helper to calculate Kenaikan Kelas text
    const getKenaikanKelas = (studentKelas: string, formVal?: string) => {
      if (formVal) return formVal;
      const k = String(studentKelas).toLowerCase();
      if (k.includes('1') || k.includes('i')) return 'Naik ke kelas II';
      if (k.includes('2') || k.includes('ii')) return 'Naik ke kelas III';
      if (k.includes('3') || k.includes('iii')) return 'Naik ke kelas IV';
      if (k.includes('4') || k.includes('iv')) return 'Naik ke kelas V';
      if (k.includes('5') || k.includes('v')) return 'Naik ke kelas VI';
      return 'Lulus / Naik ke kelas berikutnya';
    };

    studentIds.forEach((studentId, idx) => {
      const student = students.find(s => s.id === studentId);
      if (!student) return;

      if (idx > 0) {
        doc.addPage();
      }

      // Find the student's custom saved RaporCapaian data
      const studentCapaian = capaian.find(c => c.id_siswa === student.id) || {};
      let currentPage = 1;

      // 1. Draw Page 1 Footer Helper
      const drawFooter = (pageNumber: number) => {
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(40, pageHeight - 40, pageWidth - 40, pageHeight - 40); // Divider line above footer
        
        const footerText = `${student.kelas || settings.nama_kelas || 'kelas 2'}  |  ${student.nama?.toUpperCase()}  |  ${student.nipd || student.nisn || ''}`;
        doc.text(footerText, 40, pageHeight - 25);
        doc.text(`Halaman : ${pageNumber}`, pageWidth - 100, pageHeight - 25);
      };

      // 2. Draw Top Metadata Block (Identical on Page 1 and Page 2)
      const drawHeaderMetadata = (y: number) => {
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);

        let tahunAjaran = '2025/2026';
        const matchYear = semester.match(/\d{4}/);
        if (matchYear) {
          const yr = parseInt(matchYear[0]);
          tahunAjaran = `${yr - 1}/${yr}`;
        }

        const leftX = 40;
        const leftValX = 120;
        const rightX = pageWidth / 2 + 30;
        const rightValX = pageWidth / 2 + 110;

        // Line 1
        doc.text('Nama Murid', leftX, y);
        doc.text(`: ${student.nama?.toUpperCase()}`, leftValX, y);
        doc.text('Kelas', rightX, y);
        doc.text(`: ${student.kelas || settings.nama_kelas || 'kelas 2'}`, rightValX, y);

        // Line 2
        doc.text('NIS/NISN', leftX, y + 15);
        doc.text(`: ${student.nipd || '-'} / ${student.nisn || '-'}`, leftValX, y + 15);
        doc.text('Fase', rightX, y + 15);
        doc.text(`: ${getFase(student.kelas || settings.nama_kelas || '')}`, rightValX, y + 15);

        // Line 3
        doc.text('Sekolah', leftX, y + 30);
        doc.text(`: ${settings.nama_sekolah || '-'}`, leftValX, y + 30);
        doc.text('Semester', rightX, y + 30);
        doc.text(`: ${getSemesterRep(semester)}`, rightValX, y + 30);

        // Line 4
        doc.text('Alamat', leftX, y + 45);
        doc.text(`: ${settings.alamat || '-'}`, leftValX, y + 45);
        doc.text('Tahun Ajaran', rightX, y + 45);
        doc.text(`: ${tahunAjaran}`, rightValX, y + 45);

        // Double Border Divider
        const lineY = y + 55;
        doc.setLineWidth(1);
        doc.setDrawColor(0, 0, 0);
        doc.line(40, lineY, pageWidth - 40, lineY);
        doc.line(40, lineY + 2, pageWidth - 40, lineY + 2);
        
        return lineY + 20; // returns next y position
      };

      // --- PAGE 1 START ---
      let yPos = drawHeaderMetadata(40);

      // Centered Title
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      if (raporType === 'bulanan') {
        const monthLabel = selectedMonth !== 'all' ? ` - BULAN ${getMonthName(selectedMonth).toUpperCase()}` : '';
        doc.text(`LAPORAN HASIL BELAJAR BULANAN${monthLabel}`, pageWidth / 2, yPos, { align: 'center' });
      } else {
        doc.text('LAPORAN HASIL BELAJAR', pageWidth / 2, yPos, { align: 'center' });
      }
      yPos += 15;

      // Group Grades (Wajib vs Pilihan)
      const gradesData = getStudentGrades(student.id);
      const wajibData: any[] = [];
      const pilihanData: any[] = [];
      let wajibIdx = 1;
      let pilihanIdx = 1;

      const isPilihan = (mapelName: string) => {
        if (settings.pilihan_mata_pelajaran && Array.isArray(settings.pilihan_mata_pelajaran)) {
          if (settings.pilihan_mata_pelajaran.includes(mapelName)) return true;
        }
        const m = mapelName.toLowerCase();
        return m.includes('daerah') || m.includes('mulok') || m.includes('pilihan') || m.includes('jawa') || m.includes('sunda') || m.includes('bali') || m.includes('batak') || m.includes('inggris') || m.includes('asing') || m.includes('arab');
      };

      urutanMapel.forEach((mapel) => {
        const g = gradesData[mapel];
        if (g) {
          const finalVal = g.final;
          const capText = getSubjectCapaianText(mapel, finalVal);
          if (isPilihan(mapel)) {
            pilihanData.push([pilihanIdx++, mapel, Math.round(finalVal), capText]);
          } else {
            wajibData.push([wajibIdx++, mapel, Math.round(finalVal), capText]);
          }
        }
      });

      const tableBody: any[] = [];
      tableBody.push([
        { content: 'Mata Pelajaran Wajib', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0] } }
      ]);
      wajibData.forEach(row => tableBody.push(row));

      if (pilihanData.length > 0) {
        tableBody.push([
          { content: 'Mata Pelajaran Pilihan', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0] } }
        ]);
        pilihanData.forEach(row => tableBody.push(row));
      }

      // Grades Table
      autoTable(doc, {
        startY: yPos,
        head: [['No', 'Mata Pelajaran', 'Nilai Akhir', 'Capaian Kompetensi']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
        columnStyles: {
          0: { halign: 'center', cellWidth: 30 },
          1: { cellWidth: 140 },
          2: { halign: 'center', cellWidth: 60 },
          3: { cellWidth: 285 }
        },
        styles: { fontSize: 8.5, cellPadding: 5, lineColor: [0, 0, 0], lineWidth: 0.5 },
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // Kokurikuler Section
      if (raporType !== 'bulanan') {
        if (yPos > pageHeight - 120) {
          drawFooter(currentPage);
          doc.addPage();
          currentPage++;
          yPos = drawHeaderMetadata(40);
        }

        const defaultKokurikuler = `Pada semester ini, ananda menunjukkan capaian yang cukup baik dalam penguatan profil lulusan, yang ditunjukkan melalui kegiatan kokurikuler Senam sehat, Membaca buku.\nPada dimensi kemandirian, ananda berkembang dalam subdimensi bertanggung jawab.\nPada dimensi komunikasi, ananda berkembang dalam subdimensi membaca.\nPada dimensi kesehatan, ananda berkembang dalam subdimensi kebugaran, kesehatan fisik, dan kesehatan mental.`;
        const currentKokurikuler = studentCapaian.kokurikuler || studentCapaian.capaian_kompetensi || defaultKokurikuler;

        autoTable(doc, {
          startY: yPos,
          head: [[{ content: 'Kokurikuler', styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0] } }]],
          body: [[currentKokurikuler]],
          theme: 'grid',
          styles: { fontSize: 8.5, cellPadding: 6, lineColor: [0, 0, 0], lineWidth: 0.5 },
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      // Ekstrakurikuler Section
      if (yPos > pageHeight - 120) {
        drawFooter(currentPage);
        doc.addPage();
        currentPage++;
        yPos = drawHeaderMetadata(40);
      }

      const eNama1 = studentCapaian.ekstra_nama_1 || '-';
      const eKet1 = studentCapaian.ekstra_ket_1 || '-';
      const eNama2 = studentCapaian.ekstra_nama_2 || '-';
      const eKet2 = studentCapaian.ekstra_ket_2 || '-';

      autoTable(doc, {
        startY: yPos,
        head: [['No', 'Ekstrakurikuler', 'Keterangan']],
        body: [
          [1, eNama1, eKet1],
          [2, eNama2, eKet2]
        ],
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
        columnStyles: {
          0: { halign: 'center', cellWidth: 30 },
          1: { cellWidth: 150 },
          2: { cellWidth: 335 }
        },
        styles: { fontSize: 8.5, cellPadding: 5, lineColor: [0, 0, 0], lineWidth: 0.5 }
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // Attendance and Teacher Notes (Side by Side)
      if (yPos > pageHeight - 120) {
        drawFooter(currentPage);
        doc.addPage();
        currentPage++;
        yPos = drawHeaderMetadata(40);
      }

      const att = getAttendanceSummary(student.id);

      // Attendance Table (Left side)
      autoTable(doc, {
        startY: yPos,
        margin: { left: 40, right: pageWidth - 220 }, // Left block (width 180)
        head: [[{ content: 'Ketidakhadiran', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0] } }]],
        body: [
          ['Sakit', `: ${att.sakit} hari`],
          ['Izin', `: ${att.izin} hari`],
          ['Tanpa Keterangan', `: ${att.alpa} hari`]
        ],
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 5, lineColor: [0, 0, 0], lineWidth: 0.5 },
        columnStyles: {
          0: { cellWidth: 110 },
          1: { cellWidth: 70 }
        }
      });
      const leftFinalY = (doc as any).lastAutoTable.finalY;

      // Note (Right side)
      autoTable(doc, {
        startY: yPos,
        margin: { left: 240, right: 40 }, // Right block (width 315)
        head: [[{ content: 'Catatan Wali Kelas', styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0] } }]],
        body: [[studentCapaian.catatan_wali_kelas || 'Belajarlah lebih giat lagi!']],
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 6, lineColor: [0, 0, 0], lineWidth: 0.5 },
      });
      const rightFinalY = (doc as any).lastAutoTable.finalY;

      yPos = Math.max(leftFinalY, rightFinalY) + 15;

      // --- DYNAMIC PAGE 2 CONTENT CHECK ---
      const isGenap = (() => {
        const s = semester.toLowerCase();
        if (s.includes('ganjil') || s.includes(' 1') || s.includes('semester 1') || s.includes('semester i')) return false;
        return s.includes('genap') || s.includes('2') || s.includes('ii');
      })();
      const showKenaikanKelas = raporType === 'semester' && isGenap;
      const kenaikanText = getKenaikanKelas(student.kelas || settings.nama_kelas || '', studentCapaian.kenaikan_kelas);

      const neededHeight = (showKenaikanKelas ? 45 : 0) + 105 + 160 + 40;

      if (yPos + neededHeight > pageHeight - 50) {
        // Does NOT fit on current page, push to a new page
        drawFooter(currentPage);
        doc.addPage();
        currentPage++;
        yPos = drawHeaderMetadata(40);
      }

      // 1. Keterangan Kenaikan Kelas (specifically semester 2 / Genap and for Semester report type only)
      if (showKenaikanKelas) {
        autoTable(doc, {
          startY: yPos,
          body: [[{ content: `Keterangan Kenaikan Kelas : ${kenaikanText}`, styles: { fontStyle: 'bold' } }]],
          theme: 'grid',
          styles: { fontSize: 9.5, halign: 'center', cellPadding: 8, lineColor: [0, 0, 0], lineWidth: 0.5 },
        });
        yPos = (doc as any).lastAutoTable.finalY + 20;
      }

      // 2. Tanggapan Orang Tua/Wali Murid Box
      autoTable(doc, {
        startY: yPos,
        head: [[{ content: 'Tanggapan Orang Tua/Wali Murid', styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0, 0, 0] } }]],
        body: [['\n\n\n\n\n']], // Space for writing
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 6, lineColor: [0, 0, 0], lineWidth: 0.5 },
      });
      yPos = (doc as any).lastAutoTable.finalY + 40;

      // 3. Signatures block
      const dateFormatted = format(new Date(signatureDate), 'd MMMM yyyy', { locale: id });
      const placeAndDate = `${signaturePlace}, ${dateFormatted}`;

      const leftColX = 120;
      const rightColX = pageWidth - 120;
      const centerColX = pageWidth / 2;

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9.5);

      // Orang Tua Murid (Left column)
      doc.text('Mengetahui', leftColX, yPos, { align: 'center' });
      doc.text('Orang Tua / Wali Murid', leftColX, yPos + 15, { align: 'center' });
      doc.text('.........................................', leftColX, yPos + 80, { align: 'center' });

      // Wali Kelas (Right column)
      doc.text(placeAndDate, rightColX, yPos, { align: 'center' });
      doc.text('Wali Kelas', rightColX, yPos + 15, { align: 'center' });
      doc.text(settings.nama_wali_kelas || '.........................................', rightColX, yPos + 80, { align: 'center' });
      if (settings.nip_wali_kelas) {
        doc.text(`NIP. ${settings.nip_wali_kelas}`, rightColX, yPos + 92, { align: 'center' });
      }

      // Kepala Sekolah (Centered, slightly below)
      const kepsekY = yPos + 115;
      doc.text('Mengetahui,', centerColX, kepsekY, { align: 'center' });
      doc.text('Kepala Sekolah', centerColX, kepsekY + 15, { align: 'center' });
      doc.text(settings.nama_kepala_sekolah || '.........................................', centerColX, kepsekY + 80, { align: 'center' });
      if (settings.nip_kepala_sekolah) {
        doc.text(`NIP. ${settings.nip_kepala_sekolah}`, centerColX, kepsekY + 92, { align: 'center' });
      }

      // Draw final footer
      drawFooter(currentPage);
    });

    if (studentIds.length === 1) {
      const student = students.find(s => s.id === studentIds[0]);
      doc.save(`Rapor_${raporType}_${student?.nama.replace(/\s+/g, '_')}_${semester.replace(/\s+/g, '')}.pdf`);
    } else {
      doc.save(`Rapor_Gabungan_${raporType}_${studentIds.length}_Siswa_${semester.replace(/\s+/g, '')}.pdf`);
    }
    toast.success('Rapor berhasil diunduh!');
  };

  // Class selection logic
  const classes = Array.from(new Set(students.map(s => s.kelas).filter(Boolean)));
  
  const filteredStudents = students.filter(s => {
    if (filterKelas === 'all') return true;
    return s.kelas === filterKelas;
  });

  const isAllSelected = filteredStudents.length > 0 && filteredStudents.every(s => selectedStudentIds.includes(s.id));

  const handleSelectAllToggle = () => {
    if (isAllSelected) {
      const filteredIds = new Set(filteredStudents.map(s => s.id));
      setSelectedStudentIds(prev => prev.filter(id => !filteredIds.has(id)));
    } else {
      const filteredIds = filteredStudents.map(s => s.id);
      setSelectedStudentIds(prev => {
        const newSelection = [...prev];
        filteredIds.forEach(id => {
          if (!newSelection.includes(id)) {
            newSelection.push(id);
          }
        });
        return newSelection;
      });
    }
  };

  // Sync selected index on filter change
  useEffect(() => {
    if (filteredStudents.length > 0 && !filteredStudents.some(s => s.id === selectedStudentId)) {
      setSelectedStudentId(filteredStudents[0].id);
    }
  }, [filterKelas, students]);

  const currentIncludeHarian = raporType === 'bulanan' ? includeHarianBulanan : includeHarian;
  const currentIncludeTugas = raporType === 'bulanan' ? includeTugasBulanan : includeTugas;
  const currentIncludeUjian = raporType === 'bulanan' ? includeUjianBulanan : includeUjian;

  return (
    <div className="h-full flex flex-col md:flex-row gap-6 p-2 custom-scrollbar">
      {/* Sidebar for Student List */}
      <div className="w-full md:w-80 flex flex-col gap-4 bg-slate-800/40 rounded-2xl border border-slate-700/50 p-4">
        <div>
          <h3 className="font-semibold text-slate-200 mb-2">Daftar Siswa</h3>
          
          {/* Class Filter */}
          <div className="space-y-1 mb-3">
            <label className="block text-xs font-medium text-slate-400">Filter Kelas</label>
            <select 
              value={filterKelas}
              onChange={(e) => setFilterKelas(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-xl text-xs text-slate-200 outline-none"
            >
              <option value="all">Semua Kelas</option>
              {classes.map(cls => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>

          {/* Bulk Selection Toggle */}
          <div className="flex items-center justify-between border-t border-b border-slate-700/50 py-2">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={isAllSelected}
                onChange={handleSelectAllToggle}
                className="rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
              />
              <span>Pilih Semua ({filteredStudents.length})</span>
            </label>
            {selectedStudentIds.length > 0 && (
              <button 
                onClick={() => setSelectedStudentIds([])}
                className="text-[10px] text-rose-400 hover:underline"
              >
                Bersihkan
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-1.5 min-h-[250px] max-h-[450px] md:max-h-none">
          {filteredStudents.map(student => (
            <div 
              key={student.id}
              className={`flex items-center gap-2 w-full p-2 rounded-xl border transition-all ${
                selectedStudentId === student.id
                  ? 'bg-indigo-600/15 border-indigo-500/40'
                  : 'border-transparent hover:bg-slate-700/30'
              }`}
            >
              <input 
                type="checkbox"
                checked={selectedStudentIds.includes(student.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedStudentIds(prev => [...prev, student.id]);
                  } else {
                    setSelectedStudentIds(prev => prev.filter(id => id !== student.id));
                  }
                }}
                className="rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
              />
              <button
                onClick={() => setSelectedStudentId(student.id)}
                className="flex-1 text-left outline-none cursor-pointer"
              >
                <div className={`text-sm font-medium ${selectedStudentId === student.id ? 'text-indigo-200' : 'text-slate-200'}`}>
                  {student.nama}
                </div>
                <div className="text-[10px] text-slate-400 font-normal">
                  Kelas: {student.kelas || settings?.nama_kelas || '-'}
                </div>
              </button>
            </div>
          ))}
          {filteredStudents.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-4">Belum ada siswa di kelas ini.</p>
          )}
        </div>

        {/* Print Selected Button */}
        {selectedStudentIds.length > 0 && (
          <button
            onClick={() => handlePrintMultiple(selectedStudentIds)}
            className="w-full mt-auto flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-2"
          >
            <Printer size={14} />
            Cetak Terpilih ({selectedStudentIds.length} Siswa)
          </button>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 pb-10">
        {role === 'kepsek' && (
          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 px-4 py-3 rounded-xl text-xs flex items-center gap-2 animate-fade-in">
            <span>⚠️</span>
            <span>Anda sedang masuk sebagai <strong>Kepala Sekolah</strong> (Mode Baca Saja). Anda dapat melihat dan mengunduh seluruh rapor & piagam, tetapi tidak dapat mengubah konfigurasi atau menginput data tambahan.</span>
          </div>
        )}
        <div className="bg-slate-800/40 rounded-2xl border border-slate-700/50 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between border-b border-slate-700/50 pb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <FileText className="text-indigo-400" />
                Manajemen Rapor Siswa
              </h2>
              <p className="text-sm text-slate-400 mt-1">Atur profil capaian dan cetak rapor bulanan atau semester.</p>
            </div>
            <button 
              onClick={handlePrint}
              disabled={!selectedStudentId}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-medium shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Printer size={18} />
              Cetak PDF
            </button>
          </div>

          {/* Konfigurasi Rapor */}
          {/* Konfigurasi Rapor Tabs */}
          <div className="flex flex-wrap gap-6 border-b border-slate-700/50 mb-4">
            <button 
              className={`pb-3 text-sm font-medium transition-colors cursor-pointer ${activeTab === 'cetak' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setActiveTab('cetak')}
            >
              Pengaturan Cetak
            </button>
            <button 
              className={`pb-3 text-sm font-medium transition-colors cursor-pointer ${activeTab === 'urutan' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setActiveTab('urutan')}
            >
              Urutan Mata Pelajaran
            </button>
            <button 
              className={`pb-3 text-sm font-medium transition-colors cursor-pointer ${activeTab === 'rekap' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setActiveTab('rekap')}
            >
              📊 Rekap Nilai & Ranking
            </button>
            <button 
              className={`pb-3 text-sm font-medium transition-colors cursor-pointer ${activeTab === 'piagan' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setActiveTab('piagan')}
            >
              🎖️ Cetak Piagam Penghargaan
            </button>
          </div>
          {activeTab === 'urutan' ? (
            <div className="space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl gap-4">
                 <p className="text-sm text-indigo-200">Atur urutan mata pelajaran spesifik untuk tampilan dan cetak Rapor.</p>
                 {role === 'guru' && (
                   <button onClick={handleSaveUrutan} className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20 shrink-0">Simpan Urutan</button>
                 )}
              </div>
              <div className="bg-slate-900/50 border border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-800">
                {urutanMapel.map((mapel, index) => (
                  <div key={mapel} className="flex items-center justify-between p-3 hover:bg-slate-800/50 transition-colors">
                     <span className="text-sm text-slate-200 font-medium"><span className="text-slate-500 mr-3">{index + 1}.</span>{mapel}</span>
                     <div className="flex items-center gap-2">
                       <button onClick={() => moveUp(index)} disabled={index === 0 || role !== "guru"} className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-700 rounded disabled:opacity-30 transition-colors" title="Naikkan urutan">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" /></svg>
                       </button>
                       <button onClick={() => moveDown(index)} disabled={index === urutanMapel.length - 1 || role !== "guru"} className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-700 rounded disabled:opacity-30 transition-colors" title="Turunkan urutan">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                       </button>
                     </div>
                  </div>
                ))}
                {urutanMapel.length === 0 && (
                   <div className="p-8 text-center text-slate-500 italic">Belum ada mata pelajaran. Silakan tambahkan di menu Pengaturan.</div>
                )}
              </div>
            </div>
          ) : activeTab === 'rekap' ? (
            <div className="space-y-6 animate-fade-in">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-indigo-300">Rekapitulasi Nilai & Peringkat Siswa</h4>
                  <p className="text-xs text-slate-400 mt-1">Daftar peringkat siswa dihitung berdasarkan nilai rata-rata dari seluruh mata pelajaran.</p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button 
                    onClick={handleExportRekapRankingExcel} 
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-600/20 cursor-pointer"
                  >
                    <Download size={14} />
                    Unduh Excel (.xlsx)
                  </button>
                  <button 
                    onClick={handleExportRekapRankingPDF} 
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg shadow-indigo-500/20 cursor-pointer"
                  >
                    <Printer size={14} />
                    Cetak PDF Rekap
                  </button>
                </div>
              </div>

              <div className="bg-slate-900/50 border border-slate-700/80 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-slate-800/80 border-b border-slate-700 text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        <th className="px-4 py-3 text-center">Peringkat</th>
                        <th className="px-4 py-3">Nama Siswa</th>
                        {urutanMapel.map(mapel => (
                          <th key={mapel} className="px-4 py-3 text-center text-[11px] min-w-[80px]" title={mapel}>
                            {mapel.substring(0, 8)}{mapel.length > 8 ? '..' : ''}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-center font-bold text-indigo-400">Total</th>
                        <th className="px-4 py-3 text-center font-bold text-emerald-400">Rata-rata</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs text-slate-300">
                      {getRankedStudents().map((item, idx) => (
                        <tr key={item.student.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3 text-center font-bold">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${
                              item.rank === 1 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                              item.rank === 2 ? 'bg-slate-400/20 text-slate-200 border border-slate-400/30' :
                              item.rank === 3 ? 'bg-amber-700/20 text-amber-500 border border-amber-700/30' :
                              'text-slate-400'
                            }`}>
                              {item.rank}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-200">{item.student.nama}</td>
                          {urutanMapel.map(mapel => {
                            const val = item.gradesData[mapel]?.final;
                            return (
                              <td key={mapel} className="px-4 py-3 text-center font-mono">
                                {val !== undefined && val > 0 ? val.toFixed(1) : <span className="text-slate-600">-</span>}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-center font-bold text-indigo-300 font-mono">{item.total.toFixed(1)}</td>
                          <td className="px-4 py-3 text-center font-bold text-emerald-400 font-mono">{item.avg.toFixed(1)}</td>
                        </tr>
                      ))}
                      {students.length === 0 && (
                        <tr>
                          <td colSpan={urutanMapel.length + 4} className="p-8 text-center text-slate-500 italic">Tidak ada data siswa.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : activeTab === 'piagan' ? (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-xl">
                <h4 className="text-sm font-semibold text-indigo-300">Cetak Piagam Penghargaan Siswa</h4>
                <p className="text-xs text-slate-400 mt-1">Sediakan piagam penghargaan apresiasi belajar resmi dengan format tanda tangan wali kelas & kepala sekolah.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Form Pengaturan Piagam */}
                <div className="lg:col-span-5 bg-slate-800/40 border border-slate-700 p-5 rounded-xl space-y-4">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">Pengaturan Piagam</h5>
                  
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Pilih Siswa Penerima</label>
                    <select 
                      value={piagamSiswaId}
                      onChange={(e) => {
                        const sid = e.target.value;
                        setPiagamSiswaId(sid);
                        // Auto estimate ranking
                        const idx = getRankedStudents().findIndex(r => r.student.id === sid);
                        if (idx !== -1) {
                          const rank = getRankedStudents()[idx].rank;
                          setPiagamJuara(`Juara ${rank}`);
                          setPiagamNo(`00${idx + 1}/PP/2026`);
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">-- Pilih Siswa --</option>
                      {students.map(s => (
                        <option key={s.id} value={s.id}>{s.nama}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Pilih Template Piagam</label>
                    <select 
                      value={piagamTemplate}
                      onChange={(e) => setPiagamTemplate(e.target.value as any)}
                      disabled={role !== 'guru'}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-indigo-300 font-medium disabled:opacity-75 disabled:cursor-not-allowed"
                    >
                      <option value="classic">🏆 Emas Klasik (Classic Gold)</option>
                      <option value="modern">🌿 Minimalis Elegan (Modern Indigo)</option>
                      <option value="emerald">💚 Hijau Zamrud Agung (Royal Emerald)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Predikat / Gelar</label>
                      <input 
                        type="text" 
                        value={piagamJuara}
                        onChange={(e) => setPiagamJuara(e.target.value)}
                        placeholder="Contoh: Juara 1"
                        disabled={role !== 'guru'}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-75 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Kategori Prestasi</label>
                      <input 
                        type="text" 
                        value={piagamKategori}
                        onChange={(e) => setPiagamKategori(e.target.value)}
                        placeholder="Contoh: Peringkat Kelas Terbaik"
                        disabled={role !== 'guru'}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-75 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Nomor Piagam</label>
                    <input 
                      type="text" 
                      value={piagamNo}
                      onChange={(e) => setPiagamNo(e.target.value)}
                      placeholder="Contoh: 001/PP/2026"
                      disabled={role !== 'guru'}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                  </div>

                  <button 
                    onClick={() => handlePrintPiagam(piagamSiswaId, piagamJuara, piagamKategori, piagamNo, piagamTemplate)}
                    disabled={!piagamSiswaId}
                    className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl text-sm transition-all shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    🎖️ Unduh Piagam PDF
                  </button>
                </div>

                {/* Live Certificate Mockup */}
                <div className="lg:col-span-7 bg-slate-950/40 border border-slate-800 p-8 rounded-xl flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[420px]">
                  {piagamSiswaId ? (
                    <div className={`relative p-8 max-w-lg w-full rounded-2xl shadow-2xl transition-all border-4 duration-300 overflow-hidden ${
                      piagamTemplate === 'classic' ? 'border-double border-amber-500/50 bg-gradient-to-b from-slate-900 via-slate-900 to-amber-950/20' :
                      piagamTemplate === 'modern' ? 'border-indigo-500/40 bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950/15' :
                      piagamTemplate === 'emerald' ? 'border-double border-emerald-500/50 bg-gradient-to-b from-slate-950 via-slate-900 to-emerald-950/20' :
                      'border-teal-500/40 bg-gradient-to-b from-slate-900 via-slate-900 to-teal-950/15'
                    }`}>
                      {/* Decorative Corner Lines */}
                      <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-slate-700/30"></div>
                      <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-slate-700/30"></div>
                      <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-slate-700/30"></div>
                      <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-slate-700/30"></div>

                      {/* Header Area */}
                      <div className="space-y-1.5 py-1">
                        <div className="text-[6.5px] tracking-widest font-mono font-bold text-slate-400">
                          KEMENTERIAN PENDIDIKAN, KEBUDAYAAN, RISET, DAN TEKNOLOGI
                        </div>
                        <div className={`text-xl sm:text-2xl font-extrabold tracking-wide uppercase leading-tight ${
                          piagamTemplate === 'classic' ? 'text-amber-300 drop-shadow-md' :
                          piagamTemplate === 'modern' ? 'text-indigo-300 drop-shadow-md' :
                          'text-emerald-300 drop-shadow-md font-serif'
                        }`}>
                          {settings?.nama_sekolah?.toUpperCase() || 'NAMA SEKOLAH'}
                        </div>
                        <div className="text-[8px] text-slate-400 italic">
                          Alamat: {settings?.alamat || 'Alamat Sekolah Belum Diatur'}
                        </div>
                      </div>

                      {/* Double Divider Line */}
                      <div className="my-3 space-y-0.5">
                        <div className={`h-[1.5px] w-4/5 mx-auto ${
                          piagamTemplate === 'classic' ? 'bg-amber-500/40' :
                          piagamTemplate === 'modern' ? 'bg-indigo-500/40' :
                          piagamTemplate === 'emerald' ? 'bg-emerald-500/40' :
                          'bg-teal-500/40'
                        }`}></div>
                        <div className="h-[0.5px] bg-slate-800 w-2/3 mx-auto"></div>
                      </div>

                      {/* Certificate Title */}
                      <div className="space-y-1">
                        <div className={`text-2xl font-black tracking-widest leading-none ${
                          piagamTemplate === 'classic' ? 'text-gradient bg-gradient-to-r from-amber-400 via-amber-200 to-amber-500 bg-clip-text text-transparent' :
                          piagamTemplate === 'modern' ? 'text-indigo-400' :
                          piagamTemplate === 'emerald' ? 'text-emerald-400 font-serif' :
                          'text-teal-400 font-sans'
                        }`}>
                          PIAGAM PENGHARGAAN
                        </div>
                        {piagamNo && piagamNo.trim() !== '' && (
                          <div className="text-[9px] text-slate-500 font-mono tracking-widest">
                            NOMOR: {piagamNo}
                          </div>
                        )}
                      </div>
                      
                      {/* Body Content */}
                      <div className="space-y-3 mt-4">
                        <div className="text-[10px] text-slate-400 uppercase tracking-widest">Diberikan Kepada Siswa Berprestasi:</div>
                        <div className={`text-xl font-black border-b pb-1.5 max-w-sm mx-auto tracking-wide ${
                          piagamTemplate === 'classic' ? 'text-slate-100 border-amber-500/30' :
                          piagamTemplate === 'modern' ? 'text-slate-100 border-indigo-500/30' :
                          piagamTemplate === 'emerald' ? 'text-slate-100 border-emerald-500/30' :
                          'text-slate-100 border-teal-500/30'
                        }`}>
                          {students.find(s => s.id === piagamSiswaId)?.nama || ''}
                        </div>
                        
                        <div className="text-xs text-slate-400 italic">sebagai</div>
                        
                        <div className={`text-sm font-bold py-2 px-6 rounded-xl border shadow-lg inline-block uppercase tracking-widest ${
                          piagamTemplate === 'classic' ? 'text-amber-400 bg-amber-500/5 border-amber-500/30 shadow-amber-950/10' :
                          piagamTemplate === 'modern' ? 'text-indigo-400 bg-indigo-500/5 border-indigo-500/30 shadow-indigo-950/10' :
                          piagamTemplate === 'emerald' ? 'text-emerald-400 bg-emerald-500/5 border-emerald-500/30 shadow-emerald-950/10' :
                          'text-teal-400 bg-teal-500/5 border-teal-500/30 shadow-teal-950/10'
                        }`}>
                          🏅 {piagamJuara} - {piagamKategori}
                        </div>
                        
                        <div className="text-[10px] text-slate-400 leading-relaxed max-w-sm mx-auto">
                          Atas prestasi luar biasa, dedikasi belajar, dan akhlak mulia dalam kelas <span className="text-slate-200 font-semibold">{students.find(s => s.id === piagamSiswaId)?.kelas || settings?.nama_kelas || ''}</span> pada Semester <span className="text-slate-200 font-semibold">{semester}</span>.
                        </div>
                      </div>

                      {/* Elegant Absolute Seal/Badge (Lencana Emas) */}
                      <div className="absolute bottom-14 right-8 w-18 h-18 flex flex-col items-center justify-center select-none" title="Lencana Emas Penghargaan">
                        <svg className="w-18 h-18 drop-shadow-xl" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <defs>
                            <linearGradient id="goldGradPreview" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#D97706" /> {/* amber-600 */}
                              <stop offset="30%" stopColor="#FCD34D" /> {/* amber-300 */}
                              <stop offset="70%" stopColor="#B45309" /> {/* amber-700 */}
                              <stop offset="100%" stopColor="#F59E0B" /> {/* amber-500 */}
                            </linearGradient>
                            <linearGradient id="goldShinyPreview" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#FFFBEB" /> {/* amber-50 */}
                              <stop offset="50%" stopColor="#FBBF24" /> {/* amber-400 */}
                              <stop offset="100%" stopColor="#78350F" /> {/* amber-900 */}
                            </linearGradient>
                            <linearGradient id="ribbonGradPreview" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="#D97706" />
                              <stop offset="100%" stopColor="#78350F" />
                            </linearGradient>
                          </defs>
                          {/* Left Ribbon Tail */}
                          <path d="M24 38 L16 58 L24 53 L32 58 L28 38 Z" fill="url(#ribbonGradPreview)" filter="drop-shadow(0px 2px 3px rgba(0,0,0,0.4))" />
                          {/* Right Ribbon Tail */}
                          <path d="M40 38 L32 58 L40 53 L48 58 L40 38 Z" fill="url(#ribbonGradPreview)" filter="drop-shadow(0px 2px 3px rgba(0,0,0,0.4))" />
                          
                          {/* Scalloped edge rosette */}
                          <g fill="url(#goldGradPreview)" filter="drop-shadow(0px 3px 5px rgba(0,0,0,0.3))">
                            <circle cx="32" cy="28" r="20" />
                            <path d="M32 6 L35 10 L40 8 L42 12 L47 11 L48 16 L52 16 L51 21 L54 23 L52 28 L54 33 L51 35 L52 40 L48 40 L47 45 L42 44 L40 48 L35 46 L32 50 L29 46 L24 48 L22 44 L17 45 L16 40 L12 40 L13 35 L10 33 L12 28 L10 23 L13 21 L12 16 L16 16 L17 11 L22 12 L24 8 L29 10 Z" />
                          </g>
                          
                          {/* Outer Shiny Circle */}
                          <circle cx="32" cy="28" r="17" fill="url(#goldShinyPreview)" />
                          
                          {/* Deep dark inner circle */}
                          <circle cx="32" cy="28" r="14.5" fill="#020617" stroke="url(#goldGradPreview)" strokeWidth="1.5" />
                          
                          {/* Centered beautiful gold star */}
                          <polygon points="32,16 35.5,23 43.5,24 37.5,29.5 39,37 32,33.5 25,37 26.5,29.5 20.5,24 28.5,23" fill="url(#goldShinyPreview)" />
                          
                          {/* Inner circle detailing */}
                          <circle cx="32" cy="28" r="11" fill="none" stroke="url(#goldGradPreview)" strokeWidth="0.5" strokeDasharray="1.5 1.5" />
                        </svg>
                      </div>

                      {/* Signatures Row */}
                      <div className="grid grid-cols-2 text-[9px] text-slate-400 pt-5 mt-6 border-t border-slate-800/80">
                        <div className="space-y-4">
                          <div>Wali Kelas,</div>
                          <div className="space-y-0.5">
                            <div className="font-bold text-slate-200 border-b border-slate-800 max-w-[120px] mx-auto pb-0.5">{settings?.nama_wali_kelas || '__________________'}</div>
                            <div className="text-[8px] text-slate-500 leading-none">NIP. {settings?.nip_wali_kelas || '-'}</div>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div>Kepala Sekolah,</div>
                          <div className="space-y-0.5">
                            <div className="font-bold text-slate-200 border-b border-slate-800 max-w-[120px] mx-auto pb-0.5">{settings?.nama_kepala_sekolah || '__________________'}</div>
                            <div className="text-[8px] text-slate-500 leading-none">NIP. {settings?.nip_kepala_sekolah || '-'}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-500 text-xs italic flex flex-col items-center gap-2">
                      <span className="text-4xl animate-bounce">🎖️</span>
                      <span className="text-slate-400 font-medium">Silakan pilih siswa penerima di panel kiri untuk melihat pratinjau piagam penghargaan.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                <SettingsIcon size={16} className="text-slate-400" />
                Pengaturan Rapor
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-slate-400 mb-1">Jenis Rapor</label>
                  <select 
                    value={raporType}
                    onChange={(e) => setRaporType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none"
                  >
                    <option value="bulanan">Tengah Semester (Bulanan)</option>
                    <option value="semester">Akhir Semester</option>
                  </select>
                </div>
                {raporType === 'bulanan' && (
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs text-slate-400 mb-1">Pilih Bulan</label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none font-medium text-indigo-300"
                    >
                      <option value="all">Semua Bulan</option>
                      <option value="01">Januari</option>
                      <option value="02">Februari</option>
                      <option value="03">Maret</option>
                      <option value="04">April</option>
                      <option value="05">Mei</option>
                      <option value="06">Juni</option>
                      <option value="07">Juli</option>
                      <option value="08">Agustus</option>
                      <option value="09">September</option>
                      <option value="10">Oktober</option>
                      <option value="11">November</option>
                      <option value="12">Desember</option>
                    </select>
                  </div>
                )}
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-slate-400 mb-1">Tanggal Tanda Tangan</label>
                  <input 
                    type="date" 
                    value={signatureDate}
                    disabled={role !== 'guru'}
                    onChange={(e) => setSignatureDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none disabled:opacity-50"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">Tempat Tanda Tangan</label>
                  <input 
                    type="text" 
                    value={signaturePlace}
                    disabled={role !== 'guru'}
                    onChange={(e) => setSignaturePlace(e.target.value)}
                    placeholder="Contoh: Jakarta"
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-slate-200 outline-none disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Komponen & Bobot Nilai */}
              <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-700/30 space-y-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Komponen & Bobot Nilai</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-slate-200">
                      <input 
                        type="checkbox" 
                        checked={currentIncludeHarian} 
                        disabled={role !== 'guru'}
                        onChange={e => {
                          if (raporType === 'bulanan') {
                            setIncludeHarianBulanan(e.target.checked);
                          } else {
                            setIncludeHarian(e.target.checked);
                          }
                        }} 
                        className="rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-500 disabled:opacity-50" 
                      />
                      Nilai Harian
                    </label>
                    {currentIncludeHarian && (
                      <div className="flex items-center gap-1.5 animate-in fade-in duration-200">
                        <span className="text-xs text-slate-500">Bobot:</span>
                        <input 
                          type="number" 
                          min="1" 
                          max="100" 
                          value={bobotHarian} 
                          disabled={role !== 'guru'}
                          onChange={e => { let v = parseInt(e.target.value.replace(/^0+(?=\d)/, ''), 10); if (isNaN(v)) v = 0; if (v > 100) v = 100; setBobotHarian(v); }} 
                          className="w-14 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 outline-none text-center disabled:opacity-50" 
                        />
                        <span className="text-xs text-slate-500">%</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-slate-200">
                      <input 
                        type="checkbox" 
                        checked={currentIncludeTugas} 
                        disabled={role !== 'guru'}
                        onChange={e => {
                          if (raporType === 'bulanan') {
                            setIncludeTugasBulanan(e.target.checked);
                          } else {
                            setIncludeTugas(e.target.checked);
                          }
                        }} 
                        className="rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-500 disabled:opacity-50" 
                      />
                      Nilai Tugas
                    </label>
                    {currentIncludeTugas && (
                      <div className="flex items-center gap-1.5 animate-in fade-in duration-200">
                        <span className="text-xs text-slate-500">Bobot:</span>
                        <input 
                          type="number" 
                          min="1" 
                          max="100" 
                          value={bobotTugas} 
                          disabled={role !== 'guru'}
                          onChange={e => { let v = parseInt(e.target.value.replace(/^0+(?=\d)/, ''), 10); if (isNaN(v)) v = 0; if (v > 100) v = 100; setBobotTugas(v); }} 
                          className="w-14 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 outline-none text-center disabled:opacity-50" 
                        />
                        <span className="text-xs text-slate-500">%</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:text-slate-200">
                      <input 
                        type="checkbox" 
                        checked={currentIncludeUjian} 
                        disabled={role !== 'guru'}
                        onChange={e => {
                          if (raporType === 'bulanan') {
                            setIncludeUjianBulanan(e.target.checked);
                          } else {
                            setIncludeUjian(e.target.checked);
                          }
                        }} 
                        className="rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-500 disabled:opacity-50" 
                      />
                      Nilai Ujian
                    </label>
                    {currentIncludeUjian && (
                      <div className="flex items-center gap-1.5 animate-in fade-in duration-200">
                        <span className="text-xs text-slate-500">Bobot:</span>
                        <input 
                          type="number" 
                          min="1" 
                          max="100" 
                          value={bobotUjian} 
                          disabled={role !== 'guru'}
                          onChange={e => { let v = parseInt(e.target.value.replace(/^0+(?=\d)/, ''), 10); if (isNaN(v)) v = 0; if (v > 100) v = 100; setBobotUjian(v); }} 
                          className="w-14 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 outline-none text-center disabled:opacity-50" 
                        />
                        <span className="text-xs text-slate-500">%</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="text-[11px] text-slate-500 flex justify-between border-t border-slate-700/50 pt-2 pb-1">
                  <span>Total Bobot Aktif:</span>
                  <span className={`font-semibold ${(currentIncludeHarian ? bobotHarian : 0) + (currentIncludeTugas ? bobotTugas : 0) + (currentIncludeUjian ? bobotUjian : 0) === 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {((currentIncludeHarian ? bobotHarian : 0) + (currentIncludeTugas ? bobotTugas : 0) + (currentIncludeUjian ? bobotUjian : 0))}%
                  </span>
                </div>
                {role === 'guru' ? (
                  <button
                    type="button"
                    onClick={handleSaveBobot}
                    className="w-full mt-2 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white py-1.5 px-3 rounded-lg text-xs font-semibold shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all cursor-pointer"
                  >
                    <Save size={12} />
                    Simpan Bobot Nilai
                  </button>
                ) : (
                  <div className="text-center text-[10px] text-amber-400 font-medium bg-amber-500/10 border border-amber-500/20 py-2 px-3 rounded-xl mt-2 leading-normal">
                    ⚠️ Mode Lihat Saja: Kepala Sekolah tidak dapat mengubah pengaturan bobot nilai.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                <User size={16} className="text-slate-400" />
                Letak Tanda Tangan
              </h3>
              
              <div className="space-y-3 bg-slate-900/40 p-4 rounded-xl border border-slate-700/30">
                <div className="flex justify-between items-center gap-4">
                  <span className="text-sm text-slate-300">Wali Kelas</span>
                  <select value={posWaliKelas} disabled={role !== 'guru'} onChange={e => setPosWaliKelas(e.target.value as any)} className="px-3 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-slate-200 outline-none disabled:opacity-50">
                    <option value="left">Kiri</option>
                    <option value="center">Tengah Bawah</option>
                    <option value="right">Kanan</option>
                    <option value="hidden">Sembunyikan</option>
                  </select>
                </div>
                <div className="flex justify-between items-center gap-4">
                  <span className="text-sm text-slate-300">Kepala Sekolah</span>
                  <select value={posKepsek} disabled={role !== 'guru'} onChange={e => setPosKepsek(e.target.value as any)} className="px-3 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-slate-200 outline-none disabled:opacity-50">
                    <option value="left">Kiri</option>
                    <option value="center">Tengah Bawah</option>
                    <option value="right">Kanan</option>
                    <option value="hidden">Sembunyikan</option>
                  </select>
                </div>
                <div className="flex justify-between items-center gap-4">
                  <span className="text-sm text-slate-300">Orang Tua / Wali</span>
                  <select value={posOrangTua} disabled={role !== 'guru'} onChange={e => setPosOrangTua(e.target.value as any)} className="px-3 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-slate-200 outline-none disabled:opacity-50">
                    <option value="left">Kiri</option>
                    <option value="center">Tengah Bawah</option>
                    <option value="right">Kanan</option>
                    <option value="hidden">Sembunyikan</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          )}
        </div>

        {/* Profil Capaian Form */}
        {selectedStudentId && (
          <div className="bg-slate-800/40 rounded-2xl border border-slate-700/50 p-6 space-y-6">
            <h3 className="text-lg font-semibold text-slate-200 border-b border-slate-700/50 pb-3 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex items-center gap-3">
                <span>Profil Capaian Siswa</span>
                <span className="text-sm font-normal text-indigo-300 bg-indigo-500/10 px-3 py-1 rounded-full">
                  {students.find(s => s.id === selectedStudentId)?.nama}
                </span>
              </div>
              {role === 'guru' && (
                <button
                  type="button"
                  onClick={handleTarikData}
                  className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
                  title="Tarik nilai dan ketidakhadiran dari database lalu generate deskripsi otomatis"
                >
                  <Download size={14} />
                  Tarik & Ambil Data dari Database
                </button>
              )}
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-2">
                    <label className="block text-sm font-medium text-slate-300">Capaian Kompetensi / Deskripsi</label>
                    {role === 'guru' && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <select
                          className="text-[11px] bg-slate-800 border border-slate-700 text-slate-300 rounded px-2 py-1 outline-none w-full sm:w-44 xl:w-56 truncate cursor-pointer focus:ring-1 focus:ring-indigo-500"
                          onChange={(e) => {
                            if (e.target.value === '__delete__') {
                              if (formData.capaian_kompetensi) {
                                handleDeletePreset('capaian', formData.capaian_kompetensi);
                              }
                              e.target.value = '';
                            } else if (e.target.value) {
                              setFormData(prev => ({ ...prev, capaian_kompetensi: e.target.value }));
                              e.target.value = '';
                            }
                          }}
                        >
                          <option value="">Pilih Preset...</option>
                          {(settings?.capaian_kompetensi_templates && settings.capaian_kompetensi_templates.length > 0
                            ? settings.capaian_kompetensi_templates
                            : defaultCapaianPresets
                          ).map((t: string, i: number) => (
                            <option key={i} value={t}>{i + 1}. {t.substring(0, 50)}...</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleSavePreset('capaian', formData.capaian_kompetensi || '')}
                          className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 cursor-pointer bg-slate-800/60 px-2 py-1 rounded border border-slate-700 transition-colors"
                          title="Simpan teks saat ini sebagai preset baru"
                        >
                          + Preset
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPresetManagerType('capaian');
                            setEditingPresetIdx(null);
                            setEditingPresetText('');
                          }}
                          className="text-[11px] text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 cursor-pointer bg-slate-800/60 px-2 py-1 rounded border border-slate-700 transition-colors"
                          title="Kelola & edit/hapus preset"
                        >
                          ⚙️ Kelola
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const auto = getAutoCapaianAndCatatan(selectedStudentId);
                            setFormData(prev => ({ ...prev, capaian_kompetensi: auto.capaian }));
                            toast.success('Berhasil men-generate capaian kompetensi otomatis!');
                          }}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 cursor-pointer bg-slate-800/60 px-2 py-1 rounded border border-slate-700 transition-colors"
                        >
                          ⚡ Auto
                        </button>
                      </div>
                    )}
                  </div>
                  <textarea 
                    value={formData.capaian_kompetensi || ''} 
                    onChange={e => setFormData({...formData, capaian_kompetensi: e.target.value})}
                    disabled={role !== 'guru'}
                    placeholder={role === 'guru' ? "Masukkan deskripsi capaian kompetensi siswa..." : "Belum ada deskripsi capaian kompetensi."}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200 text-sm min-h-[100px] disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                </div>
                
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-2">
                    <label className="block text-sm font-medium text-slate-300">Catatan Wali Kelas</label>
                    {role === 'guru' && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <select
                          className="text-[11px] bg-slate-800 border border-slate-700 text-slate-300 rounded px-2 py-1 outline-none w-full sm:w-44 xl:w-56 truncate cursor-pointer focus:ring-1 focus:ring-indigo-500"
                          onChange={(e) => {
                            if (e.target.value === '__delete__') {
                              if (formData.catatan_wali_kelas) {
                                handleDeletePreset('catatan', formData.catatan_wali_kelas);
                              }
                              e.target.value = '';
                            } else if (e.target.value) {
                              setFormData(prev => ({ ...prev, catatan_wali_kelas: e.target.value }));
                              e.target.value = '';
                            }
                          }}
                        >
                          <option value="">Pilih Preset...</option>
                          {(settings?.catatan_wali_kelas_templates && settings.catatan_wali_kelas_templates.length > 0
                            ? settings.catatan_wali_kelas_templates
                            : defaultCatatanPresets
                          ).map((t: string, i: number) => (
                            <option key={i} value={t}>{i + 1}. {t.substring(0, 50)}...</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleSavePreset('catatan', formData.catatan_wali_kelas || '')}
                          className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 cursor-pointer bg-slate-800/60 px-2 py-1 rounded border border-slate-700 transition-colors"
                          title="Simpan teks saat ini sebagai preset baru"
                        >
                          + Preset
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPresetManagerType('catatan');
                            setEditingPresetIdx(null);
                            setEditingPresetText('');
                          }}
                          className="text-[11px] text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 cursor-pointer bg-slate-800/60 px-2 py-1 rounded border border-slate-700 transition-colors"
                          title="Kelola & edit/hapus preset"
                        >
                          ⚙️ Kelola
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const auto = getAutoCapaianAndCatatan(selectedStudentId);
                            setFormData(prev => ({ ...prev, catatan_wali_kelas: auto.catatan }));
                            toast.success('Berhasil men-generate catatan wali kelas otomatis!');
                          }}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 cursor-pointer bg-slate-800/60 px-2 py-1 rounded border border-slate-700 transition-colors"
                        >
                          ⚡ Auto
                        </button>
                      </div>
                    )}
                  </div>
                  <textarea 
                    value={formData.catatan_wali_kelas || ''} 
                    onChange={e => setFormData({...formData, catatan_wali_kelas: e.target.value})}
                    disabled={role !== 'guru'}
                    placeholder={role === 'guru' ? "Masukkan catatan / motivasi..." : "Belum ada catatan wali kelas."}
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200 text-sm min-h-[100px] disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Tambahan Data Rapor Sesuai Format Lampiran */}
            <div className="border-t border-slate-700/50 pt-6 space-y-6">
              <h4 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">Data Tambahan Rapor (Kokurikuler & Ekstrakurikuler)</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Kokurikuler */}
                {raporType !== 'bulanan' ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-300">Deskripsi Kokurikuler</label>
                    <textarea 
                      value={formData.kokurikuler || ''} 
                      onChange={e => setFormData({...formData, kokurikuler: e.target.value})}
                      disabled={role !== 'guru'}
                      placeholder="Contoh: Pada semester ini, ananda menunjukkan capaian yang cukup baik dalam penguatan profil lulusan, yang ditunjukkan melalui kegiatan kokurikuler..."
                      className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200 text-sm min-h-[100px] disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                    <p className="text-[10px] text-slate-500">Biarkan kosong untuk menggunakan teks bawaan otomatis sesuai format dinas.</p>
                  </div>
                ) : (
                  <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700/30 flex items-center justify-center text-center">
                    <p className="text-xs text-slate-500 italic">Kegiatan Kokurikuler tidak diperlukan untuk tipe Rapor Bulanan.</p>
                  </div>
                )}

                {/* Kenaikan Kelas */}
                {raporType === 'semester' && (semester.toLowerCase().includes('genap') || semester.toLowerCase().includes('2')) ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-300">Keterangan Kenaikan Kelas (Khusus Semester 2)</label>
                    <input 
                      type="text"
                      value={formData.kenaikan_kelas || ''} 
                      onChange={e => setFormData({...formData, kenaikan_kelas: e.target.value})}
                      disabled={role !== 'guru'}
                      placeholder="Contoh: Naik ke kelas III"
                      className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200 text-sm disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                    <p className="text-[10px] text-slate-500">Biarkan kosong untuk menghitung otomatis berdasarkan kelas siswa saat ini.</p>
                  </div>
                ) : (
                  <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700/30 flex items-center justify-center text-center">
                    <p className="text-xs text-slate-500 italic">Keterangan Kenaikan Kelas hanya ditampilkan pada Rapor Akhir Semester Genap (Semester 2).</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Ekstrakurikuler 1 */}
                <div className="bg-slate-900/30 p-4 rounded-xl border border-slate-700/30 space-y-3">
                  <p className="text-xs font-semibold text-slate-300">Ekstrakurikuler 1</p>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Nama Kegiatan</label>
                    <input 
                      type="text"
                      value={formData.ekstra_nama_1 || ''} 
                      onChange={e => setFormData({...formData, ekstra_nama_1: e.target.value})}
                      disabled={role !== 'guru'}
                      placeholder="Contoh: Pramuka"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200 text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Keterangan / Deskripsi Kegiatan</label>
                    <input 
                      type="text"
                      value={formData.ekstra_ket_1 || ''} 
                      onChange={e => setFormData({...formData, ekstra_ket_1: e.target.value})}
                      disabled={role !== 'guru'}
                      placeholder="Contoh: Aktif dan sangat disiplin mengikuti latihan rutin mingguan..."
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200 text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Ekstrakurikuler 2 */}
                <div className="bg-slate-900/30 p-4 rounded-xl border border-slate-700/30 space-y-3">
                  <p className="text-xs font-semibold text-slate-300">Ekstrakurikuler 2</p>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Nama Kegiatan</label>
                    <input 
                      type="text"
                      value={formData.ekstra_nama_2 || ''} 
                      onChange={e => setFormData({...formData, ekstra_nama_2: e.target.value})}
                      disabled={role !== 'guru'}
                      placeholder="Contoh: Seni Tari"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200 text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Keterangan / Deskripsi Kegiatan</label>
                    <input 
                      type="text"
                      value={formData.ekstra_ket_2 || ''} 
                      onChange={e => setFormData({...formData, ekstra_ket_2: e.target.value})}
                      disabled={role !== 'guru'}
                      placeholder="Contoh: Memiliki penguasaan gerakan tari dasar dengan kelenturan yang baik..."
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200 text-xs disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700/50 flex justify-end">
              {role === 'guru' ? (
                <button 
                  onClick={handleSaveCapaian}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-medium shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
                >
                  <Save size={18} />
                  Simpan Profil Capaian
                </button>
              ) : (
                <div className="text-xs text-amber-400 italic bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-xl">
                  ⚠️ Mode Lihat Saja: Kepala Sekolah tidak dapat menyimpan perubahan data rapor.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Preset Manager Modal */}
        {presetManagerType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-700/60 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-100">
                    Kelola Preset {presetManagerType === 'capaian' ? 'Capaian Kompetensi' : 'Catatan Wali Kelas'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Tambah, edit, atau hapus preset yang tersedia di menu pilihan.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPresetManagerType(null)}
                  className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-700/50 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-4 flex-1">
                {/* Add New Preset Textarea */}
                <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-700/40 space-y-3">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    {editingPresetIdx !== null ? 'Edit Preset Dipilih' : 'Tambah Preset Baru'}
                  </label>
                  <textarea
                    value={editingPresetText}
                    onChange={(e) => setEditingPresetText(e.target.value)}
                    placeholder={
                      presetManagerType === 'capaian'
                        ? "Contoh: Menunjukkan penguasaan kompetensi yang sangat baik dalam..."
                        : "Contoh: Sangat bangga dengan prestasimu! Pertahankan nilai..."
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none text-slate-200 text-xs min-h-[60px]"
                  />
                  <div className="flex justify-end gap-2">
                    {editingPresetIdx !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPresetIdx(null);
                          setEditingPresetText('');
                        }}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                      >
                        Batal
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (editingPresetIdx !== null) {
                          handleEditPreset(presetManagerType, editingPresetIdx, editingPresetText);
                        } else {
                          handleSavePreset(presetManagerType, editingPresetText);
                        }
                        setEditingPresetText('');
                      }}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-md shadow-indigo-600/10 cursor-pointer"
                    >
                      <Save size={12} />
                      {editingPresetIdx !== null ? 'Simpan Perubahan' : 'Simpan Preset'}
                    </button>
                  </div>
                </div>

                {/* Preset List */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Daftar Preset Tersimpan</p>
                  <div className="space-y-2.5">
                    {(presetManagerType === 'capaian'
                      ? (settings?.capaian_kompetensi_templates && settings.capaian_kompetensi_templates.length > 0
                          ? settings.capaian_kompetensi_templates
                          : defaultCapaianPresets)
                      : (settings?.catatan_wali_kelas_templates && settings.catatan_wali_kelas_templates.length > 0
                          ? settings.catatan_wali_kelas_templates
                          : defaultCatatanPresets)
                    ).map((preset: string, index: number) => (
                      <div key={index} className="flex gap-3 items-start p-3 bg-slate-900/20 hover:bg-slate-900/30 rounded-xl border border-slate-700/30 transition-all">
                        <div className="flex items-center justify-center bg-slate-800 text-indigo-400 border border-slate-700 rounded-lg w-5 h-5 text-xs font-bold mt-0.5 shrink-0">
                          {index + 1}
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed flex-1 pt-0.5">
                          {preset}
                        </p>
                        <div className="flex gap-1 shrink-0">
                          {deleteConfirmIdx === index ? (
                            <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded-lg animate-in fade-in duration-150">
                              <span className="text-[10px] font-semibold text-rose-400 uppercase tracking-wider">Yakin?</span>
                              <button
                                type="button"
                                onClick={() => {
                                  handleDeletePresetAtIndex(presetManagerType, index);
                                  setDeleteConfirmIdx(null);
                                }}
                                className="text-[10px] text-white bg-rose-600 hover:bg-rose-500 font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer"
                              >
                                Ya
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmIdx(null)}
                                className="text-[10px] text-slate-400 hover:text-slate-200 font-medium px-1 py-0.5 transition-all cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPresetIdx(index);
                                  setEditingPresetText(preset);
                                  setDeleteConfirmIdx(null);
                                }}
                                className="p-1 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded transition-all cursor-pointer"
                                title="Edit preset ini"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteConfirmIdx(index);
                                }}
                                className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-all cursor-pointer"
                                title="Hapus preset ini"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-900/30 border-t border-slate-700/60 flex justify-end">
                <button
                  type="button"
                  onClick={() => setPresetManagerType(null)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Selesai & Tutup
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
