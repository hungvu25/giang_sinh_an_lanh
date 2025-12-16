require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY || '';
const FRONTEND_DIR = path.join(__dirname, 'media');
const DB_PATH = path.join(__dirname, 'server-db.json');
const SHARE_TTL_MS = 10 * 24 * 60 * 60 * 1000; // 10 ngày

const INDEX_FILE = path.join(FRONTEND_DIR, 'index ver1.1.html');

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(FRONTEND_DIR, { index: 'index ver1.1.html' }));

function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) return { shares: {} };
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Không đọc được DB:', err);
    return { shares: {} };
  }
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Không lưu được DB:', err);
  }
}

function purgeExpired(db) {
  const now = Date.now();
  const shares = db.shares || {};
  let changed = false;
  Object.keys(shares).forEach((id) => {
    const exp = shares[id]?.expiresAt;
    if (exp && exp < now) {
      delete shares[id];
      changed = true;
    }
  });
  if (changed) saveDB({ shares });
  return { shares };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, imgbbConfigured: Boolean(IMGBB_API_KEY) });
});

app.post('/api/upload', async (req, res) => {
  try {
    if (!IMGBB_API_KEY) return res.status(500).json({ error: 'IMGBB_API_KEY chưa cấu hình trên server.' });
    const { imageBase64, fileName } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'Thiếu imageBase64.' });

    const form = new FormData();
    form.append('image', imageBase64);
    if (fileName) {
      const clean = path.parse(fileName).name || 'uploaded-photo';
      form.append('name', clean);
    }

    const resp = await axios.post('https://api.imgbb.com/1/upload', form, {
      params: { key: IMGBB_API_KEY },
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const data = resp.data?.data;
    const url = data?.url || data?.display_url || data?.image?.url;
    if (!url) return res.status(502).json({ error: 'Imgbb không trả về URL.' });
    res.json({ url });
  } catch (err) {
    console.error('Upload lỗi:', err.response?.data || err.message);
    const msg = err.response?.data?.error?.message || err.message || 'Upload thất bại.';
    res.status(502).json({ error: msg });
  }
});

app.post('/api/share', (req, res) => {
  const { userName = '', loveText = '', photos = [], ttlMs } = req.body || {};
  if (!Array.isArray(photos) || photos.length === 0) {
    return res.status(400).json({ error: 'Thiếu danh sách ảnh.' });
  }
  const invalid = photos.some((p) => !p || typeof p !== 'string' || !/^https?:/i.test(p));
  if (invalid) return res.status(400).json({ error: 'Ảnh phải là URL công khai.' });

  const now = Date.now();
  const entry = {
    id: crypto.randomUUID(),
    userName,
    loveText,
    photos,
    createdAt: now,
    expiresAt: now + (Number(ttlMs) || SHARE_TTL_MS),
  };

  const db = purgeExpired(loadDB());
  db.shares[entry.id] = entry;
  saveDB(db);

  res.json({ id: entry.id, expiresAt: entry.expiresAt });
});

app.get('/api/share/:id', (req, res) => {
  const { id } = req.params;
  const db = purgeExpired(loadDB());
  const entry = db.shares[id];
  if (!entry) return res.status(404).json({ error: 'Không tìm thấy share hoặc đã hết hạn.' });
  res.json(entry);
});

app.get('/', (_req, res) => {
  res.sendFile(INDEX_FILE);
});

app.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
});
