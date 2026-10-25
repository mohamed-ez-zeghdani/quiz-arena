import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import {
  Trophy, Users, Zap, Send, ShieldCheck, CircleHelp,
  CheckCircle2, XCircle, Crown, Radio, RefreshCw,
  DoorOpen, Copy
} from 'lucide-react'
import './index.css'

const API = `http://${location.hostname}:3000`
const socket = io(API, { autoConnect: false })

type Data = {
  roomCode?: string
  question?: any
  participants?: any[]
  answers?: any[]
  results?: Record<string, any>
  scores?: Record<string, number>
  round?: number
  [key: string]: any
}

export default function App() {
  const [data, setData] = useState<Data>({})
  const [name, setName] = useState(() => localStorage.getItem('qa_player_name') || '')
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem('qa_room_code') || '')
  const [joined, setJoined] = useState(() => sessionStorage.getItem('qa_admin_mode') === 'true')
  const [answer, setAnswer] = useState('')
  const [question, setQuestion] = useState('')
  const [adminPassword, setAdminPassword] = useState(() => sessionStorage.getItem('qa_admin_password') || '')
  const [correctIds, setCorrectIds] = useState<string[]>([])
  const [points, setPoints] = useState('10')
  const [target, setTarget] = useState('')
  const [selectedPointPlayers, setSelectedPointPlayers] = useState<string[]>([])
  const [selectedWinners, setSelectedWinners] = useState<string[]>([])
  const [adminMode, setAdminMode] = useState(() => sessionStorage.getItem('qa_admin_mode') === 'true')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [finalRevealedKey, setFinalRevealedKey] = useState('')
  const finalAudioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (localStorage.getItem('qa_role') === 'player') {
      sessionStorage.removeItem('qa_admin_mode');
      sessionStorage.removeItem('qa_admin_password');
      setAdminMode(false);
      setJoined(false);
    } else if (sessionStorage.getItem('qa_admin_mode') === 'true') {
      setAdminMode(true);
      setJoined(true);
      setName('المشرف');
      return;
    } else {
      setAdminMode(false);
      setJoined(false);
      return;
    }

    if (localStorage.getItem('qa_role') !== 'player') return;

    const savedName = localStorage.getItem('qa_player_name') || '';
    const savedRoom = localStorage.getItem('qa_room_code') || '';

    if (!savedName || !savedRoom) {
      localStorage.removeItem('qa_role');
      setJoined(false);
      return;
    }

    fetch(`${API}/api/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: savedName, roomCode: savedRoom })
    })
      .then(async response => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'تعذرت استعادة الجلسة');
        setName(result.name || savedName);
        setRoomCode(savedRoom);
        setJoined(true);
        if (result.state) setData(result.state);
      })
      .catch(() => {
        localStorage.removeItem('qa_role');
        setJoined(false);
        setMessage('تعذرت استعادة الجلسة. تحقق من اتصال السيرفر والغرفة.');
      });
  }, []);

  useEffect(() => {
    socket.connect()

    const onState = (next: Data) => setData(next || {})
    socket.on('state', onState)

    fetch(`${API}/api/state`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setMessage('تعذر الاتصال بالسيرفر. تأكد أنه يعمل في Termux.'))

    return () => {
      socket.off('state', onState)
      socket.disconnect()
    }
  }, [])

  async function request(
    path: string,
    body: object,
    admin = false
  ): Promise<any> {
    const preservedScrollY = window.scrollY
    setBusy(true)
    setMessage('')

    try {
      const response = await fetch(`${API}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(admin ? { 'x-admin-password': adminPassword } : {})
        },
        body: JSON.stringify(body)
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(result.error || 'حدث خطأ')
      }

      if (result.state) setData(result.state)
      else {
        const latest = await fetch(`${API}/api/state`)
        if (latest.ok) setData(await latest.json())
      }

      return result
    } catch (e: any) {
      setMessage(e.message || 'تعذر تنفيذ العملية')
      return null
    } finally {
      setBusy(false)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo(0, preservedScrollY)
        })
      })
    }
  }

  const currentQuestion = typeof data.question === 'string'
    ? data.question
    : data.question?.text || data.question?.question || ''

  const participants = Array.isArray(data.participants)
    ? data.participants : []
  const answers = Array.isArray(data.answers) ? data.answers : []
  const results = data.results || {}
  const scores = data.scores || {}

  function participantName(item: any) {
    return typeof item === 'string' ? item : item?.name || 'مشارك'
  }

  function answerName(item: any) {
    return item?.name || item?.participant || 'مشارك'
  }

  function answerText(item: any) {
    return item?.answer ?? item?.text ?? ''
  }

  async function join() {
    const clean = name.trim()
    const code = roomCode.trim().toUpperCase()

    if (clean.length < 2) {
      setMessage('اكتب اسماً من حرفين على الأقل')
      return
    }

    if (!code) {
      setMessage('أدخل كود الغرفة الذي أعطاك المشرف')
      return
    }

    const result = await request('/api/join', {
      name: clean,
      roomCode: code
    })

    if (result) {
      const playerName = result.name || clean;
      localStorage.setItem('qa_player_name', playerName);
      localStorage.setItem('qa_room_code', code);
      localStorage.setItem('qa_role', 'player');
      sessionStorage.removeItem('qa_admin_mode');
      sessionStorage.removeItem('qa_admin_password');
      setAdminMode(false);
      setName(playerName);
      setRoomCode(code);
      setJoined(true);
      setMessage('مرحباً بك في ساحة التحدي!');
    }
  }

  async function createRoom() {
    const result = await request('/api/admin/room', {}, true)

    if (result) {
      setCorrectIds([])
      setSelectedWinners([])
      setMessage(`تم إنشاء الغرفة. كودها: ${result.roomCode}`)
    }
  }

  async function publishQuestion() {
    if (!question.trim()) {
      setMessage('اكتب السؤال أولاً')
      return
    }

    const result = await request(
      '/api/admin/question',
      { question: question.trim() },
      true
    )

    if (result) {
      setQuestion('')
      setCorrectIds([])
      setAnswer('')
      setMessage('تم نشر السؤال للمشاركين')
    }
  }

  async function submitAnswer() {
    if (!answer.trim()) {
      setMessage('اكتب إجابتك أولاً')
      return
    }

    const result = await request('/api/answer', {
      name: name.trim(),
      answer: answer.trim(),
      roomCode: roomCode.trim().toUpperCase()
    })

    if (result) {
      setAnswer('')
      setMessage('تم إرسال إجابتك بنجاح')
    }
  }

  async function publishResult() {
    if (correctIds.length === 0) {
      setMessage('اختر إجابة صحيحة واحدة على الأقل')
      return
    }

    const result = await request(
      '/api/admin/result',
      { correctAnswerIds: correctIds.map(Number) },
      true
    )

    if (result) setMessage('تم نشر النتائج')
  }

  async function awardPoints() {
    const names = selectedPointPlayers.length > 0
      ? selectedPointPlayers
      : (target.trim() ? [target.trim()] : [])

    if (names.length === 0) {
      setMessage('اختر لاعباً واحداً على الأقل')
      return
    }

    const value = Number(points)

    if (!Number.isSafeInteger(value) || value < 0 || value > 1000) {
      setMessage('أدخل عدداً صحيحاً للنقاط من 0 إلى 1000')
      return
    }

    const result = await request(
      '/api/admin/points',
      { names, points: value },
      true
    )

    if (result) {
      setMessage(`تمت إضافة ${value} نقطة إلى ${names.length} لاعب`)
      setSelectedPointPlayers([])
      setTarget('')
    }
  }

  async function loginAdmin() {
    if (busy) return

    if (adminPassword.length < 12) {
      setMessage('كلمة مرور المشرف غير صحيحة')
      return
    }

    const result = await request('/api/admin/verify', {}, true)
    if (!result) return

    sessionStorage.setItem('qa_admin_mode', 'true')
    sessionStorage.setItem('qa_admin_password', adminPassword)
    setAdminMode(true)
    setJoined(true)
    setName('المشرف')
  }

  async function finalizeQuiz() {
    if (selectedWinners.length === 0) {
      setMessage('اختر فائزاً واحداً على الأقل')
      return
    }

    if (!window.confirm('هل تريد إنهاء المسابقة الآن؟ لن يمكن نشر أسئلة جديدة في هذه الغرفة.')) {
      return
    }

    const result = await request(
      '/api/admin/finalize',
      { winners: selectedWinners },
      true
    )

    if (result) {
      setMessage('انتهت المسابقة وتم إعلان الفائزين')
    }
  }

  function scoreFor(n: string) {
    return Number(scores[n] ?? scores[n?.toLowerCase?.()] ?? 0)
  }

  const leaderboard = [...participants].sort(
    (a, b) => scoreFor(participantName(b)) - scoreFor(participantName(a))
  )

  const myResult = results[name] ?? results[name.toLowerCase()]
  const resultIsCorrect = myResult === true || myResult === 'correct' ||
    myResult?.correct === true || myResult?.status === 'correct'

  const resultRound = data.round ?? 0
  const resultKey = `${data.roomCode ?? ''}:${name.toLowerCase()}:${resultRound}:${String(myResult ?? '')}`
  const [dismissedResultKey, setDismissedResultKey] = useState(() => sessionStorage.getItem('quiz-arena-dismissed-result') ?? '')
  const finalAnnouncement = data.finalAnnouncement
  const isFinalWinner = Array.isArray(finalAnnouncement?.winners) &&
    finalAnnouncement.winners.some((winner: string) =>
      winner.toLowerCase() === name.toLowerCase()
    )
  const finalResultKey = `${data.roomCode ?? ''}:${finalAnnouncement?.endedAt ?? ''}:${name.toLowerCase()}`
  const finalReadyToReveal = !adminMode && joined && finalAnnouncement?.ended === true
  const showFinalAnnouncement = finalReadyToReveal && finalRevealedKey === finalResultKey

  const showFullscreenResult =
    !adminMode &&
    finalAnnouncement?.ended !== true &&
    joined &&
    myResult !== undefined &&
    myResult !== null &&
    dismissedResultKey !== resultKey

  useEffect(() => {
    if (
      adminMode ||
      !joined ||
      myResult === undefined ||
      myResult === null ||
      dismissedResultKey === resultKey
    ) {
      return
    }


    const audio = new Audio(
      resultIsCorrect ? '/audio/correct.mp3' : '/audio/wrong.mp3'
    )

    audio.play().catch(() => {
      // يمكن أن يمنع المتصفح التشغيل التلقائي للصوت.
    })

    return () => {
      audio.pause()
      audio.currentTime = 0
    }
  }, [myResult, resultIsCorrect, resultKey, adminMode, joined, dismissedResultKey])

  function copyRoomCode() {
    if (!data.roomCode) return

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(data.roomCode)
        .then(() => setMessage('تم نسخ كود الغرفة'))
        .catch(() => setMessage(`كود الغرفة: ${data.roomCode}`))
    } else {
      setMessage(`كود الغرفة: ${data.roomCode}`)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <Zap size={22} fill="currentColor" />
          </div>
          <div>
            <strong>QUIZ<span>ARENA</span></strong>
            <small>PLAY SMART. WIN BIG.</small>
          </div>
        </div>
        <div className="live-pill"><i /> LIVE SESSION</div>
      </header>

      {!joined && !adminMode ? (
        <section className="welcome">
          <div className="eyebrow">
            <Radio size={15} /> MULTIPLAYER QUIZ EXPERIENCE
          </div>
          <h1>أثبت ذكاءك.<br /><span>تصدّر المنافسة.</span></h1>
          <p className="muted">
            أدخل اسمك وكود الغرفة للانضمام إلى التحدي المباشر.
          </p>

          <div className="join-card">
            <div className="card-symbol"><Users size={24} /></div>
            <h2>دخول اللاعبين</h2>

            <label htmlFor="player-name">اسم اللاعب</label>
            <input
              id="player-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="اكتب اسمك هنا..."
              maxLength={24}
              onKeyDown={e => e.key === 'Enter' && join()}
            />

            <label htmlFor="room-code">كود الغرفة</label>
            <input
              id="room-code"
              value={roomCode}
              onChange={e => setRoomCode(e.target.value.toUpperCase())}
              placeholder="مثال: A3F9B2"
              maxLength={6}
              autoCapitalize="characters"
              onKeyDown={e => e.key === 'Enter' && join()}
            />

            <button className="primary-btn" disabled={busy} onClick={join}>
              دخول الساحة <Send size={17} />
            </button>

            <button className="text-btn" onClick={() => setAdminMode(true)}>
              <ShieldCheck size={16} /> دخول المشرف
            </button>
          </div>
        </section>
      ) : adminMode && !joined ? (
        <section className="welcome">
          <div className="join-card">
            <div className="card-symbol"><ShieldCheck size={24} /></div>
            <h2>لوحة المشرف</h2>
            <p className="muted">أدخل كلمة مرور المشرف للمتابعة.</p>

            <label htmlFor="admin-password">كلمة المرور</label>
            <input
              id="admin-password"
              type="password"
              value={adminPassword}
              onChange={e => setAdminPassword(e.target.value)}
              placeholder="كلمة مرور المشرف"
              onKeyDown={e => {
                if (e.key === 'Enter') void loginAdmin()
              }}
            />

            <button
              className="primary-btn"
              onClick={() => void loginAdmin()}
              disabled={busy}
            >
              {busy ? 'جارٍ التحقق...' : 'فتح لوحة التحكم'}
              <ShieldCheck size={17} />
            </button>

            <button className="text-btn" onClick={() => setAdminMode(false)}>
              العودة
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="dashboard-heading">
            <div>
              <div className="eyebrow">
                <i className="tiny-dot" /> ARENA CONTROL CENTER
              </div>
              <h1>{adminMode ? 'لوحة التحكم' : `أهلاً، ${name}`}</h1>
              <p className="muted">
                {adminMode
                  ? 'أنشئ الغرفة وأدر الجولة وتابع إجابات اللاعبين.'
                  : 'ركّز جيداً، كل إجابة قد تغيّر ترتيبك.'}
              </p>
            </div>
            <div className="avatar">
              {adminMode ? <ShieldCheck /> : name.slice(0, 1).toUpperCase()}
            </div>
          </section>

          <section className="stats-grid">
            <div className="stat-card">
              <Users /><span>اللاعبون</span><strong>{participants.length}</strong>
            </div>
            <div className="stat-card">
              <CircleHelp /><span>الإجابات</span><strong>{answers.length}</strong>
            </div>
            <div className="stat-card">
              <Trophy /><span>{adminMode ? 'حالة الغرفة' : 'نقاطي'}</span>
              <strong>{adminMode ? (data.roomCode ? 'جاهزة' : 'غير منشأة') : scoreFor(name)}</strong>
            </div>
          </section>

          {adminMode ? (
            <section className="panel">
              <div className="panel-title">
                <div>
                  <span className="section-kicker">ROOM MANAGEMENT</span>
                  <h2>الغرفة</h2>
                </div>
                <span className="tag">ADMIN</span>
              </div>

              {data.roomCode ? (
                <div className="room-code-card">
                  <span>كود مشاركة اللاعبين</span>
                  <strong>{data.roomCode}</strong>
                  <button className="secondary-btn" onClick={copyRoomCode}>
                    <Copy size={16} /> نسخ الكود
                  </button>
                </div>
              ) : (
                <div className="empty-state">أنشئ غرفة حتى يتمكن اللاعبون من الدخول.</div>
              )}

              <button className="primary-btn" disabled={busy} onClick={createRoom}>
                <DoorOpen size={17} /> إنشاء غرفة جديدة
              </button>

              <div className="separator" />

              <div className="panel-title">
                <div>
                  <span className="section-kicker">ROUND MANAGEMENT</span>
                  <h2>إدارة الجولة</h2>
                </div>
              </div>

              <label>السؤال الجديد</label>
              <textarea
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="اكتب السؤال الذي سيظهر للجميع..."
                rows={3}
              />
              <button
                className="primary-btn"
                disabled={busy || !data.roomCode}
                onClick={publishQuestion}
              >
                نشر السؤال <Send size={17} />
              </button>

              <div className="separator" />

              <div className="panel-title">
                <div>
                  <span className="section-kicker">LIVE RESPONSES</span>
                  <h2>إجابات اللاعبين</h2>
                </div>
                <span className="count">{answers.length}</span>
              </div>

              {answers.length === 0 ? (
                <div className="empty-state">لم تصل أي إجابات بعد.</div>
              ) : answers.map((item, i) => {
                const id = String(item.id)
                return (
                  <button
                    key={id}
                    className={`answer-row ${correctIds.includes(id) ? 'selected' : ''}`}
                    onClick={() => setCorrectIds(prev =>
                      prev.includes(id)
                        ? prev.filter(value => value !== id)
                        : [...prev, id]
                    )}
                  >
                    <span className="answer-number">{i + 1}</span>
                    <span className="answer-content">
                      <strong>{answerName(item)}</strong>
                      <small>{String(answerText(item))}</small>
                    </span>
                    <span className="select-mark">
                      {correctIds.includes(id) ? <CheckCircle2 /> : '○'}
                    </span>
                  </button>
                )
              })}

              <button
                className="primary-btn"
                disabled={busy || correctIds.length === 0}
                onClick={publishResult}
              >
                اعتماد الإجابات الصحيحة ونشر النتيجة <Trophy size={17} />
              </button>

              <div className="separator" />

              <div className="panel-title">
                <div>
                  <span className="section-kicker">SCORE CONTROL</span>
                  <h2>إضافة النقاط</h2>
                </div>
              </div>

              <label>اختيار اللاعبين</label>
              <details className="bulk-player-dropdown">
                <summary className="bulk-player-summary">
                  {selectedPointPlayers.length === 0
                    ? 'اضغط لاختيار اللاعبين'
                    : `تم تحديد ${selectedPointPlayers.length} لاعب`}
                </summary>

                <div className="bulk-player-list">
                  {participants.map(p => {
                    const n = participantName(p)
                    const checked = selectedPointPlayers.includes(n)

                    return (
                      <label key={n} className="bulk-player-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          aria-label={`اختيار ${n}`}
                          onChange={e => {
                            setSelectedPointPlayers(current =>
                              e.target.checked
                                ? [...current.filter(x => x !== n), n]
                                : current.filter(x => x !== n)
                            )
                          }}
                        />
                        <span>{n}</span>
                      </label>
                    )
                  })}
                </div>

                <div className="bulk-player-actions">
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setSelectedPointPlayers(
                      participants.map(p => participantName(p))
                    )}
                  >
                    تحديد الجميع
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setSelectedPointPlayers([])}
                  >
                    إلغاء التحديد
                  </button>
                </div>
              </details>

              <label>النقاط المراد إضافتها لكل لاعب</label>
              <input
                type="number"
                min="0"
                max="1000"
                value={points}
                onChange={e => setPoints(e.target.value)}
              />

              <button
                className="secondary-btn"
                disabled={busy}
                onClick={awardPoints}
              >
                إضافة النقاط للاعبين المحددين
              </button>

              <div className="separator" />

              <div className="separator" />

              <div className="panel-title">
                <div>
                  <span className="section-kicker">FINAL RESULTS</span>
                  <h2>إنهاء المسابقة وإعلان الفائزين</h2>
                </div>
                <Trophy className="gold" />
              </div>

              {data.finalAnnouncement?.ended ? (
                <div className="empty-state">
                  انتهت هذه المسابقة. أنشئ غرفة جديدة لبدء مسابقة أخرى.
                </div>
              ) : (
                <>
                  <p className="muted">
                    اختر الفائز أو الفائزين يدويًا. كل مشارك لم تختره سيشاهد شاشة غير الفائز.
                  </p>

                  <div className="final-winner-list">
                    {participants.length === 0 ? (
                      <div className="empty-state">لا يوجد مشاركون بعد.</div>
                    ) : participants.map(p => {
                      const n = participantName(p)
                      const checked = selectedWinners.includes(n)

                      return (
                        <label key={`winner-${n}`} className="bulk-player-option">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={busy}
                            onChange={e => {
                              setSelectedWinners(current =>
                                e.target.checked
                                  ? [...current.filter(x => x !== n), n]
                                  : current.filter(x => x !== n)
                              )
                            }}
                          />
                          <span>{n}</span>
                          <small>{scoreFor(n)} نقطة</small>
                        </label>
                      )
                    })}
                  </div>

                  <button
                    type="button"
                    className="primary-btn final-end-btn"
                    disabled={busy || selectedWinners.length === 0 || participants.length === 0}
                    onClick={finalizeQuiz}
                  >
                    إنهاء المسابقة وإعلان {selectedWinners.length} فائز
                    <Trophy size={17} />
                  </button>
                </>
              )}

              <div className="separator" />

              <div className="panel-title">
                <div>
                  <span className="section-kicker">LIVE RANKING</span>
                  <h2>لوحة المتصدرين</h2>
                </div>
                <Trophy className="gold" />
              </div>

              <button
                type="button"
                className={`leaderboard-toggle ${data.leaderboardVisible !== false ? 'is-on' : 'is-off'}`}
                disabled={busy}
                aria-pressed={data.leaderboardVisible !== false}
                onClick={() => request(
                  '/api/admin/leaderboard-visibility',
                  { visible: data.leaderboardVisible === false },
                  true
                )}
              >
                <span className="toggle-track" aria-hidden="true">
                  <span className="toggle-thumb" />
                </span>
                <span>
                  {data.leaderboardVisible !== false
                    ? 'لوحة المتصدرين ظاهرة للاعبين'
                    : 'لوحة المتصدرين مخفية عن اللاعبين'}
                </span>
              </button>

              {leaderboard.length === 0 ? (
                <div className="empty-state">
                  ستظهر أسماء اللاعبين هنا بعد انضمامهم.
                </div>
              ) : leaderboard.map((p, i) => {
                const n = participantName(p)
                return (
                  <div className="leader-row" key={`admin-${n}`}>
                    <span className={`rank rank-${i + 1}`}>
                      {i === 0 ? <Crown size={16} /> : i + 1}
                    </span>
                    <span className="leader-name">{n}</span>
                    <strong className="score">
                      {scoreFor(n)} <small>نقطة</small>
                    </strong>
                  </div>
                )
              })}
            </section>
          ) : (
            <>
              <section className="question-panel">
                <div className="question-top">
                  <span className="tag">السؤال الحالي</span>
                  <span className="muted"><Radio size={14} /> مباشر</span>
                </div>
                <div className="question-icon"><CircleHelp size={26} /></div>
                <h2>{currentQuestion || 'انتظر السؤال القادم...'}</h2>

                {currentQuestion && (
                  <>
                    <textarea
                      value={answer}
                      onChange={e => setAnswer(e.target.value)}
                      placeholder="اكتب إجابتك هنا..."
                      rows={3}
                      disabled={answers.some(a => a.name === name)}
                    />
                    <button
                      className="primary-btn"
                      disabled={busy || answers.some(a => a.name === name)}
                      onClick={submitAnswer}
                    >
                      {answers.some(a => a.name === name)
                        ? 'تم إرسال إجابتك'
                        : 'إرسال الإجابة'}
                      <Send size={17} />
                    </button>
                  </>
                )}

                {myResult !== undefined && myResult !== null && (
                  <div className={`result-banner ${resultIsCorrect ? 'correct' : 'wrong'}`}>
                    {resultIsCorrect ? <CheckCircle2 size={25} /> : <XCircle size={25} />}
                    <strong>{resultIsCorrect ? 'صحيح! أحسنت' : 'خطأ، حاول في الجولة القادمة'}</strong>
                  </div>
                )}

                <button
                  type="button"
                  className="primary-btn final-end-btn"
                  disabled={!finalReadyToReveal}
                  onClick={() => {
                    if (!finalReadyToReveal) return

                    const audio = new Audio(
                      isFinalWinner ? '/audio/winner.mp3' : '/audio/loser.mp3'
                    )
                    audio.preload = 'auto'
                    audio.volume = 1
                    finalAudioRef.current = audio

                    audio.play().catch(() => {
                      setMessage('تعذر تشغيل الصوت. تحقق من مستوى الصوت ثم أعد المحاولة.')
                    })

                    setFinalRevealedKey(finalResultKey)
                  }}
                >
                  {finalReadyToReveal ? 'اعرف نتيجتك النهائية' : 'انتظر إعلان النتائج'}
                  <Trophy size={17} />
                </button>
              </section>

              <section
                className="panel"
                style={{
                  visibility: data.leaderboardVisible !== false ? 'visible' : 'hidden'
                }}
                aria-hidden={data.leaderboardVisible === false}
              >
                <div className="panel-title">
                  <div>
                    <span className="section-kicker">LIVE RANKING</span>
                    <h2>لوحة المتصدرين</h2>
                  </div>
                  <Trophy className="gold" />
                </div>

                {leaderboard.length === 0 ? (
                  <div className="empty-state">ستظهر أسماء اللاعبين هنا بعد انضمامهم.</div>
                ) : leaderboard.map((p, i) => {
                  const n = participantName(p)
                  return (
                    <div className="leader-row" key={n}>
                      <span className={`rank rank-${i + 1}`}>
                        {i === 0 ? <Crown size={16} /> : i + 1}
                      </span>
                      <span className="leader-name">
                        {n}{n === name ? ' (أنت)' : ''}
                      </span>
                      <strong className="score">
                        {scoreFor(n)} <small>نقطة</small>
                      </strong>
                    </div>
                  )
                })}
              </section>
            </>
          )}

          <button
            className="refresh-btn"
            onClick={() => fetch(`${API}/api/state`)
              .then(r => r.json())
              .then(setData)
              .catch(() => setMessage('تعذر تحديث البيانات'))}
          >
            <RefreshCw size={14} /> تحديث البيانات
          </button>
        </>
      )}

      {showFinalAnnouncement && (
        <section className={`result-fullscreen ${isFinalWinner ? 'is-correct' : 'is-wrong'} final-announcement`}>
          <div className="result-fullscreen-content">
            {isFinalWinner
              ? <Trophy size={86} strokeWidth={1.7} />
              : <XCircle size={86} strokeWidth={1.7} />}

            <h1>{isFinalWinner ? 'مبروك! أنت من الفائزين 🎉' : 'انتهت المسابقة'}</h1>
            <p>
              {isFinalWinner
                ? 'اختارك المشرف ضمن الفائزين في هذه المسابقة.'
                : 'شكراً لمشاركتك. حظاً أوفر في المسابقة القادمة.'}
            </p>

            <img
              src={isFinalWinner ? '/images/winner.png' : '/images/loser.png'}
              alt={isFinalWinner ? 'الفائز' : 'شكراً لمشاركتك'}
              onError={e => {
                e.currentTarget.style.display = 'none'
              }}
            />
          </div>
        </section>
      )}

      {showFullscreenResult && (
        <section className={`result-fullscreen ${resultIsCorrect ? 'is-correct' : 'is-wrong'}`}>
          <div className="result-fullscreen-content">
            {resultIsCorrect
              ? <CheckCircle2 size={86} strokeWidth={1.7} />
              : <XCircle size={86} strokeWidth={1.7} />}

            <h1>{resultIsCorrect ? 'صحيح!' : 'خطأ!'}</h1>
            <p>
              {resultIsCorrect
                ? 'أحسنت! إجابتك صحيحة'
                : 'حظاً موفقاً في السؤال القادم'}
            </p>

            <img
              src={resultIsCorrect ? '/images/correct.png' : '/images/wrong.png'}
              alt=""
              onError={e => {
                e.currentTarget.style.display = 'none'
              }}
            />

            <button
              className="result-continue"
              onClick={() => {
                setDismissedResultKey(resultKey)
                sessionStorage.setItem('quiz-arena-dismissed-result', resultKey)
                setMessage('انتظر السؤال القادم من المشرف')
              }}
            >
              متابعة
            </button>
          </div>
        </section>
      )}

      {message && (
        <div className="toast" role="status">
          {message}
          <button onClick={() => setMessage('')}>×</button>
        </div>
      )}

      <footer>QUIZ ARENA <span>•</span> BUILT FOR THE BOLD</footer>
    </main>
  )
}
