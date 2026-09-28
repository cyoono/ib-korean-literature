import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type GradeRequest = {
  prompt: string;
  answer: string;
  maxScore?: number;
  workTitle?: string;
  lessonTitle?: string;
  passage?: string;
  mode?: 'assignment' | 'prequestion';
  reference?: string;
};

type Msg = { role: 'user' | 'assistant'; content: string };

const MODEL = 'claude-sonnet-4-6';

/* 비교용 정규화: 공백·따옴표·문장부호 차이를 무시한다 */
function norm(t: string) {
  return t.replace(/[\s'"‘’“”「」『』.,…·!?~\-—()]/g, '');
}

/* 피드백 안의 인용구('…', "…", ‘…’, “…”)를 뽑는다 */
function extractQuotes(fb: string): string[] {
  const out: string[] = [];
  const re = /['‘"“]([^'’"”\n]{4,})['’"”]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fb)) !== null) out.push(m[1].trim());
  return out;
}

async function callModel(apiKey: string, system: string, messages: Msg[]) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, temperature: 0, system, messages }),
  });
  if (!res.ok) throw new Error('AI 채점 호출 실패: ' + (await res.text()));
  const data = await res.json();
  const textBlock = Array.isArray(data.content)
    ? data.content.find((c: { type: string }) => c.type === 'text')
    : null;
  return textBlock && textBlock.text ? (textBlock.text as string) : '';
}

function parse(rawIn: string): { score?: number; correct?: boolean; feedback?: string } | null {
  let raw = rawIn.replace(/```json/g, '').replace(/```/g, '').trim();
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s >= 0 && e >= 0) raw = raw.slice(s, e + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GradeRequest;
    const { prompt, answer, maxScore = 7, workTitle = '', lessonTitle = '', passage = '', mode = 'assignment', reference = '' } = body;
    const isPq = mode === 'prequestion';

    if (!answer || answer.trim() === '') {
      return NextResponse.json({ score: 0, feedback: '답안이 제출되지 않았습니다.' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API 키가 설정되지 않았습니다.' }, { status: 500 });
    }

    // 비용 가드
    const safeAnswer = answer.length > 4000 ? answer.slice(0, 4000) : answer;
    const safePassage = passage.length > 15000 ? passage.slice(0, 15000) : passage;
    const hasPassage = safePassage.trim() !== '';

    /* 사전 질문: 본문 안에서만 답·채점. 과제: 작품 전체·작가·시대·비평 등 조사한 내용 모두 활용 가능 */
    /* 과제라도 문항에 "본문"이 명시돼 있으면(예: "본문에서 근거를 찾아") 본문 한정으로 채점 */
    const promptSaysPassage = /본문|제시문|발췌문|지문/.test(prompt || '');
    const restrict = hasPassage && (isPq || promptSaysPassage);
    const src = restrict ? '[본문]' : '작품';

    const systemPrompt = [
      '당신은 IB Korean A: Literature 과정의 채점 보조자입니다.',
      '세터스 어학원의 "글로컬 K-문학" 커리큘럼 기준으로 학생 답안을 채점합니다.',
      '',
      ...(!restrict && hasPassage
        ? [
            '참고 — 과제의 근거 범위:',
            '- [본문]은 이번 회차의 발췌문이다. 과제는 본문에 한정되지 않는다. 학생은 작품 전체, 작가와 시대 맥락, 비평, 스스로 조사한 자료를 근거로 써도 된다.',
            '- 본문 밖 내용을 썼다는 이유로 감점하지 않는다. 대신 그 내용이 사실과 맞는지, 문항과 논지에 제대로 연결되는지를 평가하고, 사실과 다르면 아쉬운 점에서 정확히 바로잡는다.',
            '- 조사한 내용을 작품의 구체적 장면·표현과 연결해 논지를 세웠다면 강점으로 평가한다.',
            '',
          ]
        : []),
      ...(restrict
        ? [
            '가장 중요한 규칙 — 본문 한정:',
            (isPq ? '- 이 사전 질문은' : '- 이 문항은 "본문"을 근거로 삼으라고 명시했으므로,') + ' [본문]으로 주어진 발췌문 하나만 읽고 답하는 질문이다. 당신이 이 작품의 전체 줄거리·결말·다른 장·작가 생애·비평을 알고 있더라도 절대 사용하지 않는다.',
            '- 채점 근거, 피드백의 설명, 예시, 인용, 제안은 모두 [본문]에 실제로 적힌 문장과 [학생 답안]에서만 가져온다.',
            '- [본문]에 등장하지 않는 인물·사건·장면(예: 본문 이후에 일어나는 일)을 피드백에서 언급하지 않는다.',
            '- 피드백에서 작은따옴표로 인용하는 말은 [본문] 또는 [학생 답안]에 글자 그대로 있는 구절이어야 한다.',
            '- 학생이 [본문]에 없는 내용을 근거로 쓰면 근거로 인정하지 않고 감점하며, 아쉬운 점에서 "본문에 없는 내용"이라고 짚고 대신 쓸 수 있는 [본문]의 구절을 인용해 알려 준다.',
            '',
          ]
        : []),
      '채점 원칙:',
      isPq
        ? '1. 이것은 강의 전 "사전 질문"에 대한 짧은 답이다. [참고 답안]과 [본문]에 비추어 핵심을 맞게 짚었으면 correct=true, 아니면 false. 표현이 달라도 뜻이 맞으면 정답으로 본다.'
        : `1. 점수는 0부터 ${maxScore}까지의 정수 하나만 부여한다 (소수점 금지).`,
      `2. 문항이 요구하는 핵심 논점을 얼마나 충실히 다루는지, ${src}의 근거가 정확한지를 우선 평가한다.`,
      '3. 단순 줄거리 요약이나 문항과 무관한 내용은 감점한다.',
      '4. 피드백은 학생이 직접 읽는다. 존댓말로, 반드시 정확히 5줄로 쓰고 줄 사이는 \\n 으로 구분한다.',
      `   1줄: "✔ 잘한 점: " 으로 시작. 학생 답안의 표현을 작은따옴표로 짧게 인용하고, 그 생각이 왜 타당한지 ${src}의 구체적 구절과 연결해 설명한다.`,
      '   2줄: "✔ 잘한 점: " 으로 시작. 1줄과 다른 두 번째 강점을 같은 방식으로 설명한다. 강점이 하나뿐이면 그 강점이 문항의 어떤 요구를 충족했는지 구체적으로 쓴다.',
      '   3줄: "△ 아쉬운 점: " 으로 시작. 학생 답안의 특정 부분을 인용하거나 지목하고, 무엇이 부족·부정확한지(근거 부족, 해석 비약, 요약에 머묾, 문항 요구 누락' + (restrict ? ', 본문 밖 내용 사용' : ', 사실 오류') + ' 등) 분명히 밝힌다.',
      '   4줄: "△ 아쉬운 점: " 으로 시작. 3줄과 다른 두 번째 보완점을 같은 방식으로 쓴다.',
      `   5줄: "→ 다음에는: " 으로 시작. 이 답안을 한 단계 올리기 위해 ${src}에서 근거로 쓸 만한 구절 하나를 작은따옴표로 직접 인용해 제시한다.`,
      `   "좋습니다", "더 깊이 분석하세요" 같은 추상적 표현만으로 끝내지 말고, 모든 줄에 답안이나 ${src}의 구체적 내용을 넣는다. 각 줄은 1~2문장.`,
      '5. 반드시 아래 JSON 형식만 출력한다. 다른 텍스트나 마크다운 백틱은 금지한다.',
      '',
      isPq
        ? '출력 형식: {"correct": <true 또는 false>, "feedback": "<5줄, 줄 사이는 \\n>"}'
        : '출력 형식: {"score": <0-' + maxScore + ' 정수>, "feedback": "<5줄, 줄 사이는 \\n>"}',
    ].join('\n');

    const userPrompt = [
      // 본문이 있으면 작품 제목은 넣지 않는다 — 제목이 작품 전체 지식을 끌어오기 때문
      !restrict && workTitle ? `[작품/과정] ${workTitle}` : '',
      lessonTitle ? `[차시] ${lessonTitle}` : '',
      '',
      hasPassage
        ? (restrict ? '[본문] (채점과 피드백의 유일한 근거)\n' : '[본문] (이번 회차 발췌문 — 참고용, 근거를 여기에 한정하지 않음)\n') + safePassage + '\n'
        : '',
      isPq && reference ? '[참고 답안] (선생님이 정한 모범 답. 학생에게 그대로 알려 주지 말고 판단 기준으로만 쓸 것)\n' + reference + '\n' : '',
      isPq ? '[사전 질문]' : '[문항]',
      prompt,
      '',
      '[학생 답안]',
      safeAnswer,
    ].filter(Boolean).join('\n');

    const messages: Msg[] = [{ role: 'user', content: userPrompt }];
    let raw = await callModel(apiKey, systemPrompt, messages);
    let parsed = parse(raw);

    /* 본문 한정 검사: 피드백의 인용구가 본문·답안에 실제로 있는지 확인하고, 없으면 한 번 다시 쓰게 한다 */
    if (restrict && parsed && parsed.feedback) {
      const pool = norm(safePassage) + '|' + norm(safeAnswer);
      const bad = extractQuotes(parsed.feedback).filter((q) => {
        const n = norm(q);
        return n.length >= 3 && !pool.includes(n);
      });
      if (bad.length > 0) {
        messages.push({ role: 'assistant', content: raw });
        messages.push({
          role: 'user',
          content:
            '다음 인용은 [본문]과 [학생 답안] 어디에도 없습니다: ' +
            bad.map((b) => "'" + b + "'").join(', ') +
            '\n작품의 다른 부분이나 배경지식을 쓰지 말고, [본문]과 [학생 답안]에 글자 그대로 있는 구절만 인용해서 같은 JSON 형식으로 다시 작성하세요.',
        });
        const raw2 = await callModel(apiKey, systemPrompt, messages);
        const parsed2 = parse(raw2);
        if (parsed2 && (typeof parsed2.score === 'number' || typeof parsed2.correct === 'boolean') && parsed2.feedback) {
          raw = raw2;
          parsed = parsed2;
        }
      }
    }

    if (!parsed) {
      return NextResponse.json({ error: 'AI 응답을 해석하지 못했습니다.', needsReview: true }, { status: 200 });
    }

    if (isPq) {
      let fbPq = (parsed.feedback || '').toString().trim().replace(/\\n/g, '\n');
      if (fbPq.length > 1500) fbPq = fbPq.slice(0, 1500);
      return NextResponse.json({ correct: parsed.correct === true, feedback: fbPq });
    }

    const score = typeof parsed.score === 'number' ? Math.round(parsed.score) : null;
    if (score == null || isNaN(score) || score < 0 || score > maxScore) {
      return NextResponse.json({ error: '점수 형식이 올바르지 않습니다.', needsReview: true }, { status: 200 });
    }

    let feedback = (parsed.feedback || '').toString().trim();
    feedback = feedback.replace(/\\n/g, '\n');
    if (feedback.length > 1500) feedback = feedback.slice(0, 1500);

    return NextResponse.json({ score, feedback });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '알 수 없는 오류';
    return NextResponse.json({ error: '서버 오류: ' + msg }, { status: 500 });
  }
}
