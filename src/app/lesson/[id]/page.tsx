'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Lesson = {
  id: string;
  lesson_number: number;
  title: string;
  author: string | null;
  duration_estimate: string | null;
  intro_video_url: string | null;
  intro_description: string | null;
  passage: string | null;
  lecture_video_url: string | null;
};

/* 단어 수: 띄어쓰기 기준 */
const PQ_MAX_WORDS = 250;
const ASG_MAX_WORDS = 1000;
function wordCount(t: string) {
  const s = t.trim();
  return s === '' ? 0 : s.split(/\s+/).length;
}

type PreQ = { id: string; order_index: number; question: string; correct_answer: string };
type Assignment = { id: string; order_index: number; title: string; prompt: string; min_chars: number | null; max_chars: number | null; max_score: number };
type Submission = { assignment_id: string; content: string; final_score: number | null; final_feedback: string | null; published_to_student: boolean };

const STEP_NAMES = ['오늘의 수업', '미리보는 오늘의 수업', '강의 보기', '과제물'];

export default function LessonPage() {
  const params = useParams();
  const lessonId = params.id as string;

  const [userId, setUserId] = useState('');
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [prequestions, setPrequestions] = useState<PreQ[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [stepsCompleted, setStepsCompleted] = useState<number[]>([]);
  const [activeStep, setActiveStep] = useState(1);
  const [pqInputs, setPqInputs] = useState<Record<string, string>>({});
  const [pqResults, setPqResults] = useState<Record<string, boolean>>({});
  const [pqGraded, setPqGraded] = useState(false);
  const [pqFeedback, setPqFeedback] = useState<Record<string, string>>({});
  const [pqGrading, setPqGrading] = useState(false);
  const [asgInputs, setAsgInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /* 교사가 회차 관리에서 눌러 들어온 미리보기: 모든 단계를 열고, 돌아가기는 회차 관리로 */
  const [teacherView, setTeacherView] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/'; return; }
      setUserId(user.id);
      if (new URLSearchParams(window.location.search).get('from') === 'teacher') {
        const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (me && me.role === 'teacher') setTeacherView(true);
      }

      const [lessonRes, pqRes, asgRes, subRes, pqaRes, progRes] = await Promise.all([
        supabase.from('lessons').select('*').eq('id', lessonId).single(),
        supabase.from('prequestions').select('*').eq('lesson_id', lessonId).order('order_index'),
        supabase.from('assignments').select('*').eq('lesson_id', lessonId).order('order_index'),
        supabase.from('submissions').select('assignment_id, content, final_score, final_feedback, published_to_student').eq('user_id', user.id),
        supabase.from('prequestion_answers').select('*').eq('user_id', user.id),
        supabase.from('lesson_progress').select('current_step, steps_completed').eq('user_id', user.id).eq('lesson_id', lessonId).maybeSingle(),
      ]);

      if (!lessonRes.data) { window.location.href = '/home'; return; }
      setLesson(lessonRes.data);
      const pqs: PreQ[] = pqRes.data || [];
      setPrequestions(pqs);
      setAssignments(asgRes.data || []);
      setSubmissions((subRes.data as Submission[]) || []);

      const pqa = pqaRes.data || [];
      const inputs: Record<string, string> = {};
      const results: Record<string, boolean> = {};
      const fbs: Record<string, string> = {};
      let answered = 0;
      for (const q of pqs) {
        const found = pqa.find((x) => x.prequestion_id === q.id);
        if (found) {
          inputs[q.id] = found.answer;
          results[q.id] = !!found.is_correct;
          if (found.ai_feedback) fbs[q.id] = found.ai_feedback;
          answered++;
        }
      }
      setPqInputs(inputs);
      setPqResults(results);
      setPqFeedback(fbs);
      if (pqs.length > 0 && answered === pqs.length) setPqGraded(true);

      if (progRes.data) {
        setStepsCompleted(progRes.data.steps_completed || []);
        setActiveStep(progRes.data.current_step || 1);
      } else {
        await supabase.from('lesson_progress').insert({ user_id: user.id, lesson_id: lessonId });
      }
      setLoading(false);
    }
    load();
  }, [lessonId]);

  async function saveProgress(newCompleted: number[], nextStep: number) {
    await supabase.from('lesson_progress').upsert({
      user_id: userId,
      lesson_id: lessonId,
      current_step: nextStep,
      steps_completed: newCompleted,
      last_active_at: new Date().toISOString(),
    }, { onConflict: 'user_id,lesson_id' });
  }

  async function completeStep(step: number) {
    const merged = Array.from(new Set([...stepsCompleted, step])).sort((a, b) => a - b);
    const next = Math.min(step + 1, 4);
    setStepsCompleted(merged);
    setActiveStep(next);
    window.scrollTo(0, 0);
    await saveProgress(merged, next);
  }

  async function gradePq() {
    setPqGrading(true);
    setPqGraded(true);
    setPqResults({});
    setPqFeedback({});
    const results: Record<string, boolean> = {};
    const fbs: Record<string, string> = {};
    /* 사전 질문마다 AI가 본문 기준으로 정오 판단 + 5줄 피드백. 실패하면 예전처럼 정답 문자열 비교 */
    await Promise.all(prequestions.map(async (q) => {
      const ans = (pqInputs[q.id] || '').trim();
      const exact = q.correct_answer.split('|').map((c) => c.trim().toLowerCase()).includes(ans.toLowerCase());
      try {
        const res = await fetch('/api/grade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'prequestion',
            prompt: q.question,
            answer: ans,
            lessonTitle: lesson ? '제' + lesson.lesson_number + '강' : '',
            passage: lesson && lesson.passage ? lesson.passage : '',
          }),
        });
        const r = await res.json();
        if (typeof r.correct === 'boolean') {
          /* 저장된 정답 문자열은 쓰지 않고, 질문과 본문만으로 AI가 새로 판단한 결과를 따른다 */
          results[q.id] = r.correct;
          const fb = (r.feedback || '') + (r.modelAnswer ? '\n\n📘 모범 답안\n' + r.modelAnswer : '');
          if (fb.trim()) fbs[q.id] = fb.trim();
          /* 끝난 질문부터 바로 보여 준다 */
          setPqResults((prev) => ({ ...prev, [q.id]: results[q.id] }));
          if (fb.trim()) setPqFeedback((prev) => ({ ...prev, [q.id]: fb.trim() }));
          return;
        }
      } catch {
        /* 아래 기본 판정으로 */
      }
      results[q.id] = exact;
      setPqResults((prev) => ({ ...prev, [q.id]: exact }));
    }));
    setPqResults(results);
    setPqFeedback(fbs);
    setPqGraded(true);
    setPqGrading(false);
    const rows = prequestions.map((q) => ({
      user_id: userId,
      prequestion_id: q.id,
      answer: pqInputs[q.id] || '',
      is_correct: results[q.id],
      ai_feedback: fbs[q.id] || null,
    }));
    const { error } = await supabase.from('prequestion_answers').upsert(rows, { onConflict: 'user_id,prequestion_id' });
    if (error) {
      /* ai_feedback 칸이 아직 없는 DB라면 피드백 없이 저장 */
      await supabase.from('prequestion_answers').upsert(
        rows.map(({ ai_feedback: _omit, ...rest }) => rest),
        { onConflict: 'user_id,prequestion_id' }
      );
    }
  }


 async function submitAsg(a: Assignment) {
    const content = (asgInputs[a.id] || '').trim();
    if (wordCount(content) > ASG_MAX_WORDS) {
      alert('과제는 최대 ' + ASG_MAX_WORDS + '단어까지 제출할 수 있습니다. (현재 ' + wordCount(content) + '단어)');
      return;
    }
    if (a.min_chars && content.length < a.min_chars) {
      alert('최소 ' + a.min_chars + '자 이상 작성해 주세요. (현재 ' + content.length + '자)');
      return;
    }
    setSaving(true);
    const { data: inserted, error } = await supabase
      .from('submissions')
      .insert({ user_id: userId, assignment_id: a.id, content: content })
      .select('id')
      .single();
    setSaving(false);
    if (error) {
      alert('제출 실패: ' + error.message);
      return;
    }

    const updated = [...submissions, { assignment_id: a.id, content: content, final_score: null, final_feedback: null, published_to_student: false }];
    setSubmissions(updated);
    const submittedForThisLesson = assignments.filter((x) => updated.some((s) => s.assignment_id === x.id)).length;
    if (assignments.length > 0 && submittedForThisLesson >= assignments.length) {
      await completeStep(4);
    }

    // AI 자동 채점 (백그라운드 — 실패해도 제출 자체엔 영향 없음)
    if (inserted && inserted.id) {
      try {
        const res = await fetch('/api/grade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: a.prompt,
            answer: content,
            maxScore: a.max_score || 7,
            workTitle: lesson ? lesson.title : '',
            lessonTitle: lesson ? '제' + lesson.lesson_number + '강' : '',
            passage: lesson && lesson.passage ? lesson.passage : '',
          }),
        });
        const result = await res.json();
        if (typeof result.score === 'number') {
          await supabase
            .from('submissions')
            .update({
              ai_score: result.score,
              ai_feedback: result.feedback || '',
              ai_graded_at: new Date().toISOString(),
            })
            .eq('id', inserted.id);
        }
      } catch {
        // AI 채점 실패는 조용히 넘어감 — 선생님이 수동 채점하면 됨
      }
    }
  }
  function embed(url: string | null) {
    if (!url) return null;
    return url.replace('watch?v=', 'embed/');
  }

  function subFor(aid: string) {
    return submissions.find((s) => s.assignment_id === aid);
  }

  if (loading) return <div className="loading-note">불러오는 중...</div>;
  if (!lesson) return null;

  const maxUnlocked = teacherView ? 4 : (stepsCompleted.length > 0 ? Math.max(...stepsCompleted) + 1 : 1);
  const allDone = stepsCompleted.includes(4);
  const submittedCount = assignments.filter((a) => subFor(a.id)).length;

  return (
    <>
      <header className="app-header">
        <div className="logo">IB · 글로컬 K-문학<span>SATUS</span></div>
        <div className="user-area">
          <button className="logout-btn" onClick={() => (window.location.href = teacherView ? '/teacher/lessons' : '/home')}>{teacherView ? '회차 관리' : '나의 강의실'}</button>
        </div>
      </header>

      <div className="lesson-wrap">
        <div className="lesson-head">
          <button className="back" onClick={() => (window.location.href = teacherView ? '/teacher/lessons' : '/home')}>{teacherView ? '← 회차 관리로 돌아가기' : '← 나의 강의실로 돌아가기'}</button>
          {teacherView && (
            <div style={{ background: '#fffbe8', border: '1px solid #e8d98a', padding: '8px 12px', margin: '8px 0', fontSize: 13 }}>
              선생님 미리보기 — 학생에게 보이는 화면입니다. 모든 단계가 열려 있으며, 여기서 입력한 답은 선생님 계정에만 저장됩니다.
            </div>
          )}
          <div className="num">LESSON {String(lesson.lesson_number).padStart(2, '0')}</div>
          <h1>{lesson.title}</h1>
          <div className="meta">{lesson.author || ''} {lesson.duration_estimate ? '· ' + lesson.duration_estimate : ''}</div>
        </div>

        {allDone && (
          <div className="done-banner">✓ 이 회차의 모든 단계를 완료했습니다! 선생님 채점이 끝나면 점수와 피드백이 공개됩니다.</div>
        )}

        <div className="steps-nav">
          {STEP_NAMES.map((nm, i) => {
            const s = i + 1;
            const open = s <= Math.min(maxUnlocked, 4);
            return (
              <button
                key={s}
                className={'step-tab ' + (activeStep === s ? 'active ' : '') + (stepsCompleted.includes(s) ? 'done ' : '') + (!open ? 'locked' : '')}
                onClick={() => { if (open) setActiveStep(s); }}
              >
                <span className="step-no">STEP {s}</span>
                {nm}
              </button>
            );
          })}
        </div>

        {activeStep === 1 && (
          <div className="panel">
            <h2>① 오늘의 수업</h2>
            <div className="video-box">
              {embed(lesson.intro_video_url) ? (
                <iframe src={embed(lesson.intro_video_url) || ''} allowFullScreen />
              ) : (
                '인트로 영상이 아직 등록되지 않았습니다'
              )}
            </div>
            {lesson.intro_description && (
              <p style={{ lineHeight: 1.9, fontSize: 14, marginBottom: 18 }}>{lesson.intro_description}</p>
            )}
            <button className="next-btn" onClick={() => completeStep(1)}>완료하고 다음으로 →</button>
          </div>
        )}

        {activeStep === 2 && (
          <div className="panel">
            <h2>② 미리보는 오늘의 수업</h2>
            {lesson.passage && <div className="passage">{lesson.passage}</div>}
            <h2 style={{ fontSize: 17 }}>사전 질문</h2>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>이해도 확인용 질문입니다. <b style={{ color: '#B23A48' }}>이번 회차 본문 안에서 답을 찾아 쓰세요.</b> 정답이 아니어도 다음 단계로 진행할 수 있어요.</p>
            {prequestions.map((q) => (
              <div className="pq-item" key={q.id}>
                <div className="q">{q.order_index}. {q.question}</div>
                <textarea
                  value={pqInputs[q.id] || ''}
                  onChange={(e) => setPqInputs({ ...pqInputs, [q.id]: e.target.value })}
                  placeholder="본문에서 근거를 찾아 답을 쓰세요 (최대 250단어)"
                  disabled={pqGraded}
                  rows={3}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
                />
                <div style={{ fontSize: 12, textAlign: 'right', color: wordCount(pqInputs[q.id] || '') > PQ_MAX_WORDS ? '#B23A48' : '#888' }}>
                  {wordCount(pqInputs[q.id] || '')} / {PQ_MAX_WORDS}단어
                  {wordCount(pqInputs[q.id] || '') > PQ_MAX_WORDS ? ' — 250단어 이내로 줄여 주세요' : ''}
                </div>
                {pqGraded && !(q.id in pqResults) && (
                  <div className="pq-result" style={{ color: '#888' }}>⏳ AI가 이 답을 살펴보는 중...</div>
                )}
                {pqGraded && (q.id in pqResults) && (
                  <div className={'pq-result ' + (pqResults[q.id] ? 'ok' : 'no')}>
                    {pqResults[q.id] ? '✓ 정답입니다!' : '✗ 아쉬워요 — 아래 피드백을 확인해 보세요. 그래도 진행할 수 있습니다.'}
                    {pqFeedback[q.id] && (
                      <div style={{ whiteSpace: 'pre-wrap', marginTop: 8, lineHeight: 1.7, fontWeight: 400, color: '#333' }}>{pqFeedback[q.id]}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!pqGraded ? (
              <button
                className="next-btn"
                disabled={pqGrading || prequestions.some((q) => !(pqInputs[q.id] || '').trim() || wordCount(pqInputs[q.id] || '') > PQ_MAX_WORDS)}
                onClick={gradePq}
              >
                {pqGrading ? 'AI가 답을 살펴보는 중... (10~20초)' : '채점하기'}
              </button>
            ) : (
              <>
                <button className="next-btn" disabled={pqGrading} onClick={() => completeStep(2)}>{pqGrading ? '채점 중...' : '완료하고 다음으로 →'}</button>
                {teacherView && (
                  <button
                    onClick={() => { setPqGraded(false); setPqFeedback({}); setPqResults({}); }}
                    style={{ marginLeft: 8, background: '#eee', border: 'none', padding: '10px 18px', fontSize: 14, cursor: 'pointer' }}
                  >
                    ↻ 다시 풀어 보기 (선생님 미리보기)
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {activeStep === 3 && (
          <div className="panel">
            <h2>③ 강의 보기</h2>
            <div className="video-box">
              {embed(lesson.lecture_video_url) ? (
                <iframe src={embed(lesson.lecture_video_url) || ''} allowFullScreen />
              ) : (
                '강의 영상이 아직 등록되지 않았습니다'
              )}
            </div>
            <button className="next-btn" onClick={() => completeStep(3)}>완료하고 다음으로 →</button>
          </div>
        )}

        {activeStep === 4 && (
          <div className="panel">
            <h2>④ 과제물</h2>
            <div className="traffic">
              {assignments.map((a, i) => {
                const submitted = !!subFor(a.id);
                const cls = i === 2 ? 'on3' : i === 1 ? 'on2' : 'on1';
                return <div key={a.id} className={'light ' + (submitted ? cls : '')} />;
              })}
              <span className="t-label">{submittedCount} / {assignments.length} 제출</span>
            </div>
            {assignments.map((a) => {
              const sub = subFor(a.id);
              const len = (asgInputs[a.id] || '').length;
              const words = wordCount(asgInputs[a.id] || '');
              const over = words > ASG_MAX_WORDS;
              return (
                <div className="asg-card" key={a.id}>
                  <div className="a-title">과제 {a.order_index}. {a.title}</div>
                  <div className="a-prompt">{a.prompt}</div>
                  <div className="a-guide">최대 {ASG_MAX_WORDS}단어{a.min_chars ? ' · 최소 ' + a.min_chars + '자' : ''} · {a.max_score}점 만점</div>
                  {sub ? (
                    <>
                      <div className="my-answer">{sub.content}</div>
                      {sub.published_to_student && sub.final_score !== null ? (
                        <div className="asg-status scored">
                          점수: {sub.final_score} / {a.max_score}점
                          {sub.final_feedback && (
                            <div style={{ whiteSpace: 'pre-wrap', marginTop: 8, lineHeight: 1.7, fontWeight: 400 }}>{sub.final_feedback}</div>
                          )}
                        </div>
                      ) : (
                        <div className="asg-status grading">⏳ 채점 중 — 선생님 검토 후 점수가 공개됩니다</div>
                      )}
                    </>
                  ) : (
                    <>
                      <textarea
                        value={asgInputs[a.id] || ''}
                        onChange={(e) => setAsgInputs({ ...asgInputs, [a.id]: e.target.value })}
                        placeholder="여기에 답안을 작성하세요"
                      />
                      <div className="char-row">
                        <span className="char-count" style={{ color: over ? '#B23A48' : undefined }}>
                          {words} / {ASG_MAX_WORDS}단어 · {len}자{a.min_chars ? ' (최소 ' + a.min_chars + '자)' : ''}
                          {over ? ' — 1000단어 이내로 줄여 주세요' : ''}
                        </span>
                        <button className="submit-asg" disabled={saving || len === 0 || over} onClick={() => submitAsg(a)}>제출하기</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
