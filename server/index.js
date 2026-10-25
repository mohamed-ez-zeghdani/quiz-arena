import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json({ limit: '100kb' }));

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DB = new URL('./data.json', import.meta.url);

if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
  console.error('Set ADMIN_PASSWORD to a secret of at least 12 characters.');
  process.exit(1);
}

const initialState = {
  roomCode: '',
  question: null,
  round: 0,
  answers: [],
  results: {},
  scores: {},
  participants: [],
  nextAnswerId: 1,
  leaderboardVisible: true,
  finalAnnouncement: null
};

let state = { ...initialState };
let queue = Promise.resolve();

async function loadState() {
  try {
    state = {
      ...initialState,
      ...JSON.parse(await readFile(DB, 'utf8'))
    };
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    await saveState();
  }
}

function saveState() {
  const snapshot = JSON.stringify(state, null, 2);

  queue = queue.then(async () => {
    const temp = new URL('./data.tmp', import.meta.url);
    await writeFile(temp, snapshot, { mode: 0o600 });
    await rename(temp, DB);
  });

  return queue;
}

function publicState() {
  return structuredClone(state);
}

function broadcast() {
  io.emit('state', publicState());
}

function adminOnly(req, res, next) {
  if (req.get('x-admin-password') !== ADMIN_PASSWORD) {
    return res.status(401).json({
      error: 'كلمة مرور المشرف غير صحيحة'
    });
  }
  next();
}

function validName(name) {
  return typeof name === 'string' &&
    name.trim().length >= 2 &&
    name.trim().length <= 24;
}

function validRoomCode(code) {
  return typeof code === 'string' &&
    code.trim().toUpperCase() === state.roomCode &&
    state.roomCode.length > 0;
}

app.get('/api/state', (_req, res) => {
  res.json(publicState());
});

/* إظهار أو إخفاء لوحة المتصدرين للاعبين */
app.post('/api/admin/leaderboard-visibility', adminOnly, async (req, res) => {
  if (typeof req.body.visible !== 'boolean') {
    return res.status(400).json({ error: 'قيمة الظهور غير صحيحة' });
  }

  state.leaderboardVisible = req.body.visible;
  await saveState();
  broadcast();

  res.json({ ok: true, state: publicState() });
});

/* التحقق من كلمة مرور المشرف قبل فتح لوحة الإدارة */
app.post('/api/admin/verify', adminOnly, (_req, res) => {
  res.json({ ok: true });
});

/* إنشاء غرفة جديدة */
app.post('/api/admin/room', adminOnly, async (_req, res) => {
  state = {
    ...initialState,
    roomCode: randomBytes(3).toString('hex').toUpperCase()
  };

  await saveState();
  broadcast();

  res.json({
    ok: true,
    roomCode: state.roomCode,
    state: publicState()
  });
});

/* انضمام اللاعب بكود الغرفة */
app.post('/api/join', async (req, res) => {
  const name = validName(req.body.name)
    ? req.body.name.trim()
    : '';

  const roomCode = typeof req.body.roomCode === 'string'
    ? req.body.roomCode.trim().toUpperCase()
    : '';

  if (!state.roomCode) {
    return res.status(409).json({
      error: 'لم ينشئ المشرف غرفة بعد'
    });
  }

  if (!validRoomCode(roomCode)) {
    return res.status(403).json({
      error: 'كود الغرفة غير صحيح'
    });
  }

  if (!name) {
    return res.status(400).json({
      error: 'الاسم يجب أن يتكون من حرفين على الأقل'
    });
  }

  const existingName = state.participants.find(
    p => p.toLowerCase() === name.toLowerCase()
  );

  if (existingName) {
    return res.json({
      ok: true,
      name: existingName,
      state: publicState()
    });
  }

  state.participants.push(name);
  state.scores[name] = 0;

  await saveState();
  broadcast();

  res.json({
    ok: true,
    name,
    state: publicState()
  });
});

/* إنهاء المسابقة وإعلان الفائزين */
app.post('/api/admin/finalize', adminOnly, async (req, res) => {
  if (!state.roomCode) {
    return res.status(409).json({ error: 'أنشئ غرفة أولاً.' });
  }

  if (state.finalAnnouncement?.ended) {
    return res.status(409).json({ error: 'المسابقة منتهية بالفعل.' });
  }

  const rawWinners = Array.isArray(req.body.winners) ? req.body.winners : [];
  const winners = [...new Set(
    rawWinners
      .filter(n => typeof n === 'string')
      .map(n => n.trim())
      .filter(Boolean)
  )];

  if (winners.length === 0) {
    return res.status(400).json({
      error: 'اختر فائزاً واحداً على الأقل قبل إنهاء المسابقة.'
    });
  }

  const invalidNames = winners.filter(
    name => !state.participants.includes(name)
  );

  if (invalidNames.length > 0) {
    return res.status(400).json({
      error: 'بعض الأسماء المختارة ليست ضمن المشاركين الحاليين.'
    });
  }

  state.finalAnnouncement = {
    ended: true,
    winners,
    endedAt: new Date().toISOString()
  };

  await saveState();
  broadcast();

  res.json({ ok: true, state: publicState() });
});

/* نشر سؤال */
app.post('/api/admin/question', adminOnly, async (req, res) => {
  const question = typeof req.body.question === 'string'
    ? req.body.question.trim()
    : '';

  if (!state.roomCode) {
    return res.status(409).json({
      error: 'أنشئ غرفة أولاً'
    });
  }

  if (state.finalAnnouncement?.ended) {
    return res.status(409).json({
      error: 'انتهت المسابقة. أنشئ غرفة جديدة لبدء مسابقة أخرى.'
    });
  }

  if (!question || question.length > 1000) {
    return res.status(400).json({
      error: 'السؤال غير صالح'
    });
  }

  state.round += 1;
  state.question = question;
  state.answers = [];
  state.results = {};

  await saveState();
  broadcast();

  res.json({ ok: true, state: publicState() });
});

/* إرسال إجابة */
app.post('/api/answer', async (req, res) => {
  const name = validName(req.body.name)
    ? req.body.name.trim()
    : '';

  const answer = typeof req.body.answer === 'string'
    ? req.body.answer.trim()
    : '';

  const roomCode = typeof req.body.roomCode === 'string'
    ? req.body.roomCode.trim().toUpperCase()
    : '';

  if (!validRoomCode(roomCode)) {
    return res.status(403).json({
      error: 'كود الغرفة غير صحيح'
    });
  }

  if (state.finalAnnouncement?.ended) {
    return res.status(409).json({
      error: 'انتهت المسابقة بالفعل.'
    });
  }

  if (!name || !answer || answer.length > 2000) {
    return res.status(400).json({
      error: 'الاسم أو الإجابة غير صالح'
    });
  }

  if (!state.participants.includes(name)) {
    return res.status(403).json({
      error: 'انضم إلى الغرفة قبل الإجابة'
    });
  }

  if (!state.question) {
    return res.status(409).json({
      error: 'انتظر حتى ينشر المشرف السؤال'
    });
  }

  if (state.results[name]) {
    return res.status(409).json({
      error: 'تم نشر نتيجة هذه الجولة بالفعل'
    });
  }

  if (state.answers.some(a => a.name === name)) {
    return res.status(409).json({
      error: 'لقد أرسلت إجابتك بالفعل'
    });
  }

  state.answers.push({
    id: state.nextAnswerId++,
    name,
    answer,
    round: state.round,
    submittedAt: new Date().toISOString()
  });

  await saveState();
  broadcast();

  res.json({ ok: true, state: publicState() });
});

/* اعتماد الإجابة الصحيحة */
app.post('/api/admin/result', adminOnly, async (req, res) => {
  const rawIds = Array.isArray(req.body.correctAnswerIds)
    ? req.body.correctAnswerIds
    : [req.body.correctAnswerId];

  const correctIds = [...new Set(
    rawIds.map(id => Number(id)).filter(Number.isFinite)
  )];

  if (correctIds.length === 0) {
    return res.status(400).json({
      error: 'اختر إجابة صحيحة واحدة على الأقل'
    });
  }

  const submittedIds = new Set(state.answers.map(a => Number(a.id)));
  const invalidIds = correctIds.filter(id => !submittedIds.has(id));

  if (invalidIds.length > 0) {
    console.error('معرّفات إجابات غير موجودة:', invalidIds);
    console.error('معرّفات الإجابات الحالية:', [...submittedIds]);
    return res.status(400).json({
      error: 'بعض الإجابات المختارة لم تعد موجودة. حدّث الصفحة وحاول مجدداً.'
    });
  }

  const correctSet = new Set(correctIds);

  state.results = Object.fromEntries(
    state.answers.map(a => [
      a.name,
      correctSet.has(Number(a.id)) ? 'correct' : 'wrong'
    ])
  );

  await saveState();
  broadcast();

  res.json({ ok: true, state: publicState() });
});

/* إضافة النقاط */
app.post('/api/admin/points', adminOnly, async (req, res) => {
  const rawNames = Array.isArray(req.body.names)
    ? req.body.names
    : [req.body.name];

  const names = [...new Set(
    rawNames
      .filter(n => typeof n === 'string')
      .map(n => n.trim())
      .filter(Boolean)
  )];

  const points = req.body.points;

  if (
    names.length === 0 ||
    !Number.isSafeInteger(points) ||
    points < 0 ||
    points > 1000
  ) {
    return res.status(400).json({
      error: 'اختر لاعباً واحداً على الأقل وأدخل نقاطاً صحيحة من 0 إلى 1000'
    });
  }

  const invalidNames = names.filter(
    name => !state.participants.includes(name)
  );

  if (invalidNames.length > 0) {
    return res.status(400).json({
      error: 'بعض اللاعبين المختارين غير موجودين في الغرفة الحالية'
    });
  }

  for (const name of names) {
    state.scores[name] = (state.scores[name] || 0) + points;
  }

  await saveState();
  broadcast();

  res.json({
    ok: true,
    updated: names.length,
    state: publicState()
  });
});

io.on('connection', socket => {
  socket.emit('state', publicState());
});

await loadState();

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Quiz server running on port ${PORT}`);
});
