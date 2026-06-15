'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Lesson = {
  id: string;
  lesson_number: number;
  title: string;
  author: string | null;
  duration_estimate: string | null;
};

type Progress = {
  lesson_id: string;
  current_step: number;
  steps_completed: number[];
  last_active_at: string;
};

export default function StudentHome() {
  const [name, setName] = useState('');
  const [announcement, setAnnouncement] = useState<{ content: string; icon: string | null } | null>(null);
  const [showBanner, setShowBanner] = useState(true);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/';
        return;
      }
      const [profileRes, annRes, lessonsRes, progressRes] = await Promise.all([
        supabase.from('profiles').select('name').eq('id', user.id).single(),
        supabase.from('announcements').select('content, icon').eq('is_active', true).order('created_at', { ascending: false }).limit(1),
        supabase.from('lessons').select('id, lesson_number, title, author, duration_estimate').eq('status', 'published').order('lesson_number'),
        supabase.from('lesson_progress').select('lesson_id, current_step, steps_completed, last_active_at').eq('user_id', user.id),
      ]);
      if (profileRes.data) setName(profileRes.data.name);
      if (annRes.data && annRes.data.length > 0) setAnnouncement(annRes.data[0]);
      if (lessonsRes.data) setLessons(lessonsRes.data);
      if (progressRes.data) setProgress(progressRes.data);
      setLoading(false);
    }
    load();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  function isDone(lessonId: string) {
    const p = progress.find((x) => x.lesson_id === lessonId);
    return !!p && p.steps_completed.length >= 4;
  }

  const firstIncomplete = lessons.find((l) => !isDone(l.id));

  function cardStatus(l: Lesson): 'done' | 'current' | 'locked' {
    if (isDone(l.id)) return 'done';
    if (firstIncomplete && l.id === firstIncomplete.id) return 'current';
    return 'locked';
  }

  function continueTarget(): Lesson | null {
    const incomplete = progress
      .filter((p) => p.steps_completed.length < 4)
      .sort((a, b) => (a.last_active_at < b.last_active_at ? 1 : -1));
    if (incomplete.length > 0) {
      const l = lessons.find((x) => x.id === incomplete[0].lesson_id);
      if (l) return l;
    }
    return firstIncomplete || null;
  }

  function goLesson(l: Lesson) {
    if (cardStatus(l) === 'locked') return;
    window.location.href = '/lesson/' + l.id;
  }

  const doneCount = lessons.filter((l) => isDone(l.id)).length;
  const total = 20;
  const pct = Math.round((doneCount / total) * 100);
  const target = continueTarget();

  if (loading) {
    return <div className="loading-note">불러오는 중...</div>;
  }

  return (
    <>
      <header className="app-header">
        <div className="logo">
          IB · 글로컬 K-문학<span>SATUS</span>
        </div>
        <div className="user-area">
          <a href="/reports" style={{ color: '#fff', fontSize: 14, marginRight: 16, textDecoration: 'underline' }}>리포트 카드</a>
          <span>{name}님</span>
          <button className="logout-btn" onClick={logout}>로그아웃</button>
        </div>
      </header>

      {announcement && showBanner && (
        <div className="banner">
          <span>{announcement.icon || '📢'}</span>
          <span>{announcement.content}</span>
          <button className="close" onClick={() => setShowBanner(false)}>×</button>
        </div>
      )}

      <div className="container">
        <div className="hero">
          <div>
            <h2>안녕하세요, {name}님!</h2>
            <p>오늘도 한 걸음씩, 한국 문학의 세계로 들어가 봅시다.</p>
            {target ? (
              <button className="continue-btn" onClick={() => goLesson(target)}>
                ▶ 이어서 학습하기 — 제 {target.lesson_number}강
              </button>
            ) : (
              <button className="continue-btn" disabled>모든 회차 완료!</button>
            )}
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="num">{doneCount}</div>
              <div className="label">완료 회차</div>
            </div>
            <div className="hero-stat">
              <div className="num">{lessons.length}</div>
              <div className="label">공개 회차</div>
            </div>
          </div>
        </div>

        <div className="progress-section">
          <div className="progress-label">
            <span>Year 1 전체 진행률</span>
            <span>{doneCount} / {total}강 완료</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: pct + '%' }} />
          </div>
        </div>

        <div className="section-title-row">
          <div className="bar" />
          <h3>강의 목록</h3>
        </div>

        {lessons.length === 0 ? (
          <div className="empty-note">아직 공개된 회차가 없습니다. 선생님이 회차를 공개하면 여기에 나타나요.</div>
        ) : (
          <div className="lesson-grid">
            {lessons.map((l) => {
              const st = cardStatus(l);
              return (
                <div key={l.id} className={'lesson-card ' + (st === 'done' ? 'done' : st === 'locked' ? 'locked' : '')} onClick={() => goLesson(l)}>
                  <div className="num">LESSON {String(l.lesson_number).padStart(2, '0')}</div>
                  <h4>{l.title}</h4>
                  <div className="meta">{l.author || ''} {l.duration_estimate ? '· ' + l.duration_estimate : ''}</div>
                  <div className="status-row">
                    {st === 'done' && <span className="status-done">✓ 완료</span>}
                    {st === 'current' && <span className="status-current">▶ 학습 가능</span>}
                    {st === 'locked' && <span className="status-locked">🔒 이전 회차를 먼저 완료하세요</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
