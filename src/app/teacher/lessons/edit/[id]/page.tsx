'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Asg = {
  id: string;
  order_index: number;
  title: string;
  prompt: string;
  min_chars: string;
  max_chars: string;
  max_score: string;
};

const NAVY = '#1F3A6E';

export default function EditLessonPage() {
  const params = useParams();
  const router = useRouter();
  const lessonId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [teacherName, setTeacherName] = useState('');

  const [lessonNumber, setLessonNumber] = useState('');
  const [part, setPart] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [introVideo, setIntroVideo] = useState('');
  const [introDesc, setIntroDesc] = useState('');
  const [passage, setPassage] = useState('');
  const [lectureVideo, setLectureVideo] = useState('');
  const [asgs, setAsgs] = useState<Asg[]>([]);

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
      if (error || !lesson) { setMsg('강의를 불러오지 못했습니다.'); setLoading(false); return; }

      setLessonNumber(String(lesson.lesson_number ?? ''));
      setPart(lesson.part ?? '');
      setTitle(lesson.title ?? '');
      setAuthor(lesson.author ?? '');
      setIntroVideo(lesson.intro_video_url ?? '');
      setIntroDesc(lesson.intro_description ?? '');
      setPassage(lesson.passage ?? '');
      setLectureVideo(lesson.lecture_video_url ?? '');

      const { data: asgData } = await supabase
        .from('assignments')
        .select('id, order_index, title, prompt, min_chars, max_chars, max_score')
        .eq('lesson_id', lessonId)
        .order('order_index', { ascending: true });
      setAsgs(
        (asgData || []).map((a) => ({
          id: a.id,
          order_index: a.order_index,
          title: a.title ?? '',
          prompt: a.prompt ?? '',
          min_chars: a.min_chars != null ? String(a.min_chars) : '',
          max_chars: a.max_chars != null ? String(a.max_chars) : '',
          max_score: a.max_score != null ? String(a.max_score) : '7',
        }))
      );
      setLoading(false);
    }
    init();
  }, [lessonId]);

  async function save() {
    if (!lessonNumber || !title) {
      setMsg('회차 번호와 제목은 필수입니다.');
      return;
    }
    setSaving(true);
    setMsg('');

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
    if (lessonErr) { setMsg('강의 저장 실패: ' + lessonErr.message); setSaving(false); return; }

    for (const a of asgs) {
      const { error } = await supabase
        .from('assignments')
        .update({
          title: a.title,
          prompt: a.prompt,
          min_chars: a.min_chars ? parseInt(a.min_chars, 10) : null,
          max_chars: a.max_chars ? parseInt(a.max_chars, 10) : null,
          max_score: a.max_score ? parseInt(a.max_score, 10) : 7,
        })
        .eq('id', a.id);
      if (error) { setMsg('과제 저장 실패: ' + error.message); setSaving(false); return; }
    }

    setMsg('저장되었습니다.');
    setSaving(false);
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
          <a href="/teacher/lessons" style={{ color: '#fff', fontSize: 14, marginRight: 16, textDecoration: 'underline' }}>회차 관리</a>
          <span>{teacherName} 선생님</span>
        </div>
      </header>

      <div className="container">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1 style={{ color: NAVY, fontSize: 22, margin: 0 }}>회차 수정</h1>
          <a href="/teacher/lessons" style={{ color: NAVY, fontSize: 14, textDecoration: 'underline' }}>← 회차 관리로</a>
        </div>

        {msg && (
          <div style={{ background: '#fffbe8', border: '1px solid #e8d98a', padding: '10px 14px', margin: '12px 0', fontSize: 14 }}>
            {msg}
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
        <input style={inputStyle} value={introVideo} onChange={(e) => setIntroVideo(e.target.value)} />

        <label style={labelStyle}>도입 설명</label>
        <textarea style={{ ...inputStyle, minHeight: 60 }} value={introDesc} onChange={(e) => setIntroDesc(e.target.value)} />

        <label style={labelStyle}>지문 (작품 본문)</label>
        <textarea style={{ ...inputStyle, minHeight: 120 }} value={passage} onChange={(e) => setPassage(e.target.value)} />

        <label style={labelStyle}>강의 영상 URL (YouTube)</label>
        <input style={inputStyle} value={lectureVideo} onChange={(e) => setLectureVideo(e.target.value)} />

        <h3 style={{ fontSize: 15, color: NAVY, marginTop: 24 }}>과제 ({asgs.length})</h3>
        {asgs.length === 0 ? (
          <div className="empty-note">이 강의에는 과제가 없습니다.</div>
        ) : (
          asgs.map((a, i) => (
            <div key={a.id} style={{ border: '1px solid #eee', padding: 12, marginTop: 8 }}>
              <strong style={{ fontSize: 13 }}>과제 {a.order_index}</strong>
              <input style={inputStyle} value={a.title} placeholder="과제 제목" onChange={(e) => { const c = [...asgs]; c[i].title = e.target.value; setAsgs(c); }} />
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={a.prompt} placeholder="문항 내용" onChange={(e) => { const c = [...asgs]; c[i].prompt = e.target.value; setAsgs(c); }} />
              <div style={{ display: 'flex', gap: 12 }}>
                <div><label style={{ fontSize: 12 }}>최소 글자수</label><input style={inputStyle} type="number" value={a.min_chars} onChange={(e) => { const c = [...asgs]; c[i].min_chars = e.target.value; setAsgs(c); }} /></div>
                <div><label style={{ fontSize: 12 }}>최대 글자수</label><input style={inputStyle} type="number" value={a.max_chars} onChange={(e) => { const c = [...asgs]; c[i].max_chars = e.target.value; setAsgs(c); }} /></div>
                <div><label style={{ fontSize: 12 }}>만점</label><input style={inputStyle} type="number" value={a.max_score} onChange={(e) => { const c = [...asgs]; c[i].max_score = e.target.value; setAsgs(c); }} /></div>
              </div>
            </div>
          ))
        )}

        <div style={{ marginTop: 28 }}>
          <button onClick={save} disabled={saving} className="next-btn" style={{ opacity: saving ? 0.6 : 1 }}>
            {saving ? '저장 중...' : '수정 내용 저장'}
          </button>
        </div>
      </div>
    </>
  );
}