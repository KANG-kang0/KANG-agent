'use strict';

// ============================================================
// 常數 & State
// ============================================================
const DB_NAME = '小書蟲';
const DB_VERSION = 1;
const CATEGORIES = ['商業', '小說', '心理', '自我成長', '傳記', '科學', '其他'];
const NOTES_MAX = 7;
const NOTE_FOR_CARD_MAX = 50;
const QUOTE_MAX = 30;
const RECOMMEND_MAX = 30;

const MILESTONES = [1, 5, 10, 25, 50, 100, 200, 365, 500, 1000];
const SHOWN_MILESTONES_KEY = '小書蟲-milestones-shown-v1';

const MOOD_TAGS = [
  { emoji: '🤯', name: '衝擊' },
  { emoji: '💡', name: '啟發' },
  { emoji: '🍃', name: '療癒' },
  { emoji: '🔥', name: '必讀' },
  { emoji: '🪨', name: '沉重' },
  { emoji: '📚', name: '工具書' },
  { emoji: '🎭', name: '翻案' },
  { emoji: '☁️', name: '輕鬆' },
];

const TEMPLATES = [
  { id: 'warm', name: '暖棕' },
  { id: 'minimal', name: '純白' },
  { id: 'polaroid', name: '拍立得' },
  { id: 'quote', name: '金句卡' },
];

const WELCOME_KEY = '小書蟲-welcomed-v1';

let db = null;
let allBooks = [];
let currentBook = null;
let currentNotes = [];

const state = {
  view: 'bookshelf',
  year: new Date().getFullYear(),
  category: '全部',
  currentBookId: null,
  showAddBook: false,
  showShareCard: false,
  shareTemplate: 'warm',
  showWelcome: false,
  showMilestone: null,
  searchQuery: '',
  showPublicShelf: false,
};

// ============================================================
// IndexedDB
// ============================================================
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onupgradeneeded = (e) => {
      const _db = e.target.result;
      if (!_db.objectStoreNames.contains('books')) {
        const books = _db.createObjectStore('books', { keyPath: 'id' });
        books.createIndex('dateAdded', 'dateAdded');
      }
      if (!_db.objectStoreNames.contains('notes')) {
        const notes = _db.createObjectStore('notes', { keyPath: 'id' });
        notes.createIndex('bookId', 'bookId');
      }
    };
  });
}

const tx = (store, mode = 'readonly') =>
  db.transaction([store], mode).objectStore(store);

const wrap = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const getAllBooksDB = () => wrap(tx('books').getAll());
const getBookDB = (id) => wrap(tx('books').get(id));
const saveBookDB = (book) => wrap(tx('books', 'readwrite').put(book));
const deleteBookDB = (id) => wrap(tx('books', 'readwrite').delete(id));
const getNotesForBook = (bookId) => wrap(tx('notes').index('bookId').getAll(bookId));
const saveNoteDB = (note) => wrap(tx('notes', 'readwrite').put(note));
const deleteNoteDB = (id) => wrap(tx('notes', 'readwrite').delete(id));

async function deleteBookAndNotes(id) {
  const notes = await getNotesForBook(id);
  await Promise.all(notes.map(n => deleteNoteDB(n.id)));
  await deleteBookDB(id);
}

// 補上舊版書本可能缺的欄位
function withDefaults(book) {
  return {
    moodTags: [],
    recommendFor: '',
    noteForCard: '',
    quoteForCard: '',
    readingContext: '',  // 那時你在哪、正在經歷什麼
    rating: null,
    ...book,
  };
}

// ============================================================
// 工具
// ============================================================
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function blobToBase64(blob) {
  const url = await blobToDataURL(blob);
  return url.split(',')[1];
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function loadImageCORS(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function resizeIfNeeded(blob, maxSide = 1600, quality = 0.8) {
  const url = await blobToDataURL(blob);
  const img = await loadImage(url);
  const longest = Math.max(img.width, img.height);
  let w = img.width, h = img.height;
  if (longest > maxSide) {
    const scale = maxSide / longest;
    w = Math.round(img.width * scale);
    h = Math.round(img.height * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function coverDataURL(book) {
  if (book.coverBlob) return URL.createObjectURL(book.coverBlob);
  if (book.coverURL) return book.coverURL;
  return null;
}

function countChars(s) {
  return [...(s || '')].length;  // 用 spread 處理 emoji 跟中文
}

// ---------- 顏色工具(給「依封面取色」用) ----------
function rgbToCSS(rgb) {
  return `rgb(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)})`;
}
function lighten(rgb, amount = 0.3) {
  return {
    r: Math.min(255, rgb.r + (255 - rgb.r) * amount),
    g: Math.min(255, rgb.g + (255 - rgb.g) * amount),
    b: Math.min(255, rgb.b + (255 - rgb.b) * amount),
  };
}
function darken(rgb, amount = 0.3) {
  return {
    r: Math.max(0, rgb.r * (1 - amount)),
    g: Math.max(0, rgb.g * (1 - amount)),
    b: Math.max(0, rgb.b * (1 - amount)),
  };
}
function isLightRGB(rgb) {
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) > 145;
}
function getDominantColor(image) {
  const w = 60, h = 60;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  try {
    ctx.drawImage(image, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const sum = data[i] + data[i + 1] + data[i + 2];
      if (sum < 80 || sum > 690) continue;  // 跳過接近純黑/純白
      r += data[i]; g += data[i + 1]; b += data[i + 2];
      count++;
    }
    if (count < 50) return { r: 139, g: 90, b: 60 };
    return { r: r / count, g: g / count, b: b / count };
  } catch {
    return { r: 139, g: 90, b: 60 };
  }
}

// ---------- Toast 提示 ----------
function toast(message, ms = 2000) {
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = message;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), ms);
}

// ---------- 里程碑 ----------
function getShownMilestones() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SHOWN_MILESTONES_KEY) || '[]'));
  } catch { return new Set(); }
}
function markMilestoneShown(n) {
  const set = getShownMilestones();
  set.add(n);
  localStorage.setItem(SHOWN_MILESTONES_KEY, JSON.stringify([...set]));
}
function checkMilestone(total) {
  if (!MILESTONES.includes(total)) return null;
  const shown = getShownMilestones();
  return shown.has(total) ? null : total;
}
function milestoneCheer(n) {
  if (n === 1) return '一本書，是一段時光的開始 🌱';
  if (n === 5) return '已經有 5 本書陪過你了 ✨';
  if (n === 10) return '你比 80% 的人讀得更多';
  if (n === 25) return '閱讀習慣養成中 🐛';
  if (n === 50) return '一座書架的厚度，是時間的累積';
  if (n === 100) return '百本書蟲。你重新定義了「忙」這個字';
  if (n === 200) return '這份堅持，已經是少數人才有的奢侈';
  if (n === 365) return '一年一本一輩子。你做到了';
  if (n === 500) return '半個圖書館。下次見面要叫你「館長」了';
  if (n === 1000) return '千本級別的讀者。世界很大，你看得也夠遠';
  return '繼續讀下去 🌱';
}

// ============================================================
// Google Books
// ============================================================
async function searchGoogleBooks(query) {
  const trimmed = (query || '').trim();
  if (!trimmed) return [];
  const url = `${window.CONFIG.GOOGLE_BOOKS_API}?q=${encodeURIComponent(trimmed)}&maxResults=20&langRestrict=zh`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Books ${res.status}`);
  const data = await res.json();
  return (data.items || []).map(item => {
    const info = item.volumeInfo || {};
    return {
      id: item.id,
      title: info.title || '',
      authors: info.authors || [],
      publisher: info.publisher || '',
      thumbnail: ((info.imageLinks && info.imageLinks.thumbnail) || '').replace(/^http:\/\//, 'https://'),
    };
  }).filter(r => r.title);
}

// ============================================================
// Claude
// ============================================================
function claudeHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': window.CONFIG.CLAUDE_API_KEY,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

async function callClaude(body) {
  if (!window.CONFIG.CLAUDE_API_KEY) {
    throw new Error('請先在 config.js 填入 Claude API Key');
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: claudeHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}：${err.substring(0, 200)}`);
  }
  const data = await res.json();
  return (data.content || []).map(c => c.text).filter(Boolean).join('').trim();
}

// 拍/選封面 → AI 辨識書名/作者/出版社
async function ocrCover(blob) {
  const resized = await resizeIfNeeded(blob, 1200, 0.85);
  const b64 = await blobToBase64(resized);

  const prompt = `這是一張書本封面的照片(或電子書封面截圖)。請辨識封面上的文字，回傳純 JSON 格式：
{"title": "書名", "author": "作者", "publisher": "出版社"}

規則：
- 書名一定要填(看不清楚就猜最可能的)
- 作者看不到就用空字串
- 出版社看不到就用空字串
- 不要前後贅言，只回傳 JSON
- 如果完全不是書封，回傳 {"title": "", "author": "", "publisher": ""}`;

  const text = await callClaude({
    model: window.CONFIG.CLAUDE_MODEL,
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
        { type: 'text', text: prompt },
      ],
    }],
  });

  // 找出 JSON 字串
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI 沒回傳預期格式');
  try {
    return JSON.parse(match[0]);
  } catch {
    throw new Error('JSON 解析失敗');
  }
}

// 辨識完封面後，背景查 Google Books 補出版社
async function autoFillPublisher(title, author) {
  try {
    const query = author ? `${title} ${author}` : title;
    const results = await searchGoogleBooks(query);
    if (!results.length) return '';
    // 找標題吻合且有出版社的
    const best = results.find(r => r.publisher && (r.title.includes(title) || title.includes(r.title)));
    return best ? best.publisher : (results[0].publisher || '');
  } catch {
    return '';
  }
}

// 整理筆記重點
async function summarizeNotes(noteBlobs, style, bookTitle) {
  if (!noteBlobs.length) throw new Error('需要至少一張筆記照片');

  const content = [];
  for (const blob of noteBlobs) {
    const resized = await resizeIfNeeded(blob);
    const b64 = await blobToBase64(resized);
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
    });
  }

  const styleHint = style === 'paragraph'
    ? '用段落式整理(3-4 段，總字數控制在 250-350 字以內，適合社群長文的長度)'
    : '用條列式整理(5-7 點，每點 1-2 句，總字數控制在 250 字以內)';

  const prompt = `這是我讀《${bookTitle}》時拍下的筆記照片。請用繁體中文整理出我自己讀後的重點筆記。

要求：
- ${styleHint}
- 用你自己的話重新詮釋核心觀念，不要逐字照抄書中原文
- 語氣自然，像在跟朋友分享讀後感
- 直接給整理結果，不要寫前後贅言
- 這是給我自己回顧用的私人筆記`;

  content.push({ type: 'text', text: prompt });

  return await callClaude({
    model: window.CONFIG.CLAUDE_MODEL,
    max_tokens: 700,
    messages: [{ role: 'user', content }],
  });
}

// ============================================================
// Share Card (Canvas)
// ============================================================
const FONT = '"PingFang TC", "Noto Sans TC", system-ui, sans-serif';

async function getCoverImageForCanvas(book) {
  if (book.coverBlob) {
    try {
      const url = await blobToDataURL(book.coverBlob);
      return await loadImage(url);
    } catch { return null; }
  }
  if (book.coverURL) {
    try {
      return await loadImageCORS(book.coverURL);
    } catch { return null; }
  }
  return null;
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  if (!text) return 0;
  const chars = [...text];
  const lines = [];
  let line = '';
  for (const c of chars) {
    const test = line + c;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = c;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return lines.length;
}

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  return canvas;
}

// 暖棕版型(IG 正方 1080x1080)— 背景色根據封面主色自動調整
async function drawWarmCard(book) {
  const canvas = makeCanvas(1080, 1080);
  const ctx = canvas.getContext('2d');

  const cover = await getCoverImageForCanvas(book);

  // 從封面取主色;沒封面就用預設暖棕
  let lightBg, darkBg, titleColor, subColor;
  if (cover) {
    const dom = getDominantColor(cover);
    lightBg = rgbToCSS(lighten(dom, 0.62));
    darkBg = rgbToCSS(darken(dom, 0.2));
    titleColor = rgbToCSS(darken(dom, 0.7));
    subColor = rgbToCSS(darken(dom, 0.45));
  } else {
    lightBg = '#f5e6d3';
    darkBg = '#c69e72';
    titleColor = '#3d2614';
    subColor = '#664026';
  }

  const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
  grad.addColorStop(0, lightBg);
  grad.addColorStop(1, darkBg);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 1080);

  ctx.fillStyle = subColor;
  ctx.font = `600 50px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('本月選書', 540, 110);

  const cw = 360, ch = 540;
  const cx = (1080 - cw) / 2, cy = 160;
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 24; ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#fff';
  ctx.fillRect(cx, cy, cw, ch);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  if (cover) {
    ctx.drawImage(cover, cx, cy, cw, ch);
  } else {
    ctx.fillStyle = '#e0c9a8';
    ctx.fillRect(cx, cy, cw, ch);
  }

  ctx.fillStyle = titleColor;
  ctx.font = `bold 52px ${FONT}`;
  ctx.textAlign = 'center';
  const titleLines = drawWrappedText(ctx, book.title, 540, 780, 900, 64, 2);

  if (book.author) {
    ctx.fillStyle = subColor;
    ctx.font = `32px ${FONT}`;
    ctx.fillText(book.author, 540, 780 + titleLines * 64 + 16);
  }

  const tags = (book.moodTags || []).slice(0, 4).map(t => {
    const mt = MOOD_TAGS.find(m => m.name === t);
    return mt ? mt.emoji : '';
  }).filter(Boolean).join(' ');
  if (tags) {
    ctx.font = `42px ${FONT}`;
    ctx.fillText(tags, 540, 920);
  }

  if (book.noteForCard) {
    ctx.fillStyle = subColor;
    ctx.font = `italic 26px ${FONT}`;
    drawWrappedText(ctx, book.noteForCard, 540, tags ? 970 : 920, 880, 34, 2);
  }

  ctx.fillStyle = subColor;
  ctx.font = `24px ${FONT}`;
  ctx.fillText('— 小書蟲 —', 540, 1040);

  return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// 里程碑慶祝卡(讀到 X 本書)
async function drawMilestoneCard(count, year) {
  const canvas = makeCanvas(1080, 1080);
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
  grad.addColorStop(0, '#fef3e0');
  grad.addColorStop(1, '#f4b942');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 1080);

  ctx.fillStyle = '#a8650a';
  ctx.font = `130px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('📚', 540, 260);

  ctx.fillStyle = '#5a3a08';
  ctx.font = `900 240px ${FONT}`;
  ctx.fillText(String(count), 540, 530);

  ctx.fillStyle = '#7a5a18';
  ctx.font = `600 54px ${FONT}`;
  ctx.fillText('本書讀完了', 540, 630);

  const cheer = milestoneCheer(count);
  ctx.fillStyle = '#5a3a08';
  ctx.font = `40px ${FONT}`;
  drawWrappedText(ctx, cheer, 540, 770, 900, 54, 2);

  ctx.fillStyle = '#a8650a';
  ctx.font = `30px ${FONT}`;
  ctx.fillText(`📅 ${year}`, 540, 940);

  ctx.fillStyle = '#a8650a';
  ctx.font = `26px ${FONT}`;
  ctx.fillText('— 小書蟲陪你繼續讀下去 —', 540, 1020);

  return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// 純白極簡版型
async function drawMinimalCard(book) {
  const canvas = makeCanvas(1080, 1080);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fafaf6';
  ctx.fillRect(0, 0, 1080, 1080);

  ctx.fillStyle = '#999';
  ctx.font = `400 24px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('本月選書 · 小書蟲', 1020, 70);

  const cover = await getCoverImageForCanvas(book);
  const cw = 300, ch = 450;
  const cx = 90, cy = 200;
  ctx.shadowColor = 'rgba(0,0,0,0.12)';
  ctx.shadowBlur = 16; ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#fff';
  ctx.fillRect(cx, cy, cw, ch);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  if (cover) {
    ctx.drawImage(cover, cx, cy, cw, ch);
  } else {
    ctx.fillStyle = '#ececec';
    ctx.fillRect(cx, cy, cw, ch);
  }

  const tx = cx + cw + 60;
  ctx.fillStyle = '#1a1a1a';
  ctx.font = `bold 50px ${FONT}`;
  ctx.textAlign = 'left';
  const titleLines = drawWrappedText(ctx, book.title, tx, cy + 80, 540, 64, 3);

  if (book.author) {
    ctx.fillStyle = '#888';
    ctx.font = `28px ${FONT}`;
    ctx.fillText(book.author, tx, cy + 80 + titleLines * 64 + 20);
  }

  const tags = (book.moodTags || []).slice(0, 4).map(t => {
    const mt = MOOD_TAGS.find(m => m.name === t);
    return mt ? mt.emoji : '';
  }).filter(Boolean).join('  ');
  if (tags) {
    ctx.font = `36px ${FONT}`;
    ctx.fillText(tags, tx, cy + ch - 40);
  }

  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(90, 780);
  ctx.lineTo(990, 780);
  ctx.stroke();

  const note = book.noteForCard || book.recommendFor || '';
  if (note) {
    ctx.fillStyle = '#555';
    ctx.font = `italic 32px ${FONT}`;
    ctx.textAlign = 'center';
    drawWrappedText(ctx, note, 540, 870, 880, 46, 2);
  }

  ctx.fillStyle = '#bbb';
  ctx.font = `22px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('小書蟲', 540, 1030);

  return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// 拍立得版型
async function drawPolaroidCard(book) {
  const canvas = makeCanvas(1080, 1080);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#efe5d1';
  ctx.fillRect(0, 0, 1080, 1080);

  // 拍立得白框
  ctx.save();
  ctx.translate(540, 470);
  ctx.rotate(-0.035);

  const fw = 560, fh = 720;
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 30; ctx.shadowOffsetY = 16;
  ctx.fillStyle = '#fff';
  ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  const cover = await getCoverImageForCanvas(book);
  const inw = 480, inh = 520;
  const inx = -inw / 2;
  const iny = -fh / 2 + 40;
  if (cover) {
    ctx.drawImage(cover, inx, iny, inw, inh);
  } else {
    ctx.fillStyle = '#e8dccb';
    ctx.fillRect(inx, iny, inw, inh);
  }

  ctx.fillStyle = '#3d2614';
  ctx.font = `500 30px ${FONT}`;
  ctx.textAlign = 'center';
  const tLines = drawWrappedText(ctx, book.title, 0, iny + inh + 60, inw - 40, 38, 2);

  if (book.author) {
    ctx.fillStyle = '#8b6f50';
    ctx.font = `22px ${FONT}`;
    ctx.fillText(book.author, 0, iny + inh + 60 + tLines * 38 + 14);
  }

  ctx.restore();

  // 心情標籤
  const tags = (book.moodTags || []).slice(0, 4).map(t => {
    const mt = MOOD_TAGS.find(m => m.name === t);
    return mt ? mt.emoji : '';
  }).filter(Boolean).join('  ');
  if (tags) {
    ctx.fillStyle = '#664026';
    ctx.font = `44px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(tags, 540, 900);
  }

  if (book.noteForCard) {
    ctx.fillStyle = '#8b6f50';
    ctx.font = `italic 26px ${FONT}`;
    ctx.textAlign = 'center';
    drawWrappedText(ctx, book.noteForCard, 540, tags ? 960 : 920, 880, 34, 1);
  }

  ctx.fillStyle = '#a8866a';
  ctx.font = `22px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('— 小書蟲 —', 540, 1040);

  return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// 金句卡
async function drawQuoteCard(book) {
  const canvas = makeCanvas(1080, 1080);
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, 1080);
  grad.addColorStop(0, '#1e1a26');
  grad.addColorStop(1, '#3d2e3a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 1080);

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.font = `300 280px Georgia, serif`;
  ctx.textAlign = 'left';
  ctx.fillText('“', 80, 340);

  ctx.fillStyle = '#fff';
  ctx.font = `400 60px ${FONT}`;
  ctx.textAlign = 'center';
  drawWrappedText(ctx, book.quoteForCard || '', 540, 480, 880, 84, 4);

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.font = `300 280px Georgia, serif`;
  ctx.textAlign = 'right';
  ctx.fillText('”', 1000, 820);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `28px ${FONT}`;
  ctx.textAlign = 'center';
  const attr = `—《${book.title}》${book.author ? '  ' + book.author : ''}`;
  ctx.fillText(attr, 540, 880);

  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = `22px ${FONT}`;
  ctx.fillText('小書蟲', 540, 1030);

  return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// 年度回顧(1080x1920)
async function generateYearlyCard(year, books) {
  const canvas = makeCanvas(1080, 1920);
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, 1920);
  grad.addColorStop(0, '#1f1a2e');
  grad.addColorStop(1, '#4d2e47');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 1920);

  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.font = `900 120px ${FONT}`;
  ctx.fillText(String(year), 540, 280);

  ctx.font = `500 50px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('年度閱讀回顧', 540, 360);

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `44px ${FONT}`;
  ctx.fillText(`讀了 ${books.length} 本書`, 540, 460);

  const counts = {};
  books.forEach(b => counts[b.category] = (counts[b.category] || 0) + 1);
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  let blockY = 560;
  if (sorted.length) {
    const blockH = 90 + sorted.length * 72;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(90, blockY, 900, blockH, 24);
      ctx.fill();
    } else {
      ctx.fillRect(90, blockY, 900, blockH);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `600 32px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('分類分布', 140, blockY + 60);

    ctx.font = `40px ${FONT}`;
    let y = blockY + 130;
    for (const [cat, n] of sorted) {
      ctx.fillStyle = 'white';
      ctx.textAlign = 'left';
      ctx.fillText(cat, 140, y);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.textAlign = 'right';
      ctx.fillText(`${n} 本`, 940, y);
      y += 72;
    }
    blockY = y + 20;
  }

  const picks = books.filter(b => b.isYearlyPick).slice(0, 3);
  if (picks.length) {
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.font = `600 46px ${FONT}`;
    ctx.fillText('年度精選', 540, blockY + 80);

    const cw2 = 220, ch2 = 330, gap = 36;
    const totalW = picks.length * cw2 + (picks.length - 1) * gap;
    let x = (1080 - totalW) / 2;
    const py = blockY + 140;

    for (const book of picks) {
      const cover = await getCoverImageForCanvas(book);
      if (cover) {
        ctx.drawImage(cover, x, py, cw2, ch2);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x, py, cw2, ch2);
      }
      ctx.fillStyle = 'white';
      ctx.font = `26px ${FONT}`;
      ctx.textAlign = 'center';
      const title = book.title.length > 8 ? book.title.slice(0, 8) + '…' : book.title;
      ctx.fillText(title, x + cw2 / 2, py + ch2 + 46);
      x += cw2 + gap;
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.textAlign = 'center';
  ctx.font = `34px ${FONT}`;
  ctx.fillText('— 小書蟲 —', 540, 1840);

  return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function generateCardForTemplate(book, template) {
  if (template === 'minimal') return drawMinimalCard(book);
  if (template === 'polaroid') return drawPolaroidCard(book);
  if (template === 'quote') return drawQuoteCard(book);
  return drawWarmCard(book);
}

async function shareBlob(blob, filename, title) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============================================================
// 購買連結
// ============================================================
function buyLinks(title, author) {
  const q = encodeURIComponent(`${title} ${author || ''}`.trim());
  return [
    { name: '博客來', url: `https://search.books.com.tw/search/query/key/${q}/` },
    { name: '誠品',   url: `https://www.eslite.com/Search?keyword=${q}` },
    { name: '讀冊',   url: `https://www.taaze.tw/search_index.html?keyword%5B0%5D=${q}` },
    { name: 'Readmoo', url: `https://readmoo.com/search?q=${q}` },
  ];
}

// 產出可以複製到 IG / Threads / Line 的分享文案
function buildShareCaption(book) {
  const moodEmojis = (book.moodTags || []).slice(0, 3).map(t => {
    const mt = MOOD_TAGS.find(m => m.name === t);
    return mt ? mt.emoji : '';
  }).filter(Boolean).join('');
  const links = buyLinks(book.title, book.author);
  let text = `《${book.title}》`;
  if (book.author) text += `\n${book.author}`;
  if (moodEmojis) text += `  ${moodEmojis}`;
  text += '\n\n';
  if (book.noteForCard) text += book.noteForCard + '\n\n';
  if (book.recommendFor) text += `👉 ${book.recommendFor}\n\n`;
  text += `📖 博客來：\n${links[0].url}\n\n— 來自小書蟲 📚`;
  return text;
}

async function copyShareCaption(book) {
  const text = buildShareCaption(book);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// 匯出 / 匯入
// ============================================================
async function exportData() {
  const books = await getAllBooksDB();
  const serialized = {
    version: 1,
    exportedAt: new Date().toISOString(),
    books: [],
    notes: {},
  };
  for (const book of books) {
    const b = { ...book };
    if (b.coverBlob instanceof Blob) {
      b.coverBlob = await blobToDataURL(b.coverBlob);
    }
    serialized.books.push(b);
    const notes = await getNotesForBook(book.id);
    serialized.notes[book.id] = await Promise.all(notes.map(async n => ({
      ...n,
      imageBlob: n.imageBlob instanceof Blob ? await blobToDataURL(n.imageBlob) : n.imageBlob,
    })));
  }
  const json = JSON.stringify(serialized, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `小書蟲備份-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function dataURLToBlob(dataURL) {
  const res = await fetch(dataURL);
  return await res.blob();
}

// 匯出成 Markdown(給人類看的版本,不能還原回 app)
async function exportMarkdown() {
  const books = (await getAllBooksDB()).map(withDefaults);
  const sorted = books.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));

  let md = `# 我的讀書筆記\n\n`;
  md += `匯出於 ${new Date().toLocaleDateString('zh-TW')}\n\n`;
  md += `共 ${sorted.length} 本書\n\n---\n\n`;

  const byYear = {};
  for (const b of sorted) {
    const y = new Date(b.dateAdded).getFullYear();
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(b);
  }

  for (const year of Object.keys(byYear).sort((a, b) => b - a)) {
    md += `## ${year} 年\n\n`;
    for (const b of byYear[year]) {
      md += `### 《${b.title}》${b.author ? ' — ' + b.author : ''}\n\n`;
      if (b.publisher) md += `**出版**：${b.publisher}\n\n`;
      const flags = [];
      if (b.isMonthlyPick) flags.push('⭐ 月選書');
      if (b.isYearlyPick) flags.push('👑 年選書');
      md += `**分類**：${b.category}${flags.length ? ' | ' + flags.join(' | ') : ''}\n\n`;

      const tags = (b.moodTags || []).map(t => {
        const mt = MOOD_TAGS.find(m => m.name === t);
        return mt ? `${mt.emoji} ${t}` : t;
      }).join('、');
      if (tags) md += `**心情**：${tags}\n\n`;

      if (b.readingContext) md += `**讀書當下**：${b.readingContext}\n\n`;
      if (b.recommendFor) md += `**想推薦給**：${b.recommendFor}\n\n`;
      if (b.noteForCard) md += `**隨筆隨記**：${b.noteForCard}\n\n`;
      if (b.quoteForCard) md += `> ${b.quoteForCard}\n\n`;
      if (b.aiSummary) md += `**重點整理**：\n\n${b.aiSummary}\n\n`;

      md += `📅 ${new Date(b.dateAdded).toLocaleDateString('zh-TW')}\n\n---\n\n`;
    }
  }

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `小書蟲讀書筆記-${new Date().toISOString().split('T')[0]}.md`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 匯出「公開書架網頁」— 自包含 HTML，朋友打開就能看
async function exportPublicShelf() {
  const books = (await getAllBooksDB()).map(withDefaults);
  if (!books.length) {
    alert('還沒有書可以分享，先加幾本再來');
    return;
  }

  const inputTitle = prompt('書架的標題：', '我的小書架');
  if (inputTitle === null) return;
  const shelfTitle = (inputTitle.trim() || '我的小書架').substring(0, 40);

  // 把封面壓小,避免 HTML 檔太大(每本約 15-25KB)
  const bookData = await Promise.all(books.map(async b => {
    let cover = null;
    if (b.coverBlob instanceof Blob) {
      try {
        const resized = await resizeIfNeeded(b.coverBlob, 400, 0.7);
        cover = await blobToDataURL(resized);
      } catch {}
    } else if (b.coverURL) {
      cover = b.coverURL;
    }
    return {
      title: b.title,
      author: b.author || '',
      publisher: b.publisher || '',
      cover,
      moodTags: (b.moodTags || []).map(t => {
        const mt = MOOD_TAGS.find(m => m.name === t);
        return mt ? mt.emoji + ' ' + t : t;
      }),
      recommendFor: b.recommendFor || '',
      noteForCard: b.noteForCard || '',
      quoteForCard: b.quoteForCard || '',
      isMonthlyPick: !!b.isMonthlyPick,
      isYearlyPick: !!b.isYearlyPick,
      year: new Date(b.dateAdded).getFullYear(),
      buyLinks: buyLinks(b.title, b.author || ''),
    };
  }));

  const years = [...new Set(bookData.map(b => b.year))].sort((a, b) => b - a);
  const html = buildPublicShelfHTML(shelfTitle, bookData, years);

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = shelfTitle + '.html';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildPublicShelfHTML(title, books, years) {
  const dataJSON = JSON.stringify(books).replace(/</g, '\\u003c');
  const yearBtns = '<button data-year="all" class="active">全部</button>' +
    years.map(y => '<button data-year="' + y + '">' + y + '</button>').join('');

  const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#fdf8f2;--surface:#fff;--primary:#8b5a3c;--light:#f5e6d3;--soft:rgba(139,90,60,.1);--text:#2d1e10;--muted:#8b7355;--border:#e8dccb}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC",system-ui,sans-serif;min-height:100vh;line-height:1.5;-webkit-tap-highlight-color:transparent}
button{font-family:inherit;cursor:pointer}
.hero{text-align:center;padding:60px 20px 40px;background:linear-gradient(135deg,#f5e6d3,#c69e72);color:#3d2614}
.hero h1{font-size:36px;margin-bottom:12px;font-weight:700}
.hero-stat{font-size:17px;margin-bottom:4px}
.hero-sub{font-size:13px;opacity:.65;margin-top:8px}
main{max-width:900px;margin:0 auto;padding:24px 16px 60px}
.year-filter{display:flex;gap:8px;overflow-x:auto;padding:0 0 20px;-webkit-overflow-scrolling:touch}
.year-filter::-webkit-scrollbar{display:none}
.year-filter button{flex-shrink:0;background:var(--soft);color:var(--text);border:none;padding:7px 18px;border-radius:20px;font-size:14px}
.year-filter button.active{background:var(--primary);color:#fff;font-weight:500}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:24px}
.book{cursor:pointer;transition:transform .15s}
.book:hover{transform:translateY(-3px)}
.book-cover{position:relative;aspect-ratio:2/3;border-radius:6px;overflow:hidden;background:var(--light);box-shadow:0 4px 12px rgba(0,0,0,.12)}
.book-cover img{width:100%;height:100%;object-fit:cover;display:block}
.book-placeholder{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:40px;color:var(--primary);opacity:.4}
.book-badge{position:absolute;top:6px;right:6px;background:rgba(255,255,255,.92);border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:15px}
.book-title{font-size:14px;margin-top:10px;font-weight:500;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.book-author{font-size:12px;color:var(--muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10;display:flex;align-items:center;justify-content:center;padding:16px}
.modal{background:var(--bg);width:100%;max-width:560px;max-height:90vh;overflow-y:auto;border-radius:16px;padding:24px;-webkit-overflow-scrolling:touch}
.modal-close{float:right;background:var(--soft);border:none;width:34px;height:34px;border-radius:50%;font-size:20px;color:var(--primary);line-height:1}
.modal-header{display:flex;gap:16px;margin-bottom:20px;clear:both;padding-top:8px}
.modal-cover{width:110px;aspect-ratio:2/3;border-radius:6px;overflow:hidden;background:var(--light);flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.15)}
.modal-cover img{width:100%;height:100%;object-fit:cover}
.modal-info{flex:1;min-width:0}
.modal-info h2{font-size:20px;margin-bottom:6px;line-height:1.3;word-break:break-all}
.modal-info .author{color:var(--muted);font-size:14px;margin-bottom:2px}
.modal-info .publisher{color:var(--muted);font-size:12px}
.modal-section{margin:16px 0}
.modal-section .label{font-size:12px;color:var(--muted);font-weight:600;margin-bottom:6px}
.modal-section .body{font-size:14px;line-height:1.6;white-space:pre-wrap}
.mood-row{display:flex;gap:6px;flex-wrap:wrap}
.mood-pill{background:var(--soft);color:var(--text);padding:5px 12px;border-radius:14px;font-size:13px}
.quote-box{border-left:3px solid var(--primary);padding:10px 14px;background:var(--soft);border-radius:0 8px 8px 0;font-style:italic;line-height:1.6}
.buy-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.buy-row a{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:11px;text-align:center;text-decoration:none;color:var(--primary);font-size:14px;font-weight:500}
footer{text-align:center;padding:32px 20px;color:var(--muted);font-size:13px;background:var(--surface);border-top:1px solid var(--border)}
footer p{margin:4px 0}
footer strong{color:var(--primary)}
`;

  // 內嵌 JS 用 string 串接，避免跟外層 template literal 衝突
  const JS = `
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]})}
function cell(b,i){
  var bd=b.isYearlyPick?'👑':(b.isMonthlyPick?'⭐':'');
  var im=b.cover?'<img src="'+esc(b.cover)+'" loading="lazy">':'<div class="book-placeholder">📕</div>';
  var bg=bd?'<span class="book-badge">'+bd+'</span>':'';
  var au=b.author?'<div class="book-author">'+esc(b.author)+'</div>':'';
  return '<div class="book" data-i="'+i+'"><div class="book-cover">'+im+bg+'</div><div class="book-title">'+esc(b.title)+'</div>'+au+'</div>';
}
function renderGrid(y){
  var g=document.getElementById('grid');
  var f=y==='all'?BOOKS:BOOKS.filter(function(b){return b.year===parseInt(y)});
  g.innerHTML=f.map(function(b){return cell(b,BOOKS.indexOf(b))}).join('');
  document.querySelectorAll('.book').forEach(function(el){
    el.addEventListener('click',function(){openBook(parseInt(el.dataset.i))});
  });
}
function openBook(i){
  var b=BOOKS[i];
  var m=document.getElementById('modal');
  var c=document.getElementById('modal-content');
  var im=b.cover?'<img src="'+esc(b.cover)+'">':'<div class="book-placeholder">📕</div>';
  var h='<button class="modal-close" onclick="closeModal()">×</button>';
  h+='<div class="modal-header"><div class="modal-cover">'+im+'</div><div class="modal-info"><h2>'+esc(b.title)+'</h2>';
  if(b.author)h+='<p class="author">'+esc(b.author)+'</p>';
  if(b.publisher)h+='<p class="publisher">'+esc(b.publisher)+'</p>';
  h+='</div></div>';
  if(b.moodTags&&b.moodTags.length){
    var mt=b.moodTags.map(function(t){return '<span class="mood-pill">'+esc(t)+'</span>'}).join('');
    h+='<div class="modal-section"><div class="label">讀後心情</div><div class="mood-row">'+mt+'</div></div>';
  }
  if(b.recommendFor)h+='<div class="modal-section"><div class="label">想推薦給</div><div class="body">'+esc(b.recommendFor)+'</div></div>';
  if(b.noteForCard)h+='<div class="modal-section"><div class="label">隨筆隨記</div><div class="body">'+esc(b.noteForCard)+'</div></div>';
  if(b.quoteForCard)h+='<div class="modal-section"><div class="label">金句</div><div class="quote-box">'+esc(b.quoteForCard)+'</div></div>';
  if(b.buyLinks&&b.buyLinks.length){
    var bl=b.buyLinks.map(function(x){return '<a href="'+esc(x.url)+'" target="_blank" rel="noopener">'+esc(x.name)+'</a>'}).join('');
    h+='<div class="modal-section"><div class="label">📕 想看這本書？</div><div class="buy-row">'+bl+'</div></div>';
  }
  c.innerHTML=h;
  m.style.display='flex';
  document.body.style.overflow='hidden';
}
function closeModal(){
  document.getElementById('modal').style.display='none';
  document.body.style.overflow='';
}
document.getElementById('modal').addEventListener('click',function(e){if(e.target.id==='modal')closeModal()});
document.querySelectorAll('.year-filter button').forEach(function(btn){
  btn.addEventListener('click',function(){
    document.querySelectorAll('.year-filter button').forEach(function(b){b.classList.remove('active')});
    btn.classList.add('active');
    renderGrid(btn.dataset.year);
  });
});
renderGrid('all');
`;

  return '<!DOCTYPE html>\n<html lang="zh-Hant">\n<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + escapeHtml(title) + '</title>\n' +
    '<meta name="theme-color" content="#8b5a3c">\n' +
    '<style>' + CSS + '</style>\n' +
    '</head>\n<body>\n' +
    '<header class="hero">\n' +
      '<h1>📚 ' + escapeHtml(title) + '</h1>\n' +
      '<p class="hero-stat">共 ' + books.length + ' 本書</p>\n' +
      '<p class="hero-sub">— 由小書蟲製作 —</p>\n' +
    '</header>\n' +
    '<main>\n' +
      '<div class="year-filter">' + yearBtns + '</div>\n' +
      '<div class="grid" id="grid"></div>\n' +
    '</main>\n' +
    '<div class="modal-overlay" id="modal" style="display:none">\n' +
      '<div class="modal" id="modal-content"></div>\n' +
    '</div>\n' +
    '<footer>\n' +
      '<p>這個書架由 <strong>小書蟲</strong> 製作</p>\n' +
      '<p>讀到喜歡的書，記得 📕 買一本支持作者</p>\n' +
    '</footer>\n' +
    '<script>\nconst BOOKS = ' + dataJSON + ';\n' + JS + '\n</' + 'script>\n' +
    '</body>\n</html>';
}

async function importData(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data.version || !Array.isArray(data.books)) {
    throw new Error('檔案格式不對，這不是小書蟲備份檔');
  }
  let bookCount = 0, noteCount = 0;
  for (const book of data.books) {
    const b = { ...book };
    if (typeof b.coverBlob === 'string' && b.coverBlob.startsWith('data:')) {
      b.coverBlob = await dataURLToBlob(b.coverBlob);
    }
    await saveBookDB(b);
    bookCount++;
  }
  for (const [bookId, notes] of Object.entries(data.notes || {})) {
    for (const note of notes) {
      const n = { ...note };
      if (typeof n.imageBlob === 'string' && n.imageBlob.startsWith('data:')) {
        n.imageBlob = await dataURLToBlob(n.imageBlob);
      }
      await saveNoteDB(n);
      noteCount++;
    }
  }
  return { bookCount, noteCount };
}

// ============================================================
// 渲染
// ============================================================
async function render() {
  allBooks = (await getAllBooksDB()).map(withDefaults);
  const root = document.getElementById('app');

  if (state.view === 'detail' && state.currentBookId) {
    currentBook = await getBookDB(state.currentBookId);
    if (!currentBook) {
      state.view = 'bookshelf';
      state.currentBookId = null;
      return render();
    }
    currentBook = withDefaults(currentBook);
    currentNotes = await getNotesForBook(state.currentBookId);
    root.innerHTML = renderDetail();
    attachDetailListeners();
  } else if (state.view === 'yearlyWrap') {
    root.innerHTML = renderYearly();
    attachYearlyListeners();
  } else {
    root.innerHTML = renderBookshelf();
    attachBookshelfListeners();
  }

  if (state.showAddBook) {
    root.insertAdjacentHTML('beforeend', renderAddBookModal());
    attachAddBookListeners();
  }
  if (state.showShareCard) {
    root.insertAdjacentHTML('beforeend', renderShareCardModal());
    attachShareCardListeners();
  }
  if (state.showWelcome) {
    root.insertAdjacentHTML('beforeend', renderWelcomeModal());
    attachWelcomeListeners();
  }
  if (state.showMilestone) {
    root.insertAdjacentHTML('beforeend', renderMilestoneModal());
    attachMilestoneListeners();
  }
}

function renderHeader(title, leftHTML = '', rightHTML = '') {
  return `<header class="app-header">
    <div class="header-left">${leftHTML}</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="header-right">${rightHTML}</div>
  </header>`;
}

function renderNav() {
  return `<nav class="bottom-nav">
    <button class="nav-btn ${state.view === 'bookshelf' ? 'active' : ''}" data-view="bookshelf">
      <span class="nav-icon">📚</span><span>書架</span>
    </button>
    <button class="nav-btn ${state.view === 'yearlyWrap' ? 'active' : ''}" data-view="yearlyWrap">
      <span class="nav-icon">📊</span><span>年度回顧</span>
    </button>
  </nav>`;
}

function attachNavListeners() {
  document.querySelectorAll('.nav-btn').forEach(el => {
    el.addEventListener('click', () => {
      state.view = el.dataset.view;
      render();
    });
  });
}

// ---------- Welcome Modal ----------
function renderWelcomeModal() {
  return `<div class="modal-overlay center" id="welcome-modal">
    <div class="welcome-modal">
      <h2>歡迎來小書蟲 🌿</h2>
      <p>這裡陪你慢慢記下讀過的書。</p>
      <p>AI 幫你整理的重點，是給「未來的你」回顧用的小日記，<span class="quote">不會自動分享出去</span>。</p>
      <p>圖卡上放的是你的心情、你的話、還有一句喜歡的金句——書的內容本身屬於作者。</p>
      <p>讀到真心喜歡的，請給他們一張正版的票 📕<br>不只是支持作者，也讓更多好書能繼續被寫出來。</p>
      <button class="btn primary full" id="welcome-ok" style="margin-top: 18px">好的，開始用</button>
    </div>
  </div>`;
}

function attachWelcomeListeners() {
  document.getElementById('welcome-ok').addEventListener('click', () => {
    localStorage.setItem(WELCOME_KEY, '1');
    state.showWelcome = false;
    render();
  });
}

// ---------- Milestone Modal ----------
function renderMilestoneModal() {
  const n = state.showMilestone;
  if (!n) return '';
  return `<div class="modal-overlay center">
    <div class="welcome-modal">
      <div style="font-size:64px">🎉</div>
      <p class="milestone-label">恭喜你讀到第</p>
      <div class="milestone-big">${n}</div>
      <p class="milestone-label">本書</p>
      <p class="milestone-cheer">${escapeHtml(milestoneCheer(n))}</p>
      <div class="milestone-btns">
        <button class="btn outline" id="milestone-later">下次再說</button>
        <button class="btn primary" id="milestone-share">📤 做張慶祝卡分享</button>
      </div>
    </div>
  </div>`;
}

function attachMilestoneListeners() {
  document.getElementById('milestone-later').addEventListener('click', () => {
    markMilestoneShown(state.showMilestone);
    state.showMilestone = null;
    render();
  });
  document.getElementById('milestone-share').addEventListener('click', async () => {
    const n = state.showMilestone;
    markMilestoneShown(n);
    try {
      const blob = await drawMilestoneCard(n, new Date().getFullYear());
      await shareBlob(blob, `小書蟲-${n}本里程碑.png`, `第 ${n} 本書`);
    } catch (e) {
      alert(`產生圖卡失敗：${e.message}`);
    }
    state.showMilestone = null;
    render();
  });
}

// ---------- Bookshelf ----------
function matchesSearch(book, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const fields = [
    book.title, book.author, book.publisher,
    book.noteForCard, book.quoteForCard, book.recommendFor,
    book.readingContext, book.aiSummary,
    (book.moodTags || []).join(' '),
  ].filter(Boolean).join(' ').toLowerCase();
  return fields.includes(q);
}

function renderBookshelf() {
  const yearsSet = new Set(allBooks.map(b => new Date(b.dateAdded).getFullYear()));
  yearsSet.add(state.year);
  const years = [...yearsSet].sort((a, b) => b - a);

  const isSearching = !!state.searchQuery.trim();
  // 搜尋時跨年份跨分類找;沒搜尋時走年份+分類篩選
  const filtered = isSearching
    ? allBooks.filter(b => matchesSearch(b, state.searchQuery))
    : allBooks.filter(b => {
        const y = new Date(b.dateAdded).getFullYear();
        return y === state.year && (state.category === '全部' || b.category === state.category);
      });

  const yearChips = years.map(y =>
    `<button class="chip year-chip ${y === state.year ? 'active' : ''}" data-year="${y}">${y}</button>`
  ).join('');

  const catChips = ['全部', ...CATEGORIES].map(c =>
    `<button class="chip cat-chip ${c === state.category ? 'active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`
  ).join('');

  const searchRow = `<div class="search-row">
    <span class="search-icon">🔍</span>
    <input type="search" id="search-input-shelf" placeholder="搜尋書名、作者、心情、隨筆、金句…" value="${escapeHtml(state.searchQuery)}">
    ${isSearching ? '<button class="search-clear" id="search-clear">×</button>' : ''}
  </div>`;

  const searchStatus = isSearching
    ? `<div class="search-status">搜尋「${escapeHtml(state.searchQuery)}」找到 ${filtered.length} 本（跨全部年份/分類）</div>`
    : '';

  const filterChips = isSearching ? '' : `
    <div class="chip-row">${yearChips}</div>
    <div class="chip-row">${catChips}</div>`;

  const emptyHTML = isSearching
    ? `<div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>找不到符合的書</p>
        <p class="small">試試不同的關鍵字</p>
      </div>`
    : `<div class="empty-state">
        <div class="empty-icon">📖</div>
        <p>還沒有書</p>
        <p class="small">按右上角 + 加第一本</p>
      </div>`;

  const cells = filtered.length === 0 ? emptyHTML : filtered.map(renderBookCell).join('');

  return `${renderHeader('小書蟲', '', '<button id="add-book-btn" class="icon-btn">+</button>')}
    ${searchRow}
    ${searchStatus}
    ${filterChips}
    <main class="bookshelf-grid">${cells}</main>
    ${renderNav()}`;
}

function renderBookCell(book) {
  const cover = coverDataURL(book);
  const badge = book.isYearlyPick ? '👑' : (book.isMonthlyPick ? '⭐' : '');
  return `<div class="book-cell" data-id="${book.id}">
    <div class="book-cover">
      ${cover
        ? `<img src="${cover}" alt="${escapeHtml(book.title)}">`
        : `<div class="cover-placeholder">📕</div>`}
      ${badge ? `<span class="cover-badge">${badge}</span>` : ''}
    </div>
    <div class="book-title">${escapeHtml(book.title)}</div>
    ${book.author ? `<div class="book-author">${escapeHtml(book.author)}</div>` : ''}
  </div>`;
}

function attachBookshelfListeners() {
  document.querySelectorAll('.year-chip').forEach(el => {
    el.addEventListener('click', () => {
      state.year = parseInt(el.dataset.year);
      render();
    });
  });
  document.querySelectorAll('.cat-chip').forEach(el => {
    el.addEventListener('click', () => {
      state.category = el.dataset.cat;
      render();
    });
  });
  document.querySelectorAll('.book-cell').forEach(el => {
    el.addEventListener('click', () => {
      state.view = 'detail';
      state.currentBookId = el.dataset.id;
      render();
    });
  });
  document.getElementById('add-book-btn').addEventListener('click', () => {
    state.showAddBook = true;
    render();
  });

  // 搜尋輸入(debounce + re-focus)
  const searchInput = document.getElementById('search-input-shelf');
  if (searchInput) {
    let timer;
    searchInput.addEventListener('input', e => {
      state.searchQuery = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(() => {
        render();
        setTimeout(() => {
          const newInput = document.getElementById('search-input-shelf');
          if (newInput) {
            newInput.focus();
            const len = newInput.value.length;
            newInput.setSelectionRange(len, len);
          }
        }, 0);
      }, 200);
    });
  }
  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.searchQuery = '';
      render();
    });
  }

  attachNavListeners();
}

// ---------- Add Book Modal ----------
let addForm = null;

function renderAddBookModal() {
  return `<div class="modal-overlay" id="add-modal">
    <div class="modal">
      <header class="modal-header">
        <button class="text-btn" id="add-cancel">取消</button>
        <h2>新增書本</h2>
        <button class="text-btn primary" id="add-save" disabled>儲存</button>
      </header>
      <div class="modal-body">
        <section>
          <h3>1. 加封面（推薦）</h3>
          <div id="cover-preview"></div>
          <div class="row" style="gap:8px">
            <label class="btn outline" style="flex:1">
              📷 拍照
              <input type="file" accept="image/*" capture="environment" id="cover-camera" hidden>
            </label>
            <label class="btn outline" style="flex:1">
              🖼️ 選圖
              <input type="file" accept="image/*" id="cover-album" hidden>
            </label>
          </div>
          <button class="btn ghost full" id="ocr-btn" disabled style="margin-top:8px">
            ✨ AI 辨識封面 → 自動填書名
          </button>
          <p class="muted small" style="margin-top:6px">電子書可以截圖封面也行</p>
        </section>

        <section>
          <h3>2. 基本資訊</h3>
          <label>書名 <input type="text" id="f-title"></label>
          <label>作者 <input type="text" id="f-author"></label>
          <label>出版社 <input type="text" id="f-publisher"></label>
          <label>分類
            <select id="f-category">
              ${CATEGORIES.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
            </select>
          </label>
        </section>

        <section>
          <h3>或從 Google Books 搜尋</h3>
          <div class="row">
            <input type="text" id="search-input" placeholder="書名或作者">
            <button class="btn" id="search-btn">🔍</button>
          </div>
          <div id="search-results"></div>
          <p class="muted small" style="margin-top:6px">Google Books 對中文書支援有限，搜不到很正常，建議用上方拍封面</p>
        </section>
      </div>
    </div>
  </div>`;
}

function attachAddBookListeners() {
  addForm = {
    title: '', author: '', publisher: '', category: '其他',
    coverBlob: null, coverURL: null,
  };

  const titleInput = document.getElementById('f-title');
  const authorInput = document.getElementById('f-author');
  const publisherInput = document.getElementById('f-publisher');
  const categorySelect = document.getElementById('f-category');
  const saveBtn = document.getElementById('add-save');
  const preview = document.getElementById('cover-preview');
  const ocrBtn = document.getElementById('ocr-btn');

  const updateForm = () => {
    addForm.title = titleInput.value.trim();
    addForm.author = authorInput.value.trim();
    addForm.publisher = publisherInput.value.trim();
    addForm.category = categorySelect.value;
    saveBtn.disabled = !addForm.title;
  };
  [titleInput, authorInput, publisherInput, categorySelect].forEach(el => {
    el.addEventListener('input', updateForm);
    el.addEventListener('change', updateForm);
  });

  const handleCover = (file) => {
    if (!file) return;
    addForm.coverBlob = file;
    addForm.coverURL = null;
    preview.innerHTML = `<img src="${URL.createObjectURL(file)}" class="cover-thumb">`;
    ocrBtn.disabled = false;
  };
  document.getElementById('cover-camera').addEventListener('change', e => handleCover(e.target.files[0]));
  document.getElementById('cover-album').addEventListener('change', e => handleCover(e.target.files[0]));

  ocrBtn.addEventListener('click', async () => {
    if (!addForm.coverBlob) return;
    ocrBtn.disabled = true;
    ocrBtn.innerHTML = '<span class="spin"></span>AI 辨識中…';
    try {
      const result = await ocrCover(addForm.coverBlob);
      if (result.title) titleInput.value = result.title;
      if (result.author) authorInput.value = result.author;
      if (result.publisher) {
        publisherInput.value = result.publisher;
      } else if (result.title) {
        // 封面看不到出版社 → 背景查 Google Books 補
        ocrBtn.innerHTML = '<span class="spin"></span>查出版社中…';
        const pub = await autoFillPublisher(result.title, result.author);
        if (pub) publisherInput.value = pub;
      }
      updateForm();
      ocrBtn.innerHTML = '✅ 已填入，可微調';
      setTimeout(() => {
        ocrBtn.innerHTML = '✨ 重新辨識';
        ocrBtn.disabled = false;
      }, 1500);
    } catch (e) {
      ocrBtn.innerHTML = `❌ ${e.message.substring(0, 40)}`;
      setTimeout(() => {
        ocrBtn.innerHTML = '✨ AI 辨識封面 → 自動填書名';
        ocrBtn.disabled = false;
      }, 3000);
    }
  });

  // 搜尋
  const doSearch = async () => {
    const q = document.getElementById('search-input').value;
    const div = document.getElementById('search-results');
    div.innerHTML = '<div class="muted small" style="padding:10px 0">搜尋中…</div>';
    try {
      const results = await searchGoogleBooks(q);
      if (!results.length) {
        div.innerHTML = '<div class="muted small" style="padding:10px 0">沒找到，建議改用拍封面 AI 辨識</div>';
        return;
      }
      div.innerHTML = results.map((r, i) => `
        <button class="search-result" data-i="${i}">
          ${r.thumbnail ? `<img src="${r.thumbnail}">` : '<div class="result-no-cover">📕</div>'}
          <div>
            <div class="r-title">${escapeHtml(r.title)}</div>
            <div class="r-author muted">${escapeHtml(r.authors.join(', '))}</div>
          </div>
        </button>
      `).join('');
      div.querySelectorAll('.search-result').forEach(btn => {
        btn.addEventListener('click', () => {
          const r = results[parseInt(btn.dataset.i)];
          titleInput.value = r.title;
          authorInput.value = r.authors.join(', ');
          publisherInput.value = r.publisher;
          addForm.coverURL = r.thumbnail || null;
          addForm.coverBlob = null;
          preview.innerHTML = r.thumbnail
            ? `<img src="${r.thumbnail}" class="cover-thumb">`
            : '';
          ocrBtn.disabled = true;
          updateForm();
        });
      });
    } catch (e) {
      div.innerHTML = `<div class="error">搜尋失敗：${escapeHtml(e.message)}</div>`;
    }
  };
  document.getElementById('search-btn').addEventListener('click', doSearch);
  document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
  });

  document.getElementById('add-cancel').addEventListener('click', () => {
    state.showAddBook = false;
    render();
  });
  saveBtn.addEventListener('click', async () => {
    const book = withDefaults({
      id: uuid(),
      title: addForm.title,
      author: addForm.author,
      publisher: addForm.publisher,
      category: addForm.category,
      coverBlob: addForm.coverBlob,
      coverURL: addForm.coverURL,
      dateAdded: new Date().toISOString(),
      isMonthlyPick: false,
      isYearlyPick: false,
      aiSummary: '',
      summaryStyle: 'bullet',
    });
    await saveBookDB(book);
    state.showAddBook = false;
    // 檢查里程碑
    const total = (await getAllBooksDB()).length;
    const ms = checkMilestone(total);
    if (ms) state.showMilestone = ms;
    render();
  });
}

// ---------- Book Detail ----------
function renderDetail() {
  const b = currentBook;
  const cover = coverDataURL(b);
  const sortedNotes = [...currentNotes].sort((a, b) => new Date(a.dateAdded) - new Date(b.dateAdded));
  const links = buyLinks(b.title, b.author);

  return `${renderHeader('',
    '<button class="text-btn" id="back-btn">← 書架</button>',
    '<button class="icon-btn ghost" id="detail-delete">🗑</button>'
  )}
  <main class="detail">
    <div class="detail-header">
      <div class="detail-cover">
        ${cover ? `<img src="${cover}">` : '<div class="cover-placeholder">📕</div>'}
      </div>
      <div class="detail-info">
        <h2>${escapeHtml(b.title)}</h2>
        ${b.author ? `<p class="muted">${escapeHtml(b.author)}</p>` : ''}
        ${b.publisher ? `<p class="muted small">${escapeHtml(b.publisher)}</p>` : ''}
        <p class="muted small" style="margin-top:8px">${new Date(b.dateAdded).toLocaleDateString('zh-TW')}</p>
      </div>
    </div>

    <div class="pick-row">
      <button class="toggle-btn ${b.isMonthlyPick ? 'on' : ''}" data-pick="monthly">⭐ 月選書</button>
      <button class="toggle-btn ${b.isYearlyPick ? 'on' : ''}" data-pick="yearly">👑 年選書</button>
    </div>

    <section>
      <h3>讀後心情（可多選）</h3>
      <div class="mood-grid">
        ${MOOD_TAGS.map(t => `
          <button class="mood-chip ${b.moodTags.includes(t.name) ? 'on' : ''}" data-mood="${t.name}">
            <span class="mood-emoji">${t.emoji}</span>
            <span>${t.name}</span>
          </button>
        `).join('')}
      </div>
      <label style="margin-top:14px">想推薦給誰
        <input type="text" id="d-recommend" maxlength="${RECOMMEND_MAX}" placeholder="例：給卡在轉職的朋友" value="${escapeHtml(b.recommendFor)}">
      </label>
    </section>

    <section>
      <h3>讀書當下（私人筆記）</h3>
      <p class="muted small" style="margin-bottom:8px">那時你在哪？正在經歷什麼？留給未來的自己回看</p>
      <textarea id="d-context" rows="3" placeholder="例：2025 三月，正在猶豫要不要轉職的那段時間，每天捷運上讀一段…">${escapeHtml(b.readingContext)}</textarea>
    </section>

    <section>
      <div class="row between">
        <h3 style="margin:0">分類</h3>
        <select id="d-category" style="width:auto">
          ${CATEGORIES.map(c => `<option value="${escapeHtml(c)}" ${c === b.category ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        </select>
      </div>
    </section>

    <section>
      <h3>筆記照片</h3>
      <div class="notes-grid">
        ${sortedNotes.map(n =>
          `<div class="note-cell" data-id="${n.id}">
            <img src="${URL.createObjectURL(n.imageBlob)}">
          </div>`
        ).join('')}
        ${currentNotes.length < NOTES_MAX ? `
          <label class="note-cell add-note">
            +
            <input type="file" accept="image/*" multiple id="notes-input" hidden>
          </label>
        ` : ''}
      </div>
      <p class="muted small">${currentNotes.length} / ${NOTES_MAX} 張，強迫精選</p>
    </section>

    <section>
      <div class="row between" style="margin-bottom:8px">
        <h3 style="margin:0">AI 重點整理</h3>
        <div class="segment">
          <button class="seg-btn ${b.summaryStyle === 'bullet' ? 'on' : ''}" data-style="bullet">條列</button>
          <button class="seg-btn ${b.summaryStyle === 'paragraph' ? 'on' : ''}" data-style="paragraph">段落</button>
        </div>
      </div>
      ${b.aiSummary
        ? `<div class="summary-box">${escapeHtml(b.aiSummary)}</div>`
        : '<p class="muted small">拍完筆記後按下方按鈕請 AI 幫你整理（這份摘要只給你自己看，不會出現在分享圖卡上）</p>'}
      <div id="summary-error" class="error"></div>
      <button class="btn primary full" id="summarize-btn" ${currentNotes.length === 0 ? 'disabled' : ''}>
        ✨ ${b.aiSummary ? '重新整理' : '請 AI 整理'}
      </button>
      ${currentNotes.length === 0 ? '<p class="muted small" style="margin-top:6px">需要先加至少一張筆記照片</p>' : ''}
    </section>

    <section>
      <h3>分享用文字</h3>
      <label>隨筆隨記（顯示在圖卡，最多 ${NOTE_FOR_CARD_MAX} 字）
        <textarea id="d-note" maxlength="${NOTE_FOR_CARD_MAX}" rows="2" placeholder="一句話心得、最有感的觀念、想跟誰分享…">${escapeHtml(b.noteForCard)}</textarea>
        <div class="char-count" id="note-count">${countChars(b.noteForCard)} / ${NOTE_FOR_CARD_MAX}</div>
      </label>
      <label>金句（用於金句卡，最多 ${QUOTE_MAX} 字）
        <textarea id="d-quote" maxlength="${QUOTE_MAX}" rows="2" placeholder="書中讓你停下來的那一句">${escapeHtml(b.quoteForCard)}</textarea>
        <div class="char-count" id="quote-count">${countChars(b.quoteForCard)} / ${QUOTE_MAX}</div>
      </label>
      <button class="btn primary full" id="open-share">📤 做圖卡分享</button>
    </section>

    <section class="buy-section">
      <h3>📕 喜歡這本書？</h3>
      <p class="muted small">支持原作者，購買正版書籍</p>
      <div class="buy-links">
        ${links.map(l => `<a href="${l.url}" target="_blank" rel="noopener">${l.name}</a>`).join('')}
      </div>
    </section>

    <div class="spacer"></div>
  </main>
  ${renderNav()}`;
}

function attachDetailListeners() {
  document.getElementById('back-btn').addEventListener('click', () => {
    state.view = 'bookshelf';
    render();
  });

  document.querySelectorAll('.toggle-btn').forEach(el => {
    el.addEventListener('click', async () => {
      if (el.dataset.pick === 'monthly') currentBook.isMonthlyPick = !currentBook.isMonthlyPick;
      else currentBook.isYearlyPick = !currentBook.isYearlyPick;
      await saveBookDB(currentBook);
      render();
    });
  });

  // 心情標籤
  document.querySelectorAll('.mood-chip').forEach(el => {
    el.addEventListener('click', async () => {
      const name = el.dataset.mood;
      const idx = currentBook.moodTags.indexOf(name);
      if (idx >= 0) currentBook.moodTags.splice(idx, 1);
      else currentBook.moodTags.push(name);
      await saveBookDB(currentBook);
      el.classList.toggle('on');
    });
  });

  // 想推薦給誰
  document.getElementById('d-recommend').addEventListener('input', async e => {
    currentBook.recommendFor = e.target.value;
    await saveBookDB(currentBook);
  });

  // 讀書當下
  document.getElementById('d-context').addEventListener('input', async e => {
    currentBook.readingContext = e.target.value;
    await saveBookDB(currentBook);
  });

  document.getElementById('d-category').addEventListener('change', async e => {
    currentBook.category = e.target.value;
    await saveBookDB(currentBook);
  });

  document.querySelectorAll('.seg-btn').forEach(el => {
    el.addEventListener('click', async () => {
      currentBook.summaryStyle = el.dataset.style;
      await saveBookDB(currentBook);
      render();
    });
  });

  // 隨筆隨記、金句
  const noteInput = document.getElementById('d-note');
  const noteCount = document.getElementById('note-count');
  noteInput.addEventListener('input', async e => {
    currentBook.noteForCard = e.target.value;
    noteCount.textContent = `${countChars(e.target.value)} / ${NOTE_FOR_CARD_MAX}`;
    await saveBookDB(currentBook);
  });
  const quoteInput = document.getElementById('d-quote');
  const quoteCount = document.getElementById('quote-count');
  quoteInput.addEventListener('input', async e => {
    currentBook.quoteForCard = e.target.value;
    quoteCount.textContent = `${countChars(e.target.value)} / ${QUOTE_MAX}`;
    await saveBookDB(currentBook);
  });

  const notesInput = document.getElementById('notes-input');
  if (notesInput) {
    notesInput.addEventListener('change', async e => {
      const files = Array.from(e.target.files).slice(0, NOTES_MAX - currentNotes.length);
      for (const f of files) {
        await saveNoteDB({
          id: uuid(),
          bookId: currentBook.id,
          imageBlob: f,
          dateAdded: new Date().toISOString(),
        });
      }
      render();
    });
  }

  document.querySelectorAll('.note-cell:not(.add-note)').forEach(el => {
    el.addEventListener('click', async () => {
      if (confirm('刪除這張筆記？')) {
        await deleteNoteDB(el.dataset.id);
        render();
      }
    });
  });

  document.getElementById('summarize-btn').addEventListener('click', async () => {
    const errDiv = document.getElementById('summary-error');
    const btn = document.getElementById('summarize-btn');
    errDiv.textContent = '';
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>AI 整理中…請稍候';
    try {
      const blobs = [...currentNotes]
        .sort((a, b) => new Date(a.dateAdded) - new Date(b.dateAdded))
        .map(n => n.imageBlob);
      const result = await summarizeNotes(blobs, currentBook.summaryStyle, currentBook.title);
      currentBook.aiSummary = result;
      await saveBookDB(currentBook);
      render();
    } catch (e) {
      errDiv.textContent = e.message;
      btn.disabled = false;
      btn.textContent = '✨ 重試';
    }
  });

  document.getElementById('open-share').addEventListener('click', () => {
    state.showShareCard = true;
    state.shareTemplate = currentBook.quoteForCard ? 'warm' : 'warm';
    render();
  });

  document.getElementById('detail-delete').addEventListener('click', async () => {
    if (confirm(`刪除《${currentBook.title}》？\n所有筆記也會一併刪除。`)) {
      await deleteBookAndNotes(currentBook.id);
      state.view = 'bookshelf';
      state.currentBookId = null;
      render();
    }
  });

  attachNavListeners();
}

// ---------- Yearly Wrap + Settings ----------
function renderPickListItem(book, pickType) {
  const cover = coverDataURL(book);
  const isPicked = pickType === 'monthly' ? book.isMonthlyPick : book.isYearlyPick;
  const pickedClass = isPicked ? (pickType === 'monthly' ? 'picked-m' : 'picked-y') : '';
  return `<div class="pick-row-list ${pickedClass}" data-id="${book.id}" data-type="${pickType}">
    <div class="pick-thumb">
      ${cover ? `<img src="${cover}">` : '<div class="cover-placeholder">📕</div>'}
    </div>
    <div class="pick-info">
      <div class="pick-row-title">${escapeHtml(book.title)}</div>
      ${book.author ? `<div class="muted small">${escapeHtml(book.author)}</div>` : ''}
    </div>
    <div class="pick-action">${isPicked ? '已選' : '選 →'}</div>
  </div>`;
}

function renderYearly() {
  const yearsSet = new Set(allBooks.map(b => new Date(b.dateAdded).getFullYear()));
  yearsSet.add(state.year);
  const years = [...yearsSet].sort((a, b) => b - a);

  const yearBooks = allBooks.filter(b => new Date(b.dateAdded).getFullYear() === state.year);
  const counts = {};
  yearBooks.forEach(b => counts[b.category] = (counts[b.category] || 0) + 1);
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const picks = yearBooks.filter(b => b.isYearlyPick);
  const monthlyPicks = yearBooks.filter(b => b.isMonthlyPick).length;

  const now = new Date();
  const isCurrentYear = state.year === now.getFullYear();
  const currentMonth = now.getMonth();
  const thisMonthBooks = isCurrentYear
    ? yearBooks.filter(b => new Date(b.dateAdded).getMonth() === currentMonth)
    : [];

  const monthlyPickSection = (isCurrentYear && thisMonthBooks.length > 0) ? `
    <section class="card">
      <h3>🌙 ${currentMonth + 1} 月看了 ${thisMonthBooks.length} 本書</h3>
      <p class="muted small" style="margin-bottom:10px">挑一本當月選書 → 直接做分享圖卡</p>
      <div class="pick-list">
        ${thisMonthBooks
          .sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded))
          .map(b => renderPickListItem(b, 'monthly')).join('')}
      </div>
    </section>` : '';

  const yearlyPickSection = yearBooks.length > 0 ? `
    <section class="card">
      <h3>👑 ${state.year} 年看了 ${yearBooks.length} 本書</h3>
      <p class="muted small" style="margin-bottom:10px">挑一本當年選書 → 直接做分享圖卡</p>
      <div class="pick-list">
        ${yearBooks
          .sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded))
          .map(b => renderPickListItem(b, 'yearly')).join('')}
      </div>
    </section>` : '';

  return `${renderHeader('年度回顧')}
    <main class="yearly">
      <div class="segment full">
        ${years.map(y =>
          `<button class="seg-btn ${y === state.year ? 'on' : ''}" data-year="${y}">${y}</button>`
        ).join('')}
      </div>

      <div class="stat-row">
        <div class="stat"><div class="stat-num">${yearBooks.length}</div><div class="stat-label">本書</div></div>
        <div class="stat"><div class="stat-num">${picks.length}</div><div class="stat-label">年選書</div></div>
        <div class="stat"><div class="stat-num">${monthlyPicks}</div><div class="stat-label">月選書</div></div>
      </div>

      ${monthlyPickSection}
      ${yearlyPickSection}

      <section class="card">
        <h3>分類分布</h3>
        ${sorted.length
          ? sorted.map(([c, n]) =>
              `<div class="row between"><span>${escapeHtml(c)}</span><span class="muted">${n} 本</span></div>`
            ).join('')
          : '<p class="muted small">還沒讀任何書</p>'}
      </section>

      <section class="card">
        <h3>精選書單</h3>
        ${picks.length
          ? picks.map(b => `
            <div class="row pick-row-item">
              <span style="font-size:18px">👑</span>
              <div>
                <div>${escapeHtml(b.title)}</div>
                ${b.author ? `<div class="muted small">${escapeHtml(b.author)}</div>` : ''}
              </div>
            </div>
          `).join('')
          : '<p class="muted small">還沒標記任何年選書，去書本詳情頁標記吧</p>'}
      </section>

      <button class="btn primary full" id="share-yearly" ${yearBooks.length === 0 ? 'disabled' : ''}>
        📤 分享年度回顧
      </button>

      <div class="spacer"></div>

      <section class="settings-section">
        <h3>🌐 公開書架網頁</h3>
        <p class="desc">把你的書架做成一個獨立網頁，下載 .html 檔丟到 Cloudflare Pages / Vercel / GitHub Pages 任何一個免費空間，分享網址給朋友。朋友不用裝任何 app 就能看你的書架（含心情、隨筆、金句、購書連結）。</p>
        <button class="btn outline full" id="export-shelf-btn">🌐 產生公開書架網頁</button>
        <p class="muted small" style="margin-top:6px">📌 公開內容不包含 AI 摘要、讀書當下、筆記照片(尊重作者智財 + 保護你個人隱私)</p>
      </section>

      <section class="settings-section">
        <h3>📝 匯出讀書筆記</h3>
        <p class="desc">輸出成 Markdown 文字檔，可在 Bear / Notion / Obsidian 打開，或印出收藏。</p>
        <button class="btn outline full" id="export-md-btn">📝 匯出 .md 讀書筆記</button>
      </section>

      <section class="settings-section">
        <h3>💾 備份 / 還原</h3>
        <p class="desc">資料只存在這個瀏覽器，清快取或換裝置會不見。定期備份保平安。</p>
        <button class="btn outline full" id="export-btn">📥 匯出全部資料(JSON, 可還原)</button>
        <label class="btn outline full" style="margin-top:8px">
          📤 從備份還原
          <input type="file" accept="application/json,.json" id="import-input" hidden>
        </label>
        <div id="import-msg" class="muted small" style="margin-top:8px"></div>
      </section>

      <section class="settings-section">
        <h3>📖 關於</h3>
        <p class="desc">小書蟲是私人讀書筆記。AI 整理的摘要只給你自己看，不會出現在分享圖卡上。讀到喜歡的書，記得買正版支持作者。</p>
      </section>

      <div class="spacer"></div>
    </main>
    ${renderNav()}`;
}

function attachYearlyListeners() {
  document.querySelectorAll('.seg-btn[data-year]').forEach(el => {
    el.addEventListener('click', () => {
      state.year = parseInt(el.dataset.year);
      render();
    });
  });
  document.getElementById('share-yearly').addEventListener('click', () => {
    state.showShareCard = true;
    state.shareTemplate = 'yearly';
    render();
  });

  // 選書清單：點一本 → 標記為月/年選書 → 立刻開分享圖卡
  document.querySelectorAll('.pick-row-list').forEach(el => {
    el.addEventListener('click', async () => {
      const bookId = el.dataset.id;
      const pickType = el.dataset.type;
      const book = await getBookDB(bookId);
      if (!book) return;
      const withDef = withDefaults(book);
      if (pickType === 'monthly') withDef.isMonthlyPick = true;
      else withDef.isYearlyPick = true;
      await saveBookDB(withDef);
      currentBook = withDef;
      state.currentBookId = bookId;
      state.showShareCard = true;
      state.shareTemplate = 'warm';
      render();
    });
  });

  document.getElementById('export-btn').addEventListener('click', async () => {
    try {
      await exportData();
    } catch (e) {
      alert(`匯出失敗：${e.message}`);
    }
  });

  document.getElementById('export-md-btn').addEventListener('click', async () => {
    try {
      await exportMarkdown();
      toast('✅ 已下載 .md 檔');
    } catch (e) {
      alert(`匯出失敗：${e.message}`);
    }
  });

  document.getElementById('export-shelf-btn').addEventListener('click', async () => {
    const btn = document.getElementById('export-shelf-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>產生中…(封面要壓縮)';
    try {
      await exportPublicShelf();
      toast('✅ 已下載 .html 檔');
    } catch (e) {
      alert(`產生失敗：${e.message}`);
    }
    btn.disabled = false;
    btn.innerHTML = '🌐 產生公開書架網頁';
  });

  document.getElementById('import-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const msg = document.getElementById('import-msg');
    if (!confirm('還原會把備份裡的書加進現有資料（同 id 會覆蓋）。確定要繼續？')) {
      e.target.value = '';
      return;
    }
    msg.textContent = '還原中…';
    try {
      const r = await importData(file);
      msg.innerHTML = `<span style="color:green">✅ 還原 ${r.bookCount} 本書、${r.noteCount} 張筆記</span>`;
      setTimeout(render, 1200);
    } catch (err) {
      msg.innerHTML = `<span class="error">❌ ${err.message}</span>`;
    }
    e.target.value = '';
  });

  attachNavListeners();
}

// ---------- Share Card Modal ----------
let currentCardBlob = null;

function renderShareCardModal() {
  const isYearly = state.shareTemplate === 'yearly';

  if (isYearly) {
    return `<div class="modal-overlay" id="share-modal">
      <div class="modal share-modal">
        <header class="modal-header">
          <button class="text-btn" id="share-close">關閉</button>
          <h2>${state.year} 年度回顧</h2>
          <div></div>
        </header>
        <div class="modal-body share-body">
          <div class="share-preview" id="share-preview"><div class="muted">產生中…</div></div>
          <button class="btn primary full" id="share-now" disabled>📤 分享 / 下載</button>
        </div>
      </div>
    </div>`;
  }

  const hasQuote = !!(currentBook && currentBook.quoteForCard);

  return `<div class="modal-overlay" id="share-modal">
    <div class="modal share-modal">
      <header class="modal-header">
        <button class="text-btn" id="share-close">關閉</button>
        <h2>分享圖卡</h2>
        <div></div>
      </header>
      <div class="modal-body share-body">
        <div class="template-selector">
          ${TEMPLATES.map(t => `
            <button class="template-btn ${state.shareTemplate === t.id ? 'on' : ''}"
                    data-template="${t.id}"
                    ${t.id === 'quote' && !hasQuote ? 'disabled title="先填金句"' : ''}>
              ${t.name}
            </button>
          `).join('')}
        </div>
        <div class="share-preview" id="share-preview"><div class="muted">產生中…</div></div>
        <div class="share-actions">
          <button class="btn primary" id="share-now" disabled>📤 分享圖卡</button>
          <button class="btn outline" id="share-copy">📋 複製文案</button>
        </div>
        <p class="muted small" style="text-align:center">分享文案附博客來連結，看到的人可以直接購書<br>iPhone 分享圖卡後選 IG / Line / 儲存照片</p>
      </div>
    </div>
  </div>`;
}

async function attachShareCardListeners() {
  document.getElementById('share-close').addEventListener('click', () => {
    state.showShareCard = false;
    state.shareTemplate = 'warm';
    currentCardBlob = null;
    render();
  });

  // template 切換
  document.querySelectorAll('.template-btn').forEach(el => {
    el.addEventListener('click', async () => {
      if (el.disabled) return;
      state.shareTemplate = el.dataset.template;
      document.querySelectorAll('.template-btn').forEach(b => b.classList.remove('on'));
      el.classList.add('on');
      await renderSharePreview();
    });
  });

  // 複製分享文案(只給單本書，年度回顧不適用)
  const copyBtn = document.getElementById('share-copy');
  if (copyBtn) {
    if (state.shareTemplate === 'yearly' || !currentBook) {
      copyBtn.style.display = 'none';
    } else {
      copyBtn.addEventListener('click', async () => {
        const ok = await copyShareCaption(currentBook);
        toast(ok ? '✅ 文案已複製，可貼到 IG / Threads / Line' : '❌ 複製失敗，請手動複製');
      });
    }
  }

  await renderSharePreview();
}

async function renderSharePreview() {
  const preview = document.getElementById('share-preview');
  const shareBtn = document.getElementById('share-now');
  preview.innerHTML = '<div class="muted"><span class="spin"></span>產生中…</div>';
  shareBtn.disabled = true;

  try {
    let blob, filename, title;
    if (state.shareTemplate === 'yearly') {
      const yearBooks = allBooks.filter(b => new Date(b.dateAdded).getFullYear() === state.year);
      blob = await generateYearlyCard(state.year, yearBooks);
      filename = `${state.year}-年度回顧.png`;
      title = `${state.year} 年度閱讀回顧`;
    } else if (currentBook) {
      blob = await generateCardForTemplate(currentBook, state.shareTemplate);
      const tmplName = (TEMPLATES.find(t => t.id === state.shareTemplate) || {}).name || '';
      filename = `${currentBook.title}-${tmplName}.png`;
      title = currentBook.title;
    }

    if (blob) {
      currentCardBlob = blob;
      const url = URL.createObjectURL(blob);
      preview.innerHTML = `<img src="${url}">`;
      shareBtn.disabled = false;
      shareBtn.onclick = () => shareBlob(blob, filename, title);
    }
  } catch (e) {
    preview.innerHTML = `<div class="error">產生失敗：${escapeHtml(e.message)}</div>`;
  }
}

// ============================================================
// Init
// ============================================================
(async () => {
  try {
    await openDB();
    if (!localStorage.getItem(WELCOME_KEY)) {
      state.showWelcome = true;
    }
    await render();
  } catch (e) {
    document.getElementById('app').innerHTML =
      `<div style="padding:40px;text-align:center;color:#c44">啟動失敗：${escapeHtml(e.message)}</div>`;
  }
})();
