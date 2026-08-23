'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import TeacherHeader from '@/app/components/TeacherHeader';

/* id 가 없으면 아직 DB 에 없는 새 항목 → 저장할 때 insert 한다. */
type PreQ = {
  id?: string;
  question: string;
  correct_answer: string;
  answerCount?: number;
};

type Asg = {
  id?: string;
  title: string;
  prompt: string;
  min_chars: string;
  max_chars: string;
  max_score: string;
  submissionCount?: number;
};

const NAVY = '#1F3A6E';

export default function EditLessonPage() {
  const params = useParams();
  const lessonId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgOk, setMsgOk] = useState(false);
  const [teacherName, setTeacherName] = useState('');

  const [lessonNumber, setLessonNumber] = useState('');
  const [part, setPart] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [introVideo, setIntroVideo] = useState('');
  const [introDesc, setIntroDesc] = useState('');
  const [passage, setPassage] = useState('');
  const [lectureVideo, setLectureVideo] = useState('');

  const [preqs, setPreqs] = useState<PreQ[]>([]);
  const [asgs, setAsgs] = useState<Asg[]>([]);

  /* 화면에서 지운 기존 항목의 id. 저장 버튼을 눌러야 실제로 DB 에서 지운다. */
  const [deletedPreqIds, setDeletedPreqIds] = useState<string[]>([]);
  const [deletedAsgIds, setDeletedAsgIds] = useState<string[]>([]);

  function say(text: string, ok = false) {
    setMsg(text);
    setMsgOk(ok);
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/'; return; }
      const { data: me } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
      if (!me || me.role !== 'teacher') { window.location.href = '/home'; return; }
      setTeacherName(me.name);

      const { data: lesson, error } = await supabase
        .from('lessons')
        .select('lesson_number, part, title, author, intro_video_url, intro_description, passage, lecture_video_url')
        .eq('id', lessonId)
        .single();
      if (error || !lesson) { say('강의를 불러오지 못했습니다.'); setLoading(false); return; }

      setLessonNumber(String(lesson.lesson_number ?? ''));
      setPart(lesson.part ?? '');
      setTitle(lesson.title ?? '');
      setAuthor(lesson.author ?? '');
      setIntroVideo(lesson.intro_video_url ?? '');
      setIntroDesc(lesson.intro_description ?? '');
      setPassage(lesson.passage ?? '');
      setLectureVideo(lesson.lecture_video_url ?? '');

      const [preqRes, asgRes] = await Promise.all([
        supabase
          .from('prequestions')
          .select('id, order_index, question, correct_answer')
          .eq('lesson_id', lessonId)
          .order('order_index', { ascending: true }),
        supabase
          .from('assignments')
          .select('id, order_index, title, prompt, min_chars, max_chars, max_score')
          .eq('lesson_id', lessonId)
          .order('order_index', { ascending: true }),
      ]);

      const preqList: PreQ[] = (preqRes.data || []).map((q) => ({
        id: q.id,
        question: q.question ?? '',
        correct_answer: q.correct_answer ?? '',
      }));

      /* 사전질문별 학생 답변 수 — 삭제 경고에 쓴다 */
      const pqIds = preqList.map((q) => q.id).filter(Boolean) as string[];
      if (pqIds.length > 0) {
        const { data: answers } = await supabase
          .from('prequestion_answers')
          .select('prequestion_id')
          .in('prequestion_id', pqIds);
        const pqCounts: Record<string, number> = {};
        for (const a of answers || []) {
          pqCounts[a.prequestion_id] = (pqCounts[a.prequestion_id] || 0) + 1;
        }
        for (const q of preqList) {
          if (q.id) q.answerCount = pqCounts[q.id] || 0;
        }
      }
      setPreqs(preqList);

      const asgList: Asg[] = (asgRes.data || []).map((a) => ({
        id: a.id,
        title: a.title ?? '',
        prompt: a.prompt ?? '',
        min_chars: a.min_chars != null ? String(a.min_chars) : '',
        max_chars: a.max_chars != null ? String(a.max_chars) : '',
        max_score: a.max_score != null ? String(a.max_score) : '7',
      }));

      /* 과제별 제출물 수 — 삭제할 때 경고에 쓴다 */
      const ids = asgList.map((a) => a.id).filter(Boolean) as string[];
      if (ids.length > 0) {
        const { data: subs } = await supabase
          .from('submissions')
          .select('assignment_id')
          .in('assignment_id', ids);
        const counts: Record<string, number> = {};
        for (const s of subs || []) {
          counts[s.assignment_id] = (counts[s.assignment_id] || 0) + 1;
        }
        for (const a of asgList) {
          if (a.id) a.submissionCount = counts[a.id] || 0;
        }
      }
      setAsgs(asgList);
      setLoading(false);
    }
    init();
  }, [lessonId]);

  /* ───── 사전질문 ───── */
  function addPreq() {
    setPreqs([...preqs, { question: '', correct_answer: '' }]);
  }
  function removePreq(i: number) {
    const target = preqs[i];
    if (target.id) {
      const n = target.answerCount || 0;
      const warn = n > 0
        ? '⚠️ 학생 답변 기록이 ' + n + '건 있습니다. 함께 사라지며 복구할 수 없습니다.\n\n'
        : '';
      const ok = window.confirm(
        '사전질문 ' + (i + 1) + '번을 삭제합니다.\n\n' +
        warn + '저장 버튼을 눌러야 실제로 반영됩니다.\n\n계속할까요?'
      );
      if (!ok) return;
      setDeletedPreqIds([...deletedPreqIds, target.id]);
    }
    setPreqs(preqs.filter((_, idx) => idx !== i));
  }

  /* ───── 과제 ───── */
  function addAsg() {
    setAsgs([...asgs, { title: '', prompt: '', min_chars: '100', max_chars: '1000', max_score: '7' }]);
  }
  function removeAsg(i: number) {
    const target = asgs[i];
    if (target.id) {
      const n = target.submissionCount || 0;
      const warn = n > 0
        ? '⚠️ 이 과제에는 학생 제출물이 ' + n + '건 있습니다.\n삭제하면 그 답안과 채점 기록도 모두 사라지며 복구할 수 없습니다.\n\n'
        : '';
      const ok = window.confirm(
        '과제 ' + (i + 1) + '번 "' + (target.title || '(제목 없음)') + '" 을(를) 삭제합니다.\n\n' +
        warn + '저장 버튼을 눌러야 실제로 반영됩니다.\n\n계속할까요?'
      );
      if (!ok) return;
      setDeletedAsgIds([...deletedAsgIds, target.id]);
    }
    setAsgs(asgs.filter((_, idx) => idx !== i));
  }

  /* ───── 저장 ───── */
  async function save() {
    if (!lessonNumber || !title) {
      say('회차 번호와 제목은 필수입니다.');
      return;
    }
    setSaving(true);
    setMsg('');

    /* 1. 강의 본문 */
    const { error: lessonErr } = await supabase
      .from('lessons')
      .update({
        lesson_number: parseInt(lessonNumber, 10),
        part,
        title,
        author: author || null,
        intro_video_url: introVideo || null,
        intro_description: introDesc || null,
        passage: passage || null,
        lecture_video_url: lectureVideo || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lessonId);
    if (lessonErr) { say('강의 저장 실패: ' + lessonErr.message); setSaving(false); return; }

    /* 2. 삭제 먼저 — 남은 항목의 순번을 다시 매기기 전에 치운다 */
    if (deletedPreqIds.length > 0) {
      const { error } = await supabase.from('prequestions').delete().in('id', deletedPreqIds);
      if (error) { say('사전질문 삭제 실패: ' + error.message); setSaving(false); return; }
    }
    if (deletedAsgIds.length > 0) {
      const { error } = await supabase.from('assignments').delete().in('id', deletedAsgIds);
      if (error) {
        say('과제 삭제 실패: ' + error.message + ' (제출물이 연결되어 있으면 지워지지 않습니다)');
        setSaving(false);
        return;
      }
    }

    /* 3. 사전질문 — 기존은 수정, 새 것은 추가. 순번은 화면 순서대로 다시 매긴다 */
    for (let i = 0; i < preqs.length; i++) {
      const q = preqs[i];
      if (q.question.trim() === '') continue;
      if (q.id) {
        const { error } = await supabase
          .from('prequestions')
          .update({ order_index: i + 1, question: q.question, correct_answer: q.correct_answer })
          .eq('id', q.id);
        if (error) { say('사전질문 저장 실패: ' + error.message); setSaving(false); return; }
      } else {
        const { error } = await supabase
          .from('prequestions')
          .insert({ lesson_id: lessonId, order_index: i + 1, question: q.question, correct_answer: q.correct_answer });
        if (error) { say('사전질문 추가 실패: ' + error.message); setSaving(false); return; }
      }
    }

    /* 4. 과제 */
    for (let i = 0; i < asgs.length; i++) {
      const a = asgs[i];
      if (a.title.trim() === '' && a.prompt.trim() === '') continue;
      const row = {
        order_index: i + 1,
        title: a.title,
        prompt: a.prompt,
        min_chars: a.min_chars ? parseInt(a.min_chars, 10) : null,
        max_chars: a.max_chars ? parseInt(a.max_chars, 10) : null,
        max_score: a.max_score ? parseInt(a.max_score, 10) : 7,
      };
      if (a.id) {
        const { error } = await supabase.from('assignments').update(row).eq('id', a.id);
        if (error) { say('과제 저장 실패: ' + error.message); setSaving(false); return; }
      } else {
        const { error } = await supabase.from('assignments').insert({ lesson_id: lessonId, ...row });
        if (error) { say('과제 추가 실패: ' + error.message); setSaving(false); return; }
      }
    }

    setDeletedPreqIds([]);
    setDeletedAsgIds([]);
    say('✅ 저장되었습니다.', true);
    setSaving(false);

    /* 새로 추가한 항목에 id 를 붙이기 위해 다시 읽어온다 */
    const [preqRes, asgRes] = await Promise.all([
      supabase.from('prequestions').select('id, order_index, question, correct_answer').eq('lesson_id', lessonId).order('order_index', { ascending: true }),
      supabase.from('assignments').select('id, order_index, title, prompt, min_chars, max_chars, max_score').eq('lesson_id', lessonId).order('order_index', { ascending: true }),
    ]);
    setPreqs((preqRes.data || []).map((q) => ({ id: q.id, question: q.question ?? '', correct_answer: q.correct_answer ?? '' })));
    setAsgs((asgRes.data || []).map((a) => ({
      id: a.id,
      title: a.title ?? '',
      prompt: a.prompt ?? '',
      min_chars: a.min_chars != null ? String(a.min_chars) : '',
      max_chars: a.max_chars != null ? String(a.max_chars) : '',
      max_score: a.max_score != null ? String(a.max_score) : '7',
    })));
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1px solid #ccc', fontSize: 14, marginTop: 4,
  };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#444', marginTop: 12, display: 'block' };
  const cardStyle: React.CSSProperties = { border: '1px solid #eee', padding: 12, marginTop: 8 };
  const delBtnStyle: React.CSSProperties = { background: 'none', border: 'none', color: '#B23A48', cursor: 'pointer', fontSize: 13, fontWeight: 600 };
  const addBtnStyle: React.CSSProperties = { marginTop: 8, background: '#eee', border: 'none', padding: '6px 14px', fontSize: 13, cursor: 'pointer' };

  if (loading) return <div className="loading-note">불러오는 중...</div>;

  const pendingDeletes = deletedPreqIds.length + deletedAsgIds.length;

  return (
    <>
      <TeacherHeader teacherName={teacherName} />

      <div className="container">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1 style={{ color: NAVY, fontSize: 22, margin: 0 }}>회차 수정</h1>
          <a href="/teacher/lessons" style={{ color: NAVY, fontSize: 14, textDecoration: 'underline' }}>← 회차 관리로</a>
        </div>

        {msg && (
          <div style={{
            background: msgOk ? '#e8f5ec' : '#fffbe8',
            border: '1px solid ' + (msgOk ? '#9ccfae' : '#e8d98a'),
            padding: '10px 14px', margin: '12px 0', fontSize: 14,
          }}>
            {msg}
          </div>
        )}

        {pendingDeletes > 0 && (
          <div style={{ background: '#fdecee', border: '1px solid #e8a8b0', padding: '10px 14px', margin: '12px 0', fontSize: 14, color: '#8a2733' }}>
            삭제 표시된 항목 {pendingDeletes}개가 있습니다. <strong>맨 아래 저장 버튼</strong>을 눌러야 실제로 지워집니다.
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ width: 120 }}>
            <label style={labelStyle}>회차 번호 *</label>
            <input style={inputStyle} type="number" value={lessonNumber} onChange={(e) => setLessonNumber(e.target.value)} />
          </div>
          <div style={{ width: 140 }}>
            <label style={labelStyle}>파트</label>
            <input style={inputStyle} value={part} onChange={(e) => setPart(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>작가</label>
            <input style={inputStyle} value={author} onChange={(e) => setAuthor(e.target.value)} />
          </div>
        </div>

        <label style={labelStyle}>제목 *</label>
        <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />

        <label style={labelStyle}>도입 영상 URL (YouTube)</label>
        <input style={inputStyle} value={introVideo} onChange={(e) => setIntroVideo(e.target.value)} placeholder="https://youtu.be/..." />

        <label style={labelStyle}>도입 설명</label>
        <textarea style={{ ...inputStyle, minHeight: 60 }} value={introDesc} onChange={(e) => setIntroDesc(e.target.value)} />

        <label style={labelStyle}>지문 (작품 본문)</label>
        <textarea style={{ ...inputStyle, minHeight: 120 }} value={passage} onChange={(e) => setPassage(e.target.value)} />

        <label style={labelStyle}>강의 영상 URL (YouTube)</label>
        <input style={inputStyle} value={lectureVideo} onChange={(e) => setLectureVideo(e.target.value)} placeholder="https://youtu.be/..." />

        {/* ───── 사전질문 ───── */}
        <h3 style={{ fontSize: 15, color: NAVY, marginTop: 28 }}>사전질문 (자동채점) — {preqs.length}개</h3>
        {preqs.length === 0 ? (
          <div className="empty-note">사전질문이 없습니다. 아래 버튼으로 추가하세요.</div>
        ) : (
          preqs.map((q, i) => (
            <div key={q.id || 'new-preq-' + i} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 13 }}>
                  질문 {i + 1}
                  {!q.id && <span style={{ marginLeft: 8, color: '#2E7D32', fontWeight: 600 }}>새로 추가됨</span>}
                  {q.id && q.answerCount ? (
                    <span style={{ marginLeft: 8, color: '#8a6d1a', fontWeight: 500 }}>답변 {q.answerCount}건</span>
                  ) : null}
                </strong>
                <button onClick={() => removePreq(i)} style={delBtnStyle}>삭제</button>
              </div>
              <input style={inputStyle} value={q.question} placeholder="질문"
                onChange={(e) => { const c = [...preqs]; c[i].question = e.target.value; setPreqs(c); }} />
              <input style={inputStyle} value={q.correct_answer} placeholder="정답"
                onChange={(e) => { const c = [...preqs]; c[i].correct_answer = e.target.value; setPreqs(c); }} />
            </div>
          ))
        )}
        <button onClick={addPreq} style={addBtnStyle}>+ 사전질문 추가</button>

        {/* ───── 과제 ───── */}
        <h3 style={{ fontSize: 15, color: NAVY, marginTop: 28 }}>과제 — {asgs.length}개</h3>
        {asgs.length === 0 ? (
          <div className="empty-note">과제가 없습니다. 아래 버튼으로 추가하세요.</div>
        ) : (
          asgs.map((a, i) => (
            <div key={a.id || 'new-asg-' + i} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 13 }}>
                  과제 {i + 1}
                  {!a.id && <span style={{ marginLeft: 8, color: '#2E7D32', fontWeight: 600 }}>새로 추가됨</span>}
                  {a.id && a.submissionCount ? (
                    <span style={{ marginLeft: 8, color: '#8a6d1a', fontWeight: 500 }}>제출 {a.submissionCount}건</span>
                  ) : null}
                </strong>
                <button onClick={() => removeAsg(i)} style={delBtnStyle}>삭제</button>
              </div>
              <input style={inputStyle} value={a.title} placeholder="과제 제목"
                onChange={(e) => { const c = [...asgs]; c[i].title = e.target.value; setAsgs(c); }} />
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={a.prompt} placeholder="문항 내용"
                onChange={(e) => { const c = [...asgs]; c[i].prompt = e.target.value; setAsgs(c); }} />
              <div style={{ display: 'flex', gap: 12 }}>
                <div><label style={{ fontSize: 12 }}>최소 글자수</label>
                  <input style={inputStyle} type="number" value={a.min_chars}
                    onChange={(e) => { const c = [...asgs]; c[i].min_chars = e.target.value; setAsgs(c); }} /></div>
                <div><label style={{ fontSize: 12 }}>최대 글자수</label>
                  <input style={inputStyle} type="number" value={a.max_chars}
                    onChange={(e) => { const c = [...asgs]; c[i].max_chars = e.target.value; setAsgs(c); }} /></div>
                <div><label style={{ fontSize: 12 }}>만점</label>
                  <input style={inputStyle} type="number" value={a.max_score}
                    onChange={(e) => { const c = [...asgs]; c[i].max_score = e.target.value; setAsgs(c); }} /></div>
              </div>
            </div>
          ))
        )}
        <button onClick={addAsg} style={addBtnStyle}>+ 과제 추가</button>

        <div style={{ marginTop: 28, marginBottom: 40 }}>
          <button onClick={save} disabled={saving} className="next-btn" style={{ opacity: saving ? 0.6 : 1 }}>
            {saving ? '저장 중...' : '수정 내용 저장'}
          </button>
        </div>
      </div>
    </>
  );
}
