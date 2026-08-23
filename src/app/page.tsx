'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type Modal = 'login' | 'signup' | 'findpw' | 'findid' | 'reset' | null;

export default function Home() {
  const [modal, setModal] = useState<Modal>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [phone, setPhone] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [foundEmail, setFoundEmail] = useState('');

  /* 비밀번호 재설정 메일의 링크로 들어온 경우.
     Supabase 가 URL 의 토큰을 읽어 PASSWORD_RECOVERY 이벤트를 발생시킨다. */
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setModal('reset');
        setMessage('');
        setOk(false);
        setPassword('');
        setPassword2('');
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  function openModal(type: Modal) {
    setModal(type);
    setMessage('');
    setOk(false);
    setName('');
    setEmail('');
    setPassword('');
    setPassword2('');
    setPhone('');
    setFoundEmail('');
  }

  function say(msg: string, good = false) {
    setMessage(msg);
    setOk(good);
  }

  async function handleSignup() {
    if (!name || !email || !password) {
      say('모든 항목을 입력해 주세요');
      return;
    }
    if (password.length < 8) {
      say('비밀번호는 8자 이상으로 정해 주세요');
      return;
    }
    if (!/^\d{4}$/.test(phone)) {
      say('연락처 뒤 4자리를 숫자로 입력해 주세요');
      return;
    }
    setLoading(true);
    setMessage('');
    const { error } = await supabase.auth.signUp({
      email,
      password,
      /* 키 이름은 profiles 컬럼명과 같아야 한다.
         DB 트리거 handle_new_user() 가 이 값을 그대로 읽어간다. */
      options: { data: { name, phone_last4: phone } },
    });
    setLoading(false);
    if (error) {
      say('가입 실패: ' + error.message);
    } else {
      say('✅ 가입 신청 완료! 선생님 승인 후 입장할 수 있습니다.', true);
    }
  }

  async function handleLogin() {
    if (!email || !password) {
      say('이메일과 비밀번호를 입력해 주세요');
      return;
    }
    setLoading(true);
    setMessage('');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error || !data.user) {
      say('로그인 실패: 이메일 또는 비밀번호를 확인해 주세요');
      return;
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('status, role')
      .eq('id', data.user.id)
      .single();
    if (!profile) {
      say('프로필을 찾을 수 없습니다');
      return;
    }
    if (profile.status === 'pending') {
      say('⏳ 아직 선생님 승인 대기 중입니다.');
      await supabase.auth.signOut();
      return;
    }
    if (profile.status === 'rejected') {
      say('가입이 거절되었습니다. 선생님께 문의해 주세요.');
      await supabase.auth.signOut();
      return;
    }
    window.location.href = profile.role === 'teacher' ? '/teacher' : '/home';
  }

  /* ───── 비밀번호 찾기 ───── */
  async function handleFindPw() {
    if (!email) {
      say('가입하신 이메일을 입력해 주세요');
      return;
    }
    setLoading(true);
    setMessage('');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setLoading(false);
    if (error) {
      say('메일 발송 실패: ' + error.message);
      return;
    }
    /* 가입 여부가 드러나지 않도록 항상 같은 문구를 보여준다.
       (없는 이메일이라고 알려주면 회원 여부를 캐낼 수 있다) */
    say('✅ 재설정 링크를 보냈습니다. 메일함을 확인해 주세요. 안 보이면 스팸함도 봐주세요.', true);
  }

  /* ───── 이메일(아이디) 찾기 ───── */
  async function handleFindId() {
    if (!name) {
      say('이름을 입력해 주세요');
      return;
    }
    if (!/^\d{4}$/.test(phone)) {
      say('연락처 뒤 4자리를 숫자로 입력해 주세요');
      return;
    }
    setLoading(true);
    setMessage('');
    setFoundEmail('');
    const { data, error } = await supabase.rpc('find_masked_email', {
      p_name: name,
      p_last4: phone,
    });
    setLoading(false);
    if (error) {
      say('조회 실패: ' + error.message);
      return;
    }
    if (!data) {
      say('일치하는 계정을 찾지 못했습니다. 이름과 연락처를 다시 확인해 주세요.');
      return;
    }
    setFoundEmail(data as string);
  }

  /* ───── 새 비밀번호 저장 ───── */
  async function handleReset() {
    if (password.length < 8) {
      say('비밀번호는 8자 이상으로 정해 주세요');
      return;
    }
    if (password !== password2) {
      say('두 비밀번호가 서로 다릅니다');
      return;
    }
    setLoading(true);
    setMessage('');
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      say('변경 실패: ' + error.message);
      return;
    }
    await supabase.auth.signOut();
    say('✅ 비밀번호가 바뀌었습니다. 새 비밀번호로 로그인해 주세요.', true);
  }

  const noteColor = ok ? '#2E7D32' : '#B23A48';

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

      {/* ═══════════ 로그인 ═══════════ */}
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
              <div style={{ position: 'relative' }}>
                <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" style={{ width: '100%', paddingRight: 48 }} />
                <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#2E5FAC' }}>
                  {showPw ? '숨기기' : '보기'}
                </button>
              </div>
            </div>
            <button className="submit" onClick={handleLogin} disabled={loading}>
              {loading ? '확인 중...' : '로그인'}
            </button>
            {message && <p className="note" style={{ color: noteColor, fontWeight: 600 }}>{message}</p>}

            <div className="find-row">
              <button type="button" className="link-btn" onClick={() => openModal('findid')}>이메일 찾기</button>
              <span className="find-sep">·</span>
              <button type="button" className="link-btn" onClick={() => openModal('findpw')}>비밀번호 찾기</button>
            </div>

            <p className="note">아직 계정이 없으신가요? 회원가입 후 선생님 승인을 받으면 입장할 수 있습니다.</p>
          </div>
        </div>
      )}

      {/* ═══════════ 회원가입 ═══════════ */}
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
              <label>연락처 뒤 4자리</label>
              <input type="text" inputMode="numeric" maxLength={4} value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="1234" />
              <p className="hint">나중에 이메일을 잊으셨을 때 본인 확인에 씁니다.</p>
            </div>
            <div className="field">
              <label>이메일</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" />
            </div>
            <div className="field">
              <label>비밀번호</label>
              <div style={{ position: 'relative' }}>
                <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8자 이상" style={{ width: '100%', paddingRight: 48 }} />
                <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#2E5FAC' }}>
                  {showPw ? '숨기기' : '보기'}
                </button>
              </div>
            </div>
            <button className="submit" onClick={handleSignup} disabled={loading}>
              {loading ? '신청 중...' : '가입 신청'}
            </button>
            {message && <p className="note" style={{ color: noteColor, fontWeight: 600 }}>{message}</p>}
            <p className="note">가입 후 선생님이 승인하면 강의실에 입장할 수 있습니다.</p>
          </div>
        </div>
      )}

      {/* ═══════════ 비밀번호 찾기 ═══════════ */}
      {modal === 'findpw' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModal(null)}>×</button>
            <h2>비밀번호 찾기</h2>
            <p className="lead">가입하신 이메일로 재설정 링크를 보내드립니다. 링크는 1시간 동안 쓸 수 있습니다.</p>
            <div className="field">
              <label>이메일</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" />
            </div>
            <button className="submit" onClick={handleFindPw} disabled={loading}>
              {loading ? '보내는 중...' : '재설정 링크 보내기'}
            </button>
            {message && <p className="note" style={{ color: noteColor, fontWeight: 600 }}>{message}</p>}
            <div className="find-row">
              <button type="button" className="link-btn" onClick={() => openModal('login')}>← 로그인으로</button>
              <span className="find-sep">·</span>
              <button type="button" className="link-btn" onClick={() => openModal('findid')}>이메일 찾기</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ 이메일(아이디) 찾기 ═══════════ */}
      {modal === 'findid' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModal(null)}>×</button>
            <h2>이메일 찾기</h2>
            <p className="lead">가입할 때 적으신 이름과 연락처 뒤 4자리로 확인합니다.</p>

            {!foundEmail ? (
              <>
                <div className="field">
                  <label>이름</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
                </div>
                <div className="field">
                  <label>연락처 뒤 4자리</label>
                  <input type="text" inputMode="numeric" maxLength={4} value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="1234" />
                </div>
                <button className="submit" onClick={handleFindId} disabled={loading}>
                  {loading ? '찾는 중...' : '이메일 찾기'}
                </button>
              </>
            ) : (
              <>
                <div className="found-box">
                  <div className="found-label">가입하신 이메일</div>
                  <div className="found-email">{foundEmail}</div>
                </div>
                <p className="note">개인정보 보호를 위해 일부만 보여드립니다. 전체 주소가 기억나지 않으시면 선생님께 문의해 주세요.</p>
                <button className="submit" onClick={() => openModal('login')}>로그인하러 가기</button>
              </>
            )}

            {message && <p className="note" style={{ color: noteColor, fontWeight: 600 }}>{message}</p>}
            <div className="find-row">
              <button type="button" className="link-btn" onClick={() => openModal('login')}>← 로그인으로</button>
              <span className="find-sep">·</span>
              <button type="button" className="link-btn" onClick={() => openModal('findpw')}>비밀번호 찾기</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ 새 비밀번호 설정 (메일 링크로 진입) ═══════════ */}
      {modal === 'reset' && (
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>새 비밀번호 설정</h2>
            <p className="lead">앞으로 쓰실 비밀번호를 정해 주세요.</p>

            {!ok && (
              <>
                <div className="field">
                  <label>새 비밀번호</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8자 이상" style={{ width: '100%', paddingRight: 48 }} />
                    <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#2E5FAC' }}>
                      {showPw ? '숨기기' : '보기'}
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label>새 비밀번호 확인</label>
                  <input type={showPw ? 'text' : 'password'} value={password2} onChange={(e) => setPassword2(e.target.value)} placeholder="한 번 더 입력" />
                </div>
                <button className="submit" onClick={handleReset} disabled={loading}>
                  {loading ? '저장 중...' : '비밀번호 변경'}
                </button>
              </>
            )}

            {message && <p className="note" style={{ color: noteColor, fontWeight: 600 }}>{message}</p>}

            {ok && (
              <button className="submit" onClick={() => { window.location.href = window.location.origin; }}>
                로그인하러 가기
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
