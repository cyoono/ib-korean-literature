'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Lesson = {
  id: string;
  lesson_number: number;
  part: string;
  title: string;
  status: string;
};

type PreQ = { question: string; correct_answer: string };
type Asg = { title: string; prompt: string; min_chars: string; max_chars: string; max_score: string };

const NAVY = '#1F3A6E';

export default function LessonsPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [teacherName, setTeacherName] = useState('');

  const [lessonNumber, setLessonNumber] = useState('');
  const [part, setPart] = useState('part2');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [introVideo, setIntroVideo] = useState('');
  const [introDesc, setIntroDesc] = useState('');
  const [passage, setPassage] = useState('');
  const [lectureVideo, setLectureVideo] = useState('');
  const [preqs, setPreqs] = useState<PreQ[]>([{ question: '', correct_answer: '' }]);
  const [asgs, setAsgs] = useState<Asg[]>([
    { title: '', prompt: '', min_chars: '100', max_chars: '1000', max_score: '7' },
  ]);

  async function loadLessons() {
    const { data } = await supabase
      .from('lessons')
      .select('id, lesson_number, part, title, status')
      .order('lesson_number', { ascending: true });
    setLessons((data as Lesson[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/'; return; }
      const { data: me } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
      if (!me || me.role !== 'teacher') { window.location.href = '/home'; return; }
      setTeacherName(me.name);
      await loadLessons();
    }
    init();
  }, []);

  function resetForm() {
    setLessonNumber('');
    setPart('part2');
    setTitle('');
    setAuthor('');
    setIntroVideo('');
    setIntroDesc('');
    setPassage('');
    setLectureVideo('');
    setPreqs([{ question: '', correct_answer: '' }]);
    setAsgs([{ title: '', prompt: '', min_chars: '100', max_chars: '1000', max_score: '7' }]);
  }

  async function saveLesson() {
    if (!lessonNumber || !title) {
      setMsg('회차 번호와 제목은 필수입니다.');
      return;
    }
    setSaving(true);
    setMsg('');

    const { data: lessonRow, error: lessonErr } = await supabase
      .from('lessons')
      .insert({
        lesson_number: parseInt(lessonNumber, 10),
        part,
        title,
        author: author || null,
        intro_video_url: introVideo || null,
        intro_description: introDesc || null,
        passage: passage || null,
        lecture_video_url: lectureVideo || null,
        status: 'draft',
      })
      .select('id')
      .single();

    if (lessonErr || !lessonRow) {
      setMsg('강의 저장 실패: ' + (lessonErr ? lessonErr.message : '알 수 없는 오류'));
      setSaving(false);
      return;
    }
    const lessonId = lessonRow.id;

    const preqRows = preqs
      .filter((q) => q.question.trim() !== '')
      .map((q, i) => ({
        lesson_id: lessonId,
        order_index: i + 1,
        question: q.question,
        correct_answer: q.correct_answer,
      }));
    if (preqRows.length > 0) {
      const { error } = await supabase.from('prequestions').insert(preqRows);
      if (error) { setMsg('사전질문 저장 실패: ' + error.message); setSaving(false); return; }
    }

    const asgRows = asgs
      .filter((a) => a.title.trim() !== '' || a.prompt.trim() !== '')
      .map((a, i) => ({
        lesson_id: lessonId,
        order_index: i + 1,
        title: a.title,
        prompt: a.prompt,
        min_chars: a.min_chars ? parseInt(a.min_chars, 10) : null,
        max_chars: a.max_chars ? parseInt(a.max_chars, 10) : null,
        max_score: a.max_score ? parseInt(a.max_score, 10) : 7,
      }));
    if (asgRows.length > 0) {
      const { error } = await supabase.from('assignments').insert(asgRows);
      if (error) { setMsg('과제 저장 실패: ' + error.message); setSaving(false); return; }
    }

    setMsg('제' + lessonNumber + '강 "' + title + '" 이(가) 임시저장(draft)으로 등록되었습니다.');
    resetForm();
    await loadLessons();
    setSaving(false);
  }

  async function toggleStatus(l: Lesson) {
    const next = l.status === 'published' ? 'draft' : 'published';
    const { error } = await supabase
      .from('lessons')
      .update({ status: next, published_at: next === 'published' ? new Date().toISOString() : null })
      .eq('id', l.id);
    if (error) { setMsg('상태 변경 실패: ' + error.message); return; }
    await loadLessons();
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1px solid #ccc', fontSize: 14, marginTop: 4,
  };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#444', marginTop: 12, display: 'block' };if (loading) return <div className="loading-note">불러오는 중...</div>;

  return (
    <>
      <header className="app-header">
        <div className="logo">IB · 글로컬 K-문학<span>TEACHER</span></div>
        <div className="user-area">
          <a href="/teacher" style={{ color: '#fff', fontSize: 14, marginRight: 16, textDecoration: 'underline' }}>채점 관리</a>
          <a href="/teacher/approvals" style={{ color: '#fff', fontSize: 14, marginRight: 16, textDecoration: 'underline' }}>가입 승인</a>
          <span>{teacherName} 선생님</span>
        </div>
      </header>

      <div className="container">
        <h1 style={{ color: NAVY, fontSize: 22, marginBottom: 16 }}>회차 관리</h1>

        {msg && (
          <div style={{ background: '#fffbe8', border: '1px solid #e8d98a', padding: '10px 14px', margin: '12px 0', fontSize: 14 }}>
            {msg}
          </div>
        )}

        <h2 style={{ fontSize: 16, color: NAVY, marginTop: 8 }}>등록된 회차 ({lessons.length})</h2>
        {lessons.length === 0 ? (
          <div className="empty-note">아직 등록된 회차가 없습니다.</div>
        ) : (
          lessons.map((l) => (
            <div className="sub-card" key={l.id}>
              <div className="sub-head" style={{ cursor: 'default' }}>
                <div>
                  <div className="sub-student">제{l.lesson_number}강 · {l.title}</div>
                  <div className="sub-meta">{l.part}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    color: l.status === 'published' ? '#1f6e3a' : '#8a6d1a',
                    background: l.status === 'published' ? '#e8f5ec' : '#fdf6e3',
                    padding: '4px 12px', fontSize: 13, fontWeight: 600,
                  }}>
                    {l.status === 'published' ? '공개됨' : '임시저장'}
                  </span>
                  <button
                    onClick={() => toggleStatus(l)}
                    style={{ background: l.status === 'published' ? '#777' : NAVY, color: '#fff', border: 'none', padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {l.status === 'published' ? '비공개로' : '공개하기'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}

        <h2 style={{ fontSize: 16, color: NAVY, marginTop: 32, borderTop: '2px solid ' + NAVY, paddingTop: 20 }}>새 회차 등록</h2>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ width: 120 }}>
            <label style={labelStyle}>회차 번호 *</label>
            <input style={inputStyle} type="number" value={lessonNumber} onChange={(e) => setLessonNumber(e.target.value)} placeholder="1" />
          </div>
          <div style={{ width: 140 }}>
            <label style={labelStyle}>파트</label>
            <input style={inputStyle} value={part} onChange={(e) => setPart(e.target.value)} placeholder="part2" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>작가</label>
            <input style={inputStyle} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="알베르 카뮈" />
          </div>
        </div>

        <label style={labelStyle}>제목 *</label>
        <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="이방인 1강 — 작가와 배경" />

        <label style={labelStyle}>도입 영상 URL (YouTube)</label>
        <input style={inputStyle} value={introVideo} onChange={(e) => setIntroVideo(e.target.value)} placeholder="https://youtu.be/..." />

        <label style={labelStyle}>도입 설명</label>
        <textarea style={{ ...inputStyle, minHeight: 60 }} value={introDesc} onChange={(e) => setIntroDesc(e.target.value)} />

        <label style={labelStyle}>지문 (작품 본문)</label>
        <textarea style={{ ...inputStyle, minHeight: 120 }} value={passage} onChange={(e) => setPassage(e.target.value)} placeholder="오늘, 엄마가 죽었다..." />

        <label style={labelStyle}>강의 영상 URL (YouTube)</label>
        <input style={inputStyle} value={lectureVideo} onChange={(e) => setLectureVideo(e.target.value)} placeholder="https://youtu.be/..." />

        <h3 style={{ fontSize: 15, color: NAVY, marginTop: 24 }}>사전질문 (자동채점)</h3>
        {preqs.map((q, i) => (
          <div key={i} style={{ border: '1px solid #eee', padding: 12, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 13 }}>질문 {i + 1}</strong>
              {preqs.length > 1 && (
                <button onClick={() => setPreqs(preqs.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#B23A48', cursor: 'pointer', fontSize: 13 }}>삭제</button>
              )}
            </div>
            <input style={inputStyle} value={q.question} placeholder="질문" onChange={(e) => { const c = [...preqs]; c[i].question = e.target.value; setPreqs(c); }} />
            <input style={inputStyle} value={q.correct_answer} placeholder="정답" onChange={(e) => { const c = [...preqs]; c[i].correct_answer = e.target.value; setPreqs(c); }} />
          </div>
        ))}
        <button onClick={() => setPreqs([...preqs, { question: '', correct_answer: '' }])} style={{ marginTop: 8, background: '#eee', border: 'none', padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>+ 사전질문 추가</button>

        <h3 style={{ fontSize: 15, color: NAVY, marginTop: 24 }}>과제</h3>
        {asgs.map((a, i) => (
          <div key={i} style={{ border: '1px solid #eee', padding: 12, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 13 }}>과제 {i + 1}</strong>
              {asgs.length > 1 && (
                <button onClick={() => setAsgs(asgs.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#B23A48', cursor: 'pointer', fontSize: 13 }}>삭제</button>
              )}
            </div>
            <input style={inputStyle} value={a.title} placeholder="과제 제목" onChange={(e) => { const c = [...asgs]; c[i].title = e.target.value; setAsgs(c); }} />
            <textarea style={{ ...inputStyle, minHeight: 60 }} value={a.prompt} placeholder="문항 내용" onChange={(e) => { const c = [...asgs]; c[i].prompt = e.target.value; setAsgs(c); }} />
            <div style={{ display: 'flex', gap: 12 }}>
              <div><label style={{ fontSize: 12 }}>최소 글자수</label><input style={inputStyle} type="number" value={a.min_chars} onChange={(e) => { const c = [...asgs]; c[i].min_chars = e.target.value; setAsgs(c); }} /></div>
              <div><label style={{ fontSize: 12 }}>최대 글자수</label><input style={inputStyle} type="number" value={a.max_chars} onChange={(e) => { const c = [...asgs]; c[i].max_chars = e.target.value; setAsgs(c); }} /></div>
              <div><label style={{ fontSize: 12 }}>만점</label><input style={inputStyle} type="number" value={a.max_score} onChange={(e) => { const c = [...asgs]; c[i].max_score = e.target.value; setAsgs(c); }} /></div>
            </div>
          </div>
        ))}
        <button onClick={() => setAsgs([...asgs, { title: '', prompt: '', min_chars: '100', max_chars: '1000', max_score: '7' }])} style={{ marginTop: 8, background: '#eee', border: 'none', padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>+ 과제 추가</button>

        <div style={{ marginTop: 28 }}>
          <button onClick={saveLesson} disabled={saving} className="next-btn" style={{ opacity: saving ? 0.6 : 1 }}>
            {saving ? '저장 중...' : '회차 등록 (임시저장)'}
          </button>
        </div>
      </div>
    </>
  );
}