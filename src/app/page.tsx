'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [modal, setModal] = useState<'login' | 'signup' | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  function openModal(type: 'login' | 'signup') {
    setModal(type);
    setMessage('');
    setName('');
    setEmail('');
    setPassword('');
  }

  async function handleSignup() {
    if (!name || !email || !password) {
      setMessage('모든 항목을 입력해 주세요');
      return;
    }
    setLoading(true);
    setMessage('');
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    setLoading(false);
    if (error) {
      setMessage('가입 실패: ' + error.message);
    } else {
      setMessage('✅ 가입 신청 완료! 선생님 승인 후 입장할 수 있습니다.');
    }
  }

  async function handleLogin() {
    if (!email || !password) {
      setMessage('이메일과 비밀번호를 입력해 주세요');
      return;
    }
    setLoading(true);
    setMessage('');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error || !data.user) {
      setMessage('로그인 실패: 이메일 또는 비밀번호를 확인해 주세요');
      return;
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('status, role')
      .eq('id', data.user.id)
      .single();
    if (!profile) {
      setMessage('프로필을 찾을 수 없습니다');
      return;
    }
    if (profile.status === 'pending') {
      setMessage('⏳ 아직 선생님 승인 대기 중입니다.');
      await supabase.auth.signOut();
      return;
    }
    if (profile.status === 'rejected') {
      setMessage('가입이 거절되었습니다. 선생님께 문의해 주세요.');
      await supabase.auth.signOut();
      return;
    }
    window.location.href = profile.role === 'teacher' ? '/teacher' : '/home';
  }

  return (
    <>
      <div className="top-bar" />
      <div className="left-accent" />

      <main className="landing">
        <div className="label">IB LANGUAGE A : LITERATURE</div>
        <h1>IB<br />글로컬 K-문학</h1>
        <p className="subtitle">IB Language A: Literature · 자기주도 학습 온라인 강좌</p>
        <p className="subtitle-en">Korean Literature for the IB Diploma Programme</p>
        <div className="rule" />

        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => openModal('login')}>로그인</button>
          <button className="btn btn-outline" onClick={() => openModal('signup')}>회원가입</button>
        </div>

        <div className="satus-block">
          <div className="satus">SATUS</div>
          <div className="satus-sub">SETTERS ACADEMY · IB KOREAN LITERATURE</div>
        </div>
      </main>

      <div className="bottom-bar" />

      {modal === 'login' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModal(null)}>×</button>
            <h2>로그인</h2>
            <div className="field">
              <label>이메일</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" />
            </div>
            <div className="field">
              <label>비밀번호</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" />
            </div>
            <button className="submit" onClick={handleLogin} disabled={loading}>
              {loading ? '확인 중...' : '로그인'}
            </button>
            {message && <p className="note" style={{ color: '#B23A48', fontWeight: 600 }}>{message}</p>}
            <p className="note">아직 계정이 없으신가요? 회원가입 후 선생님 승인을 받으면 입장할 수 있습니다.</p>
          </div>
        </div>
      )}

      {modal === 'signup' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModal(null)}>×</button>
            <h2>회원가입</h2>
            <div className="field">
              <label>이름</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
            </div>
            <div className="field">
              <label>이메일</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" />
            </div>
            <div className="field">
              <label>비밀번호</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8자 이상" />
            </div>
            <button className="submit" onClick={handleSignup} disabled={loading}>
              {loading ? '신청 중...' : '가입 신청'}
            </button>
            {message && <p className="note" style={{ color: message.startsWith('✅') ? '#2E7D32' : '#B23A48', fontWeight: 600 }}>{message}</p>}
            <p className="note">가입 후 선생님이 승인하면 강의실에 입장할 수 있습니다.</p>
          </div>
        </div>
      )}
    </>
  );
}