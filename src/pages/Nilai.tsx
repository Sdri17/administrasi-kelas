import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { store, Student, Grade, Settings, pauseNotifications, resumeNotifications } from '../lib/store';
import { v4 as uuidv4 } from 'uuid';
import { Download, Plus, Save, Upload, Trash2 } from 'lucide-react';
import Pagination from '../components/Pagination';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import toast from 'react-hot-toast';

export default function Nilai({ semester, role, settings, setSettings }: { semester: string, role: 'guru' | 'kepsek', settings: Settings | null, setSettings?: (s: Settings | null) => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [activeTab, setActiveTab] = useState<'Harian' | 'Tugas' | 'Ujian' | 'Akhir' | 'Rekap'>('Harian');
  const [filterClass, setFilterClass] = useState('');
  const [filterMapels, setFilterMapels] = useState<string[]>(settings?.mata_pelajaran || []);
  const filterMapel = filterMapels[0] || '';
  const [newColumnMapel, setNewColumnMapel] = useState('');
  const [isMapelDropdownOpen, setIsMapelDropdownOpen] = useState(false);
  const [filterWaktu, setFilterWaktu] = useState<'Mingguan' | 'Bulanan' | 'Semester' | 'Tahunan' | 'Seluruh' | 'Kustom'>('Semester');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [localGrades, setLocalGrades] = useState<Record<string, string>>({});
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnDate, setNewColumnDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingColumnDate, setEditingColumnDate] = useState<{ colKey: string; tanggal: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [columnToDelete, setColumnToDelete] = useState<string | null>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterClass, filterMapels, activeTab, semester]);

  useEffect(() => {
    if (settings?.mata_pelajaran && settings.mata_pelajaran.length > 0) {
      if (filterMapels.length === 0) {
        setFilterMapels(settings.mata_pelajaran);
      }
    }
  }, [settings]);

  useEffect(() => {
    loadData();
  }, [semester, filterMapels, activeTab]);

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

    const gList: Grade[] = [];
    const localVals: Record<string, string> = {};
    const allGradeMapels = new Set<string>();

    await store.grades.iterate<Grade, void>((v) => {
      if (v.semester === semester) {
        if (v.mata_pelajaran) {
          allGradeMapels.add(v.mata_pelajaran);
        }
        const isMatch = filterMapels.includes(v.mata_pelajaran || '');
        if (isMatch) {
          gList.push(v);
          localVals[`${v.id_siswa}::${v.nama_kolom}::${v.jenis_nilai}::${v.mata_pelajaran}`] = v.nilai.toString();
        }
      }
    });

    // Self-healing: auto-merge any grade subject that is missing in settings.mata_pelajaran
    if (settings && allGradeMapels.size > 0) {
      const currentMapels = settings.mata_pelajaran || [];
      const missingMapels = Array.from(allGradeMapels).filter(m => !currentMapels.includes(m));
      if (missingMapels.length > 0) {
        const updatedMapels = [...currentMapels, ...missingMapels];
        const newSettings = { ...settings, mata_pelajaran: updatedMapels };
        await store.settings.setItem('app_settings', newSettings);
        if (setSettings) setSettings(newSettings);
        setFilterMapels(updatedMapels);
        window.dispatchEvent(new Event('data-changed'));
        return;
      }
    }

    setGrades(gList);
    setLocalGrades(localVals);
  };

  const getCityFromAlamat = (alamat?: string) => {
    if (!alamat || alamat.trim() === 'Alamat Sekolah Belum Diatur' || alamat.trim() === '') return 'Jakarta';
    const cleanAlamat = alamat.replace(/[\r\n]+/g, ' ').trim();
    const parts = cleanAlamat.split(',').map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      const pLower = part.toLowerCase();
      if (pLower.startsWith('kota ')) return part.substring(5).trim();
      if (pLower.startsWith('kabupaten ')) return part.substring(10).trim();
      if (pLower.startsWith('kab. ')) return part.substring(5).trim();
    }
    const filteredParts = parts.filter(p => !/^\d+$/.test(p));
    if (filteredParts.length > 0) {
      const provinces = [
        'aceh', 'sumatera', 'sumatra', 'riau', 'jambi', 'bengkulu', 'lampung', 'bangka', 'kepulauan',
        'jakarta', 'banten', 'jawa', 'yogyakarta', 'bali', 'nusa', 'kalimantan', 'sulawesi', 'gorontalo',
        'maluku', 'papua'
      ];
      const lastPart = filteredParts[filteredParts.length - 1];
      const lastLower = lastPart.toLowerCase();
      const hasProvince = provinces.some(prov => lastLower.includes(prov));
      if (hasProvince && filteredParts.length > 1) {
        return filteredParts[filteredParts.length - 2];
      }
      if (lastPart.length < 25) {
        return lastPart;
      }
      const secondLast = filteredParts[filteredParts.length - 2];
      if (secondLast && secondLast.length < 25) {
        return secondLast;
      }
    }
    const words = cleanAlamat.split(/\s+/);
    if (words.length > 0) {
      const lastWord = words[words.length - 1];
      if (!/^\d+$/.test(lastWord) && lastWord.length < 20) {
        return lastWord;
      }
    }
    return 'Jakarta';
  };

  const filteredStudents = students.filter(s => filterClass 
    ? s.kelas === filterClass 
    : (!s.kelas || s.kelas.toLowerCase() !== 'alumni'));
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const uniqueClasses = Array.from(new Set(students.map(s => s.kelas))).filter(Boolean);

  const columns = useMemo(() => {
    const uniqueCols: { nama_kolom: string; mata_pelajaran: string; label: string; key: string; tanggal?: string }[] = [];
    const seen = new Set<string>();

    grades.forEach(g => {
      if (g.jenis_nilai === activeTab) {
        const key = `${g.nama_kolom}::${g.mata_pelajaran}`;
        if (!seen.has(key)) {
          seen.add(key);
          const label = filterMapels.length <= 1 
            ? g.nama_kolom 
            : `${g.nama_kolom} (${g.mata_pelajaran})`;
          
          // Find the date associated with this column
          const firstWithDate = grades.find(x => x.nama_kolom === g.nama_kolom && x.mata_pelajaran === g.mata_pelajaran && x.jenis_nilai === activeTab && x.tanggal);
          const tanggal = firstWithDate?.tanggal || g.tanggal || new Date().toISOString().split('T')[0];

          uniqueCols.push({
            nama_kolom: g.nama_kolom,
            mata_pelajaran: g.mata_pelajaran || '',
            label,
            key,
            tanggal
          });
        }
      }
    });

    return uniqueCols.sort((a, b) => {
      const cmp = a.mata_pelajaran.localeCompare(b.mata_pelajaran);
      if (cmp !== 0) return cmp;
      return a.nama_kolom.localeCompare(b.nama_kolom);
    });
  }, [grades, activeTab, filterMapels]);

  const finalGrades = useMemo(() => {
    const studentGrades = filteredStudents.map(student => {
      let sGrades = grades.filter(g => g.id_siswa === student.id);
      
      let start: Date | null = null;
      let end: Date | null = null;
      const today = new Date();
      
      if (filterWaktu === 'Mingguan') {
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
        start = new Date(today.setDate(diff));
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
      } else if (filterWaktu === 'Bulanan') {
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
      } else if (filterWaktu === 'Tahunan') {
        start = new Date(today.getFullYear(), 0, 1);
        end = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999);
      } else if (filterWaktu === 'Kustom' && customStartDate && customEndDate) {
        start = new Date(customStartDate);
        end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
      }
      
      if (start && end) {
        const s = start;
        const e = end;
        sGrades = sGrades.filter(g => {
          if (!g.tanggal) return false;
          const d = new Date(g.tanggal);
          return d >= s && d <= e;
        });
      }

      const calcAvg = (type: string) => {
        const tg = sGrades.filter(g => g.jenis_nilai === type);
        if (tg.length === 0) return 0;
        return tg.reduce((acc, curr) => acc + curr.nilai, 0) / tg.length;
      };

      const avgHarian = calcAvg('Harian');
      const avgTugas = calcAvg('Tugas');
      const avgUjian = calcAvg('Ujian');

      const bh = (settings?.bobot_harian || 30) / 100;
      const bt = (settings?.bobot_tugas || 30) / 100;
      const bu = (settings?.bobot_ujian || 40) / 100;

      const final = (avgHarian * bh) + (avgTugas * bt) + (avgUjian * bu);

      let predikat = 'D';
      if (final >= 90) predikat = 'A';
      else if (final >= 80) predikat = 'B';
      else if (final >= 70) predikat = 'C';

      return {
        ...student,
        avgHarian,
        avgTugas,
        avgUjian,
        final,
        predikat
      };
    });
    return studentGrades;
  }, [grades, students, settings, filteredStudents, filterWaktu, customStartDate, customEndDate]);

  const addColumn = async () => {
    if (filterMapels.length === 0) {
      toast.error('Pilih mata pelajaran terlebih dahulu di filter', { duration: 3000 });
      return;
    }
    setNewColumnMapel(filterMapels[0]);
    setIsAddingColumn(true);
    setNewColumnName('');
    setNewColumnDate(new Date().toISOString().split('T')[0]);
  };

  const handleConfirmAddColumn = async () => {
    if (newColumnName && !columns.some(c => c.nama_kolom === newColumnName && c.mata_pelajaran === newColumnMapel)) {
      setIsSaving(true);
      pauseNotifications();
      try {
        for (const s of students) {
          const grade: Grade = {
            id: uuidv4(),
            id_siswa: s.id,
            jenis_nilai: activeTab as any,
            nama_kolom: newColumnName,
            nilai: 0,
            semester,
            mata_pelajaran: newColumnMapel,
            tanggal: newColumnDate
          };
          await store.grades.setItem(grade.id, grade);
        }
        toast.success(`Kolom ${newColumnName} (${newColumnMapel}) ditambahkan`, { duration: 3000 });
        setIsAddingColumn(false);
        loadData();
      } catch (err) {
        console.error(err);
        toast.error('Gagal menambahkan kolom');
      } finally {
        setIsSaving(false);
        resumeNotifications(true);
      }
    } else {
      toast.error('Kolom dengan nama dan mata pelajaran tersebut sudah ada!');
    }
  };

  const handleUpdateColumnDate = async () => {
    if (!editingColumnDate) return;
    setIsSaving(true);
    pauseNotifications();
    try {
      const [colName, mapel] = editingColumnDate.colKey.split('::');
      const gradesToUpdate = grades.filter(g => 
        g.nama_kolom === colName && 
        g.mata_pelajaran === mapel && 
        g.jenis_nilai === activeTab
      );
      for (const g of gradesToUpdate) {
        g.tanggal = editingColumnDate.tanggal;
        await store.grades.setItem(g.id, g);
      }
      toast.success(`Tanggal kolom ${colName} berhasil diperbarui`);
      setEditingColumnDate(null);
      loadData();
    } catch (e) {
      console.error(e);
      toast.error('Gagal memperbarui tanggal kolom');
    } finally {
      setIsSaving(false);
      resumeNotifications(true);
    }
  };

  const handleLocalChange = (studentId: string, colName: string, subject: string, value: string) => {
    setLocalGrades(prev => ({
      ...prev,
      [`${studentId}::${colName}::${activeTab}::${subject}`]: value
    }));
  };

  const saveAllGrades = async () => {
    setIsSaving(true);
    pauseNotifications();
    try {
      let changed = false;
      for (const [key, value] of Object.entries(localGrades)) {
        const parts = key.split('::');
        if (parts.length < 4) continue;
        const studentId = parts[0];
        const colName = parts[1];
        const tab = parts[2];
        const subject = parts[3];
        
        if (tab !== activeTab) continue;
        
        const studentObj = students.find(s => s.id === studentId);
        if (studentObj && studentObj.kelas === 'Alumni') continue;
        
        let numValue = parseFloat(value as string);
        if (isNaN(numValue)) numValue = 0;
        if (numValue > 100) numValue = 100;
        if (numValue < 0) numValue = 0;

        const existing = grades.find(g => 
          g.id_siswa === studentId && 
          g.nama_kolom === colName && 
          g.jenis_nilai === tab &&
          g.mata_pelajaran === subject
        );
        
        if (existing) {
          if (existing.nilai !== numValue) {
            existing.nilai = numValue;
            await store.grades.setItem(existing.id, existing);
            changed = true;
          }
        } else {
          const newGrade: Grade = {
            id: uuidv4(),
            id_siswa: studentId,
            jenis_nilai: tab as any,
            nama_kolom: colName,
            nilai: numValue,
            semester,
            mata_pelajaran: subject,
            tanggal: new Date().toISOString().split('T')[0]
          };
          await store.grades.setItem(newGrade.id, newGrade);
          changed = true;
        }
      }
      
      if (changed) {
        toast.success('Semua nilai berhasil disimpan', { duration: 2000 });
        loadData();
      } else {
        toast.success('Tidak ada perubahan nilai', { duration: 2000 });
      }
    } catch (err) {
      console.error(err);
      toast.error('Gagal menyimpan nilai');
    } finally {
      setIsSaving(false);
      resumeNotifications(true);
    }
  };

  const handleDeleteColumn = (colKey: string) => {
    setColumnToDelete(colKey);
  };

  const handleConfirmDeleteColumn = async () => {
    if (!columnToDelete) return;
    const [colName, mapel] = columnToDelete.split('::');
    const gradesToDelete = grades.filter(g => 
      g.nama_kolom === colName && 
      g.mata_pelajaran === mapel && 
      g.jenis_nilai === activeTab
    );
    for (const g of gradesToDelete) {
      await store.grades.removeItem(g.id);
    }
    toast.success(`Kolom ${colName} (${mapel}) berhasil dihapus`);
    setColumnToDelete(null);
    loadData();
  };

  const getSubjectCols = (subject: string, type: string) => {
    const cols = new Set<string>();
    grades.forEach(g => {
      if (g.mata_pelajaran === subject && g.jenis_nilai === type) {
        cols.add(g.nama_kolom);
      }
    });
    return Array.from(cols).sort();
  };

  const getCols = (type: string) => {
    const cols = new Set<string>();
    grades.forEach(g => {
      if (g.jenis_nilai === type) cols.add(g.nama_kolom);
    });
    return Array.from(cols).sort();
  };

  const getGradeVal = (studentId: string, colName: string, type: string, subject?: string) => {
    const g = grades.find(g => 
      g.id_siswa === studentId && 
      g.nama_kolom === colName && 
      g.jenis_nilai === type &&
      (!subject || g.mata_pelajaran === subject)
    );
    return g ? g.nilai : '';
  };

  const exportExcel = () => {
    const harianCols = getCols('Harian');
    const tugasCols = getCols('Tugas');
    const ujianCols = getCols('Ujian');

    const data = finalGrades.map((s, idx) => {
      const row: any = {
        'No': idx + 1,
        'Nama Siswa': s.nama,
        'NISN': s.nisn || '-',
        'NIPD': s.nipd || '-',
        'Mapel': filterMapel || 'Semua Mapel'
      };
      
      harianCols.forEach(col => {
        row[`Harian_${col}`] = getGradeVal(s.id, col, 'Harian');
      });
      tugasCols.forEach(col => {
        row[`Tugas_${col}`] = getGradeVal(s.id, col, 'Tugas');
      });
      ujianCols.forEach(col => {
        row[`Ujian_${col}`] = getGradeVal(s.id, col, 'Ujian');
      });
      
      row['Nilai Akhir'] = s.final.toFixed(2);
      row['Predikat'] = s.predikat;
      
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Nilai");
    XLSX.writeFile(wb, `Rekap_Nilai_${semester}_${filterClass || 'Semua'}_${filterMapel || 'Semua'}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
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

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    
    let titleStr = `REKAP NILAI SISWA - SEMESTER ${semester.toUpperCase()}`;
    if (activeTab === 'Akhir') {
      titleStr = `LAPORAN NILAI AKHIR - SEMESTER ${semester.toUpperCase()}`;
    }
    doc.text(titleStr, 14, 39);
    
    doc.setFontSize(8.5);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    
    const mapelText = (activeTab === 'Rekap' || activeTab === 'Akhir') 
      ? `Mapel: ${filterMapels.join(', ')}` 
      : `Mapel: ${filterMapel}`;
    doc.text(`Kelas: ${filterClass || 'Semua Kelas'} | ${mapelText} | Periode: ${filterWaktu}`, 14, 44);

    const harianCols = getCols('Harian');
    const tugasCols = getCols('Tugas');
    const ujianCols = getCols('Ujian');

    let head: string[][] = [];
    let body: any[][] = [];

    if (activeTab === 'Akhir') {
      head = [['No', 'Nama Siswa', 'NISN', `Harian (${settings?.bobot_harian}%)`, `Tugas (${settings?.bobot_tugas}%)`, `Ujian (${settings?.bobot_ujian}%)`, 'Nilai Akhir', 'Predikat']];
      body = finalGrades.map((s, idx) => [
        idx + 1,
        s.nama,
        s.nisn || '-',
        s.avgHarian.toFixed(1),
        s.avgTugas.toFixed(1),
        s.avgUjian.toFixed(1),
        s.final.toFixed(1),
        s.predikat
      ]);
    } else if (activeTab === 'Rekap') {
      head = [['No', 'Nama Siswa', 'NISN', ...harianCols.map(c => `${c} (H)`), ...tugasCols.map(c => `${c} (T)`), ...ujianCols.map(c => `${c} (U)`), 'Nilai Akhir', 'Predikat']];
      body = finalGrades.map((s, idx) => {
        const row: any[] = [
          idx + 1,
          s.nama,
          s.nisn || '-'
        ];
        harianCols.forEach(col => row.push(getGradeVal(s.id, col, 'Harian')));
        tugasCols.forEach(col => row.push(getGradeVal(s.id, col, 'Tugas')));
        ujianCols.forEach(col => row.push(getGradeVal(s.id, col, 'Ujian')));
        row.push(s.final.toFixed(1));
        row.push(s.predikat);
        return row;
      });
    } else {
      head = [['No', 'Nama Siswa', 'NISN', ...columns, 'Rata-rata']];
      body = filteredStudents.map((student, idx) => {
        const row: any[] = [
          idx + 1,
          student.nama,
          student.nisn || '-'
        ];
        let sum = 0, count = 0;
        columns.forEach(col => {
          const valStr = localGrades[`${student.id}::${col}::${activeTab}`] || '';
          const val = parseFloat(valStr);
          row.push(valStr !== '' ? valStr : '-');
          if (!isNaN(val)) {
            sum += val;
            count++;
          }
        });
        const avg = count > 0 ? (sum / count).toFixed(1) : '-';
        row.push(avg);
        return row;
      });
    }

    autoTable(doc, {
      head: head,
      body: body,
      startY: 48,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, textColor: [30, 41, 59] },
      margin: { top: 48 }
    });
    
    const finalY = (doc as any).lastAutoTable.finalY || 48;
    const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    
    let sigY = finalY + 15;
    if (sigY + 40 > pageHeight) {
      doc.addPage();
      sigY = 20;
    }

    doc.setFontSize(9);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(30, 41, 59);

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

    doc.text('Mengetahui,', 14, sigY);
    doc.text('Kepala Sekolah', 14, sigY + 5);
    doc.setFont('Helvetica', 'bold');
    doc.text(settings?.nama_kepala_sekolah || '.........................', 14, sigY + 30);
    doc.setFont('Helvetica', 'normal');
    doc.text(`NIP. ${settings?.nip_kepala_sekolah || '.........................'}`, 14, sigY + 35);

    doc.text(`${city}, ${today}`, pageWidth - 70, sigY);
    doc.text('Guru Kelas', pageWidth - 70, sigY + 5);
    doc.setFont('Helvetica', 'bold');
    doc.text(settings?.nama_wali_kelas || '.........................', pageWidth - 70, sigY + 30);
    doc.setFont('Helvetica', 'normal');
    doc.text(`NIP. ${settings?.nip_wali_kelas || '.........................'}`, pageWidth - 70, sigY + 35);

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

    doc.save(`Rekap_Nilai_${semester}_${filterClass || 'Semua'}_${activeTab}.pdf`);
  };

  const downloadTemplate = () => {
    const subjectsToInclude = filterMapels.length > 0 
      ? filterMapels 
      : (settings?.mata_pelajaran || []);

    if (subjectsToInclude.length === 0) {
      toast.error('Belum ada mata pelajaran yang dipilih atau tersedia.');
      return;
    }

    const wb = XLSX.utils.book_new();

    subjectsToInclude.forEach(subject => {
      let harianCols = getSubjectCols(subject, 'Harian');
      let tugasCols = getSubjectCols(subject, 'Tugas');
      let ujianCols = getSubjectCols(subject, 'Ujian');

      if (harianCols.length === 0) harianCols = ['UH 1', 'UH 2'];
      if (tugasCols.length === 0) tugasCols = ['Tugas 1', 'Tugas 2'];
      if (ujianCols.length === 0) ujianCols = ['UTS', 'UAS'];

      const sheetData = filteredStudents.map((student, idx) => {
        const row: any = {
          'No': idx + 1,
          'NISN': student.nisn || '-',
          'Nama Siswa': student.nama
        };

        harianCols.forEach(col => {
          row[`Harian_${col}`] = getGradeVal(student.id, col, 'Harian', subject) || '';
        });
        tugasCols.forEach(col => {
          row[`Tugas_${col}`] = getGradeVal(student.id, col, 'Tugas', subject) || '';
        });
        ujianCols.forEach(col => {
          row[`Ujian_${col}`] = getGradeVal(student.id, col, 'Ujian', subject) || '';
        });

        return row;
      });

      const ws = XLSX.utils.json_to_sheet(sheetData);
      const cleanSheetName = subject.substring(0, 30).replace(/[\\*?:/\[\]]/g, '');
      XLSX.utils.book_append_sheet(wb, ws, cleanSheetName);
    });

    XLSX.writeFile(wb, `Template_Nilai_${semester}_${filterClass || 'Semua'}.xlsx`);
    toast.success('Template nilai berhasil diunduh!');
  };

  const importGradesExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        
        setIsSaving(true);
        pauseNotifications();

        let importedCount = 0;

        for (const sheetName of wb.SheetNames) {
          const subject = settings?.mata_pelajaran?.find(m => 
            m.substring(0, 30).replace(/[\\*?:/\[\]]/g, '') === sheetName
          ) || sheetName;

          const ws = wb.Sheets[sheetName];
          const data: any[] = XLSX.utils.sheet_to_json(ws);

          for (const row of data) {
            const studentName = row['Nama Siswa'];
            const studentNisn = row['NISN'];

            const student = students.find(s => 
              s.nama === studentName || (studentNisn && s.nisn === studentNisn)
            );

            if (!student) continue;

            for (const [key, val] of Object.entries(row)) {
              let type: 'Harian' | 'Tugas' | 'Ujian' | null = null;
              let colName = '';

              if (key.startsWith('Harian_')) {
                type = 'Harian';
                colName = key.substring(7);
              } else if (key.startsWith('Tugas_')) {
                type = 'Tugas';
                colName = key.substring(6);
              } else if (key.startsWith('Ujian_')) {
                type = 'Ujian';
                colName = key.substring(6);
              }

              if (type && colName) {
                let numValue = parseFloat(val as string);
                if (isNaN(numValue)) continue;
                if (numValue > 100) numValue = 100;
                if (numValue < 0) numValue = 0;

                const existing = grades.find(g => 
                  g.id_siswa === student.id && 
                  g.nama_kolom === colName && 
                  g.jenis_nilai === type &&
                  g.mata_pelajaran === subject &&
                  g.semester === semester
                );

                if (existing) {
                  existing.nilai = numValue;
                  await store.grades.setItem(existing.id, existing);
                } else {
                  const newGrade: Grade = {
                    id: uuidv4(),
                    id_siswa: student.id,
                    jenis_nilai: type,
                    nama_kolom: colName,
                    nilai: numValue,
                    semester,
                    mata_pelajaran: subject,
                    tanggal: new Date().toISOString().split('T')[0]
                  };
                  await store.grades.setItem(newGrade.id, newGrade);
                }
                importedCount++;
              }
            }
          }
        }

        toast.success(`Berhasil mengimpor ${importedCount} data nilai dari template!`);
        loadData();
      } catch (err: any) {
        console.error(err);
        toast.error('Gagal membaca file template: ' + err.message);
      } finally {
        setIsSaving(false);
        resumeNotifications(true);
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="flex flex-col h-full text-slate-200">
      {role === 'kepsek' && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-300 px-4 py-3 text-xs flex items-center gap-2 animate-fade-in">
          <span>⚠️</span>
          <span>Anda sedang masuk sebagai <strong>Kepala Sekolah</strong> (Mode Baca Saja). Anda dapat meninjau, mengekspor, dan mencetak seluruh data nilai, tetapi tidak dapat memodifikasi nilai atau struktur kolom.</span>
        </div>
      )}
      <div className="p-4 border-b border-slate-700/50 flex flex-wrap justify-between items-center bg-slate-900/40 gap-4">
        <div className="flex bg-slate-800 rounded-xl border border-slate-700 p-1">
          {(['Harian', 'Tugas', 'Ujian', 'Akhir', 'Rekap'] as const).map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab as any)}
              className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === tab ? 'bg-indigo-500/20 text-indigo-300 shadow-[inset_0_1px_0_0_rgba(99,102,241,0.2)]' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
            >
              {tab === 'Rekap' ? 'Rekap Nilai' : tab === 'Akhir' ? 'Nilai Akhir' : `Nilai ${tab}`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {(activeTab === 'Rekap' || activeTab === 'Akhir') && (
            <div className="flex items-center gap-2">
              <select 
                value={filterWaktu}
                onChange={e => setFilterWaktu(e.target.value as any)}
                className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all cursor-pointer"
              >
                <option value="Mingguan">Minggu Ini</option>
                <option value="Bulanan">Bulan Ini</option>
                <option value="Semester">Satu Semester</option>
                <option value="Tahunan">Tahun Ini</option>
                <option value="Seluruh">Seluruh Waktu</option>
                <option value="Kustom">Kustom Rentang Waktu</option>
              </select>
              {filterWaktu === 'Kustom' && (
                <div className="flex items-center gap-2">
                  <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 [color-scheme:dark] transition-all" />
                  <span className="text-slate-500">-</span>
                  <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 [color-scheme:dark] transition-all" />
                </div>
              )}
            </div>
          )}

          <div className="relative">
            <button 
              onClick={() => setIsMapelDropdownOpen(!isMapelDropdownOpen)}
              className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all cursor-pointer flex items-center gap-2"
            >
              <span>Mata Pelajaran ({filterMapels.length})</span>
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${isMapelDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {isMapelDropdownOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setIsMapelDropdownOpen(false)}></div>
                <div className="absolute right-0 mt-2 w-64 bg-slate-800/95 border border-slate-700 rounded-2xl p-4 shadow-2xl backdrop-blur-xl z-30 max-h-64 overflow-y-auto custom-scrollbar space-y-2">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-700">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pilih Mapel</span>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setFilterMapels(settings?.mata_pelajaran || [])}
                        className="text-[10px] text-indigo-400 font-bold hover:underline"
                      >
                        Semua
                      </button>
                      <span className="text-slate-600">|</span>
                      <button 
                        onClick={() => setFilterMapels([])}
                        className="text-[10px] text-rose-400 font-bold hover:underline"
                      >
                        Kosongkan
                      </button>
                    </div>
                  </div>
                  {settings?.mata_pelajaran?.map(m => {
                    const isChecked = filterMapels.includes(m);
                    return (
                      <label key={m} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-700/50 cursor-pointer text-sm text-slate-200 transition-colors">
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setFilterMapels(filterMapels.filter(x => x !== m));
                            } else {
                              setFilterMapels([...filterMapels, m]);
                            }
                          }}
                          className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0"
                        />
                        <span>{m}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <select 
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all cursor-pointer"
          >
            <option value="">Semua Kelas</option>
            {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex gap-3 flex-wrap">
          {activeTab !== 'Rekap' && activeTab !== 'Akhir' && role === 'guru' && (
            <>
              <button onClick={saveAllGrades} disabled={isSaving} className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm shadow-lg shadow-emerald-500/20 font-medium transition-colors">
                <Save size={16} /> {isSaving ? 'Menyimpan...' : 'Simpan'}
              </button>
              <button onClick={addColumn} className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm shadow-lg shadow-indigo-500/20 font-medium transition-colors">
                <Plus size={16} /> Kolom Baru
              </button>
            </>
          )}
          {role === 'guru' && (
            <>
              <button 
                onClick={downloadTemplate}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm shadow-lg shadow-indigo-500/20 font-medium transition-colors"
                title="Unduh Template Excel"
              >
                <Download size={16} /> Template
              </button>
              <label 
                className="bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm shadow-lg shadow-sky-500/20 font-medium transition-colors cursor-pointer"
                title="Unggah / Impor Nilai dari Excel"
              >
                <Upload size={16} /> Impor
                <input 
                  type="file" 
                  accept=".xlsx, .xls" 
                  onChange={importGradesExcel} 
                  className="hidden" 
                />
              </label>
            </>
          )}
          <button onClick={exportExcel} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm shadow-lg shadow-emerald-500/20 font-medium transition-colors">
            <Download size={16} /> Excel
          </button>
          <button onClick={exportPDF} className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 text-sm shadow-lg shadow-rose-500/20 font-medium transition-colors">
            <Download size={16} /> PDF
          </button>
        </div>
      </div>

      <div className="overflow-auto flex-1 custom-scrollbar">
        <table className="w-full text-sm text-left border-collapse border border-slate-700/60">
          <thead className="text-xs uppercase bg-slate-800/80 sticky top-0 z-10 backdrop-blur-sm text-slate-400">
            <tr>
              <th className="px-6 py-4 border border-slate-700/60 w-16 font-medium">No</th>
              <th className="px-6 py-4 border border-slate-700/60 sticky left-0 bg-slate-800/90 backdrop-blur-md shadow-[1px_0_0_0_rgba(51,65,85,0.5)] font-medium z-20">Nama Siswa</th>
              
              {activeTab === 'Akhir' ? (
                <>
                  <th className="px-6 py-4 border border-slate-700/60 text-center font-medium">Rata Harian ({settings?.bobot_harian}%)</th>
                  <th className="px-6 py-4 border border-slate-700/60 text-center font-medium">Rata Tugas ({settings?.bobot_tugas}%)</th>
                  <th className="px-6 py-4 border border-slate-700/60 text-center font-medium">Rata Ujian ({settings?.bobot_ujian}%)</th>
                  <th className="px-6 py-4 border border-slate-700/60 text-center font-bold text-indigo-400">NILAI AKHIR</th>
                  <th className="px-6 py-4 border border-slate-700/60 text-center font-bold text-indigo-400">PREDIKAT</th>
                </>
              ) : activeTab === 'Rekap' ? (
                <>
                  {getCols('Harian').map(col => <th key={`h_${col}`} className="px-6 py-4 border border-slate-700/60 text-center font-medium">{col} (H)</th>)}
                  {getCols('Tugas').map(col => <th key={`t_${col}`} className="px-6 py-4 border border-slate-700/60 text-center font-medium">{col} (T)</th>)}
                  {getCols('Ujian').map(col => <th key={`u_${col}`} className="px-6 py-4 border border-slate-700/60 text-center font-medium">{col} (U)</th>)}
                  <th className="px-6 py-4 border border-slate-700/60 text-center font-bold text-indigo-400">NILAI AKHIR</th>
                  <th className="px-6 py-4 border border-slate-700/60 text-center font-bold text-indigo-400">PREDIKAT</th>
                </>
              ) : (
                columns.map(col => (
                  <th key={col.key} className="px-6 py-4 border border-slate-700/60 text-center min-w-[140px] font-medium group relative">
                    <div className="font-semibold text-slate-200">{col.label}</div>
                    <button 
                      onClick={() => {
                        if (role === 'guru') {
                          setEditingColumnDate({ colKey: col.key, tanggal: col.tanggal || '' });
                        }
                      }}
                      className={`text-[10px] mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-700/60 transition-colors font-mono cursor-pointer ${
                        role === 'guru' 
                          ? 'bg-slate-950/60 hover:bg-slate-900 text-indigo-400 hover:text-indigo-300 border-indigo-500/20' 
                          : 'bg-slate-900/30 text-slate-500 border-slate-800'
                      }`}
                      title={role === 'guru' ? "Klik untuk ubah tanggal input nilai" : "Tanggal input nilai"}
                    >
                      📅 {col.tanggal ? col.tanggal.split('-').reverse().join('/') : '-'}
                    </button>
                    {role === 'guru' && (
                      <button 
                        onClick={() => handleDeleteColumn(col.key)}
                        className="absolute right-1.5 top-1.5 p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded opacity-0 group-hover:opacity-100 transition-all"
                        title="Hapus Kolom"
                      >
                        <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {paginatedStudents.length === 0 ? (
              <tr><td colSpan={10} className="px-6 py-12 border border-slate-700/60 text-center text-slate-500">Belum ada data siswa.</td></tr>
            ) : (
              paginatedStudents.map((student, index) => (
                <tr key={student.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-6 py-4 border border-slate-700/60 text-slate-400">{(currentPage - 1) * pageSize + index + 1}</td>
                  <td className="px-6 py-4 border border-slate-700/60 font-medium text-slate-200 sticky left-0 bg-slate-800/40 backdrop-blur-md shadow-[1px_0_0_0_rgba(51,65,85,0.5)] z-10 group-hover:bg-slate-700/50">
                    {student.nama}
                  </td>
                  
                  {activeTab === 'Akhir' ? (
                    <>
                      {(() => {
                        const fg = finalGrades.find(f => f.id === student.id);
                        if (!fg) return null;
                        const isRemedial = fg.final < 75;
                        return (
                          <>
                            <td className="px-6 py-4 border border-slate-700/60 text-center text-slate-300 font-mono">{fg.avgHarian.toFixed(1)}</td>
                            <td className="px-6 py-4 border border-slate-700/60 text-center text-slate-300 font-mono">{fg.avgTugas.toFixed(1)}</td>
                            <td className="px-6 py-4 border border-slate-700/60 text-center text-slate-300 font-mono">{fg.avgUjian.toFixed(1)}</td>
                            <td className={`px-6 py-4 border border-slate-700/60 text-center font-bold font-mono ${isRemedial ? 'text-rose-400 bg-rose-500/10' : 'text-emerald-400 bg-emerald-500/10'}`}>
                              {fg.final.toFixed(1)}
                            </td>
                            <td className="px-6 py-4 border border-slate-700/60 text-center">
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${isRemedial ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                                {fg.predikat}
                              </span>
                            </td>
                          </>
                        )
                      })()}
                    </>
                  ) : activeTab === 'Rekap' ? (
                    <>
                      {(() => {
                        const fg = finalGrades.find(f => f.id === student.id);
                        if (!fg) return null;
                        const isRemedial = fg.final < 75;
                        return (
                          <>
                            {getCols('Harian').map(col => <td className="px-6 py-4 border border-slate-700/60 text-center text-slate-300 font-mono" key={`h_${col}`}>{getGradeVal(student.id, col, 'Harian')}</td>)}
                            {getCols('Tugas').map(col => <td className="px-6 py-4 border border-slate-700/60 text-center text-slate-300 font-mono" key={`t_${col}`}>{getGradeVal(student.id, col, 'Tugas')}</td>)}
                            {getCols('Ujian').map(col => <td className="px-6 py-4 border border-slate-700/60 text-center text-slate-300 font-mono" key={`u_${col}`}>{getGradeVal(student.id, col, 'Ujian')}</td>)}
                            <td className={`px-6 py-4 border border-slate-700/60 text-center font-bold font-mono ${isRemedial ? 'text-rose-400 bg-rose-500/10' : 'text-emerald-400 bg-emerald-500/10'}`}>
                              {fg.final.toFixed(1)}
                            </td>
                            <td className="px-6 py-4 border border-slate-700/60 text-center">
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${isRemedial ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                                {fg.predikat}
                              </span>
                            </td>
                          </>
                        )
                      })()}
                    </>
                  ) : (
                    columns.length === 0 ? (
                      <td colSpan={10} className="px-6 py-4 border border-slate-700/60 text-center text-slate-500 italic">Belum ada kolom nilai. Silakan klik "Kolom Baru".</td>
                    ) : (
                      columns.map(col => {
                        const key = `${student.id}::${col.nama_kolom}::${activeTab}::${col.mata_pelajaran}`;
                        const val = localGrades[key] !== undefined ? localGrades[key] : '';
                        return (
                          <td key={col.key} className="px-4 py-2 border border-slate-700/60">
                            <input 
                              type="number" 
                              min="0"
                              max="100"
                              disabled={role === 'kepsek' || student.kelas === 'Alumni'}
                              className="w-full text-center px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              value={val}
                              onChange={(e) => {
                                if (student.kelas === 'Alumni') return;
                                let v = parseFloat(e.target.value);
                                if (v > 100) v = 100;
                                if (v < 0) v = 0;
                                handleLocalChange(student.id, col.nama_kolom, col.mata_pelajaran, isNaN(v) ? '' : v.toString());
                              }}
                            />
                          </td>
                        )
                      })
                    )
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        totalItems={filteredStudents.length}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        itemName="siswa"
      />

      {/* Modal Add Column */}
      {isAddingColumn && createPortal(
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-medium text-slate-200 mb-4">Tambah Kolom Baru</h3>
            
            {filterMapels.length > 1 && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Mata Pelajaran</label>
                <select 
                  value={newColumnMapel}
                  onChange={e => setNewColumnMapel(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  {filterMapels.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}

            <p className="text-sm text-slate-400 mb-2">Masukkan nama kolom untuk nilai {activeTab}:</p>
            <input 
              type="text"
              autoFocus
              value={newColumnName}
              onChange={e => setNewColumnName(e.target.value)}
              placeholder="Contoh: UH 1, Tugas 2"
              className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all mb-4"
            />

            <p className="text-sm text-slate-400 mb-2">Tanggal Input Nilai:</p>
            <input 
              type="date"
              value={newColumnDate}
              onChange={e => setNewColumnDate(e.target.value)}
              className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all mb-6 [color-scheme:dark]"
            />

            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setIsAddingColumn(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Batal
              </button>
              <button 
                onClick={handleConfirmAddColumn}
                disabled={!newColumnName}
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-indigo-500/20 transition-colors disabled:opacity-50"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Edit Column Date */}
      {editingColumnDate && createPortal(
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-medium text-slate-200 mb-2">Ubah Tanggal Input</h3>
            {(() => {
              const [colName, mapel] = editingColumnDate.colKey.split('::');
              return (
                <p className="text-xs text-slate-400 mb-4">
                  Kolom: <span className="font-semibold text-slate-200">{colName} ({mapel})</span>
                </p>
              );
            })()}
            
            <p className="text-sm text-slate-300 mb-2 font-medium">Pilih Tanggal Baru:</p>
            <input 
              type="date"
              value={editingColumnDate.tanggal}
              onChange={e => setEditingColumnDate({ ...editingColumnDate, tanggal: e.target.value })}
              className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-slate-200 text-sm transition-all mb-6 [color-scheme:dark]"
            />

            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setEditingColumnDate(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Batal
              </button>
              <button 
                onClick={handleUpdateColumnDate}
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-indigo-500/20 transition-colors"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Confirm Delete Column */}
      {columnToDelete && createPortal(
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-medium text-slate-200 mb-4">Hapus Kolom Nilai</h3>
            {(() => {
              const [colName, mapel] = (columnToDelete || '').split('::');
              return (
                <p className="text-sm text-slate-300 mb-4">
                  Apakah Anda yakin ingin menghapus kolom <span className="font-bold text-rose-400">{colName} ({mapel})</span>? 
                  Semua nilai dalam kolom ini akan hilang secara permanen.
                </p>
              );
            })()}
            <div className="flex gap-3 justify-end">
              <button 
                onClick={() => setColumnToDelete(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Batal
              </button>
              <button 
                onClick={handleConfirmDeleteColumn}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-rose-500/20 transition-colors"
              >
                Hapus Kolom
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
