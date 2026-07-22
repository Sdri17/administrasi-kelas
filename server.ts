import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse incoming request body
  // Set limit to 50mb to safely handle full database backup pushes (students, grades, attendance, etc.)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // API Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Secure Server-Side Proxy for Google Sheets / Google Apps Script sync
  app.post("/api/proxy-sync", async (req, res) => {
    try {
      const { appsScriptUrl, payload } = req.body;

      if (!appsScriptUrl) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'URL Google Apps Script kosong atau tidak valid.' 
        });
      }

      const cleanUrl = String(appsScriptUrl).trim();

      // Basic URL scheme validation
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        return res.status(400).json({
          status: 'error',
          message: 'URL Google Apps Script harus diawali dengan http:// atau https://'
        });
      }

      // Proactive interceptors for common user mistakes
      if (cleanUrl.includes('docs.google.com/spreadsheets')) {
        return res.status(400).json({
          status: 'error',
          message: 'Tampaknya Anda memasukkan URL Google Spreadsheet, bukan URL Web App Google Apps Script. Silakan buka menu "Panduan" di aplikasi ini untuk petunjuk lengkap tentang cara membuat Apps Script dan mendapatkan URL Web App (/exec) yang benar.'
        });
      }

      if (cleanUrl.includes('drive.google.com')) {
        return res.status(400).json({
          status: 'error',
          message: 'Tampaknya Anda memasukkan URL Google Drive, bukan URL Web App Google Apps Script. Silakan ikuti menu "Panduan" untuk men-deploy Apps Script sebagai Aplikasi Web dan menyalin URL hasil deployment yang berakhiran "/exec".'
        });
      }

      if (cleanUrl.includes('script.google.com') && !cleanUrl.includes('/exec')) {
        return res.status(400).json({
          status: 'error',
          message: 'URL yang dimasukkan adalah URL Editor Script atau draf, bukan URL Web App yang aktif. Silakan lakukan deployment ulang di editor Apps Script Anda: Terapkan > Deployment Baru > Aplikasi Web, setel akses ke "Siapa saja" (Anyone), klik Terapkan, lalu salin URL yang diakhiri dengan "/exec".'
        });
      }

      console.log(`[Proxy] Melakukan proxy sinkronisasi ke: ${cleanUrl}`);

      // Forward request to Google Apps Script using server-side fetch
      let response: Response;
      try {
        response = await fetch(cleanUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify(payload)
        });
      } catch (fetchErr: any) {
        console.error('[Proxy Fetch Error]', fetchErr);
        return res.status(400).json({
          status: 'error',
          message: `Gagal mengirim permintaan ke Apps Script: URL tidak valid, tidak dapat dijangkau, atau diblokir. Pastikan koneksi internet stabil dan URL sudah benar. Detail: ${fetchErr.message}`
        });
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(`[Proxy] Google Apps Script mengembalikan HTTP status ${response.status}:`, errorText);
        
        let customMessage = `Gagal terhubung ke Google Apps Script (HTTP Status: ${response.status}).`;
        
        if (response.status === 401 || response.status === 403) {
          customMessage = 'Koneksi Ditolak (HTTP 401/403). Pastikan Apps Script Anda sudah di-deploy sebagai Aplikasi Web (Web App), setelan "Who has access" adalah "Anyone" (Siapa saja), dan dijalankan sebagai "Me" (Saya / pemilik spreadsheet).';
        } else if (response.status === 404) {
          customMessage = 'URL Google Apps Script tidak ditemukan (HTTP 404). Pastikan URL yang disalin sudah benar dan lengkap.';
        }

        // Additional heuristic check if the response HTML content is Google Drive Access Denied
        if (errorText.includes('drive-logo') || errorText.includes('Google Drive') || errorText.includes('unable to open the file') || errorText.includes('Page not found')) {
          customMessage = 'Tampaknya Anda salah memasukkan URL Google Spreadsheet atau file Google Drive yang dilindungi, bukan URL Web App Google Apps Script. Silakan ganti dengan URL Web App hasil deployment yang berakhiran dengan "/exec".';
        }

        return res.status(400).json({
          status: 'error',
          message: customMessage,
          detail: errorText.substring(0, 300)
        });
      }

      const rawText = await response.text();

      // Check if Apps Script returned an HTML page (like a login or authorization error page)
      if (rawText.trim().startsWith('<!DOCTYPE html') || rawText.trim().startsWith('<html') || rawText.includes('<script')) {
        console.error('[Proxy] Google Apps Script mengembalikan halaman HTML, bukan JSON.');
        
        let customMessage = 'Google Apps Script mengembalikan halaman HTML (Login/Error). Pastikan skrip sudah dideploy sebagai Web App dengan akses "Anyone" (Siapa saja) dan dijalankan sebagai "Me" (Saya).';
        if (rawText.includes('drive-logo') || rawText.includes('Google Drive') || rawText.includes('unable to open the file') || rawText.includes('Page not found')) {
          customMessage = 'Tampaknya Anda salah memasukkan URL Google Spreadsheet atau file Google Drive yang dilindungi, bukan URL Web App Google Apps Script yang berakhiran dengan "/exec".';
        }

        return res.status(400).json({
          status: 'error',
          message: customMessage
        });
      }

      try {
        const jsonResult = JSON.parse(rawText);
        return res.json(jsonResult);
      } catch (jsonErr: any) {
        console.error('[Proxy] Gagal mem-parse respon JSON dari Apps Script:', jsonErr);
        console.error('[Proxy] 500 karakter pertama dari respon mentah:', rawText.substring(0, 500));
        return res.status(400).json({
          status: 'error',
          message: 'Format data dari Google Apps Script tidak valid (Bukan JSON). Pastikan skrip dijalankan dengan benar.',
          detail: rawText.substring(0, 200)
        });
      }

    } catch (error: any) {
      console.error('[Proxy] Kesalahan pada server proxy sync:', error);
      return res.status(500).json({
        status: 'error',
        message: `Terjadi kesalahan saat memproses permintaan sinkronisasi di backend proxy: ${error.message}`
      });
    }
  });

  // Vite middleware for development or serving built assets for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("[Vite] Vite development middleware loaded.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log("[Production] Static files are served from dist/.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
