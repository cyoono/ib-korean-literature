import { NextRequest, NextResponse } from 'next/server';
import { resolveAnthropic } from '@/lib/anthropicKey';

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

async function callModel(apiKey: string, system: string, messages: Msg[], model = MODEL, maxTokens = 1500) {
  const res = await fetch(resolveAnthropic().baseUrl + '/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      /* 워크스페이스에 묶이지 않은 조직 키를 쓸 때만 필요 */
      ...(process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID.trim() } : {}),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0, system, messages }),
  });
  if (!res.ok) throw new Error('AI 채점 호출 실패: ' + (await res.text()));
  const data = await res.json();
  const textBlock = Array.isArray(data.content)
    ? data.content.find((c: { type: string }) => c.type === 'text')
    : null;
  return textBlock && textBlock.text ? (textBlock.text as string) : '';
}

type Parsed = { score?: number; correct?: boolean; verdict?: string; grade?: string; feedback?: string; model_answer?: string; A?: number; B?: number; C?: number; D?: number };
function parse(rawIn: string): Parsed | null {
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
    const { prompt, answer, maxScore = 7, workTitle = '', lessonTitle = '', passage = '', mode = 'assignment' } = body;
    const isPq = mode === 'prequestion';

    if (!answer || answer.trim() === '') {
      return NextResponse.json({ score: 0, feedback: '답안이 제출되지 않았습니다.' });
    }

    const apiKey = resolveAnthropic().key;
    if (!apiKey) {
      return NextResponse.json({ error: 'API 키가 설정되지 않았습니다.' }, { status: 500 });
    }

    // 비용 가드
    const safeAnswer = answer.length > 12000 ? answer.slice(0, 12000) : answer; // 1000단어 과제 수용
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
        ? '1. 이것은 강의 전 "사전 질문"에 대한 짧은 답이다. 먼저 [사전 질문]을 정확히 읽고, [본문]만 근거로 이 질문의 올바른 답을 스스로 정한다(model_answer). 그 기준으로 학생 답이 질문이 묻는 핵심을 맞게 짚었으면 correct=true, 아니면 false. 표현이 달라도 뜻이 맞으면 정답으로 본다. 질문이 묻지 않은 것을 기준으로 삼지 않는다.'
        : [
            '1. IB Language A: Literature Paper 1(문학 텍스트 분석) 채점 기준으로 네 영역을 각각 0~5점 정수로 채점한다 (총 20점).',
            '   A. 이해와 해석 (Understanding and interpretation): 텍스트를 얼마나 잘 이해하고, 타당한 추론과 함의를 끌어내는가? 주장을 텍스트 근거로 얼마나 잘 뒷받침하는가?',
            '   B. 분석과 평가 (Analysis and evaluation): 텍스트의 특징과 작가의 선택(문체, 구조, 서술 시점, 이미지, 어조 등)이 의미를 어떻게 만드는지 얼마나 분석하고 평가하는가?',
            '   C. 초점과 구성 (Focus and organization): 생각이 얼마나 짜임새 있고 일관되며 초점이 분명하게 전개되는가?',
            '   D. 언어 (Language): 언어가 얼마나 명료하고 다양하며 정확한가? 문체·어투(register)·문학 용어 사용이 적절한가?',
            '   각 영역 점수대: 0=기준 미달, 1=매우 미흡(거의 없음), 2=부분적·피상적, 3=적절하나 일반적, 4=좋음·설득력 있음, 5=탁월함·통찰력 있음.',
            '   줄거리 요약에 머문 답은 A·B에서 2점을 넘기 어렵다. 문항과 무관한 내용은 C에서 감점한다.',
          ].join('\n'),
      `2. 문항이 요구하는 핵심 논점을 얼마나 충실히 다루는지, ${src}의 근거가 정확한지를 우선 평가한다.`,
      isPq ? '3. 단순 줄거리 요약이나 문항과 무관한 내용은 감점한다.' : '3. 피드백의 잘한 점·아쉬운 점은 가능하면 A~D 중 어느 영역에 해당하는지 괄호로 밝힌다. 예: "(B 분석과 평가)"',
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
        ? '출력 형식: {"model_answer": "<본문에 근거한 모범 답 1~3문장>", "correct": <true 또는 false>, "feedback": "<5줄, 줄 사이는 \\n>"}'
        : '출력 형식: {"A": <0-5 정수>, "B": <0-5 정수>, "C": <0-5 정수>, "D": <0-5 정수>, "feedback": "<5줄, 줄 사이는 \\n>"}',
    ].join('\n');

    /* 사전 질문 전용 지시문: 짧은 답을 질문·본문과 대조해 정확히 판정하고 구체적으로 피드백 */
    const pqSystemPrompt = [
      '당신은 IB Korean A: Literature 교사입니다. 학생은 이번 회차 [본문]을 읽고 강의 전 [사전 질문]에 짧게 답했습니다.',
      '',
      '절대 규칙:',
      '- 근거는 오직 [본문]이다. 이 작품의 다른 부분, 결말, 작가 생애, 해설 지식은 알고 있더라도 쓰지 않는다.',
      '- 피드백과 모범 답안에서 작은따옴표로 인용하는 말은 [본문] 또는 [학생 답안]에 글자 그대로 있는 구절이어야 한다.',
      '',
      '평가의 두 축:',
      '① 질문과 답의 상관관계: 학생 답이 [사전 질문]이 실제로 묻는 것에 정면으로 답하는가? 질문의 일부만 답했거나, 질문과 다른 것을 말했거나, 질문을 되풀이하기만 했는지 본다.',
      '② 팩트 체크: 학생 답에 담긴 사실(인물, 사건, 순서, 시간, 장소, 누가 무엇을 했는지, 인용한 표현)이 [본문]과 일치하는가? 본문과 다르거나 본문에 없는 내용이 있으면 정확히 짚는다.',
      '',
      '등급 (grade):',
      '- A: 질문에 정면으로 답했고, 사실이 모두 본문과 맞으며, 본문 근거까지 제시했다.',
      '- B: 질문에 맞게 답했고 사실도 맞지만, 근거가 약하거나 표현이 다소 모호하다.',
      '- C: 질문의 핵심 일부만 답했거나, 사실은 맞지만 질문과의 연결이 느슨하다.',
      '- D: 질문과 어긋난 부분이 크거나, 본문과 다른 사실이 섞여 있다.',
      '- F: 질문과 무관하거나, 핵심 사실이 본문과 틀렸거나, 사실상 답이 없다.',
      '',
      '먼저 속으로 [사전 질문]이 묻는 것을 파악하고, [본문]에서 답의 근거 구절을 찾아 model_answer(1~3문장, 근거 구절 인용 포함)를 정한 뒤, 학생 답을 두 축으로 대조해 등급을 매긴다.',
      '',
      '피드백: 학생이 직접 읽는다. 존댓말, 3~5줄, 줄 사이는 \\n. 각 줄 1~2문장. 아래 머리말을 써서 두 축을 중심으로 쓴다.',
      '   "🎯 질문과의 연결: " — 답이 질문에 얼마나 정면으로 답했는지, 빠진 부분이 무엇인지. (필수, 1줄)',
      '   "🔎 팩트 체크: " — 답 속 사실이 본문과 맞는지. 맞으면 해당 본문 구절을 인용해 확인해 주고, 틀리면 학생 표현을 인용한 뒤 본문 구절로 바로잡는다. (필수, 1~2줄)',
      '   "→ 다음에는: " — 본문에서 다시 볼 구절 하나를 인용하고, 답을 어떻게 고치면 되는지 짧게 제시한다. (필수, 1줄)',
      '   필요하면 "✔ 잘한 점: " 한 줄을 맨 앞에 더할 수 있다.',
      '   "좋습니다", "더 생각해 보세요"처럼 내용 없는 말은 쓰지 않는다.',
      '',
      '반드시 아래 JSON만 출력한다. 다른 텍스트나 백틱 금지.',
      '{"grade": "A" | "B" | "C" | "D" | "F", "model_answer": "<본문 근거 인용을 포함한 모범 답 1~3문장>", "feedback": "<3~5줄, 줄 사이는 \\n>"}',
    ].join('\n');

    const userPrompt = [
      // 본문이 있으면 작품 제목은 넣지 않는다 — 제목이 작품 전체 지식을 끌어오기 때문
      !restrict && workTitle ? `[작품/과정] ${workTitle}` : '',
      lessonTitle ? `[차시] ${lessonTitle}` : '',
      '',
      hasPassage
        ? (restrict ? '[본문] (채점과 피드백의 유일한 근거)\n' : '[본문] (이번 회차 발췌문 — 참고용, 근거를 여기에 한정하지 않음)\n') + safePassage + '\n'
        : '',
      isPq ? '[사전 질문]' : '[문항]',
      prompt,
      '',
      '[학생 답안]',
      safeAnswer,
    ].filter(Boolean).join('\n');

    const messages: Msg[] = [{ role: 'user', content: userPrompt }];
    const useModel = MODEL; /* 사전 질문도 정확도를 위해 Sonnet 사용 */
    const useMax = isPq ? 1000 : 1500;
    const sysUsed = isPq ? pqSystemPrompt : systemPrompt;
    let raw = await callModel(apiKey, sysUsed, messages, useModel, useMax);
    let parsed = parse(raw);

    /* 본문 한정 검사: 피드백의 인용구가 본문·답안에 실제로 있는지 확인하고, 없으면 한 번 다시 쓰게 한다 */
    if (restrict && parsed && parsed.feedback) {
      const pool = norm(safePassage) + '|' + norm(safeAnswer);
      const bad = extractQuotes(parsed.feedback + '\n' + (parsed.model_answer || '')).filter((q) => {
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
        const raw2 = await callModel(apiKey, sysUsed, messages, useModel, useMax);
        const parsed2 = parse(raw2);
        if (parsed2 && (typeof parsed2.A === 'number' || typeof parsed2.grade === 'string') && parsed2.feedback) {
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
      const modelAnswer = (parsed.model_answer || '').toString().trim();
      const g = (parsed.grade || '').toString().trim().toUpperCase().charAt(0);
      const grade = ['A', 'B', 'C', 'D', 'F'].includes(g) ? g : 'F';
      /* A·B는 통과(정답 처리), C 이하는 보완 필요 */
      return NextResponse.json({ correct: grade === 'A' || grade === 'B', grade, verdict: grade, feedback: fbPq, modelAnswer });
    }

    /* Paper 1 기준 A~D 각 0~5점 → 총 20점. 과제 만점이 20이 아니면 비율로 환산 */
    const crit = (['A', 'B', 'C', 'D'] as const).map((k) => {
      const v = parsed![k];
      return typeof v === 'number' && !isNaN(v) ? Math.max(0, Math.min(5, Math.round(v))) : null;
    });
    if (crit.some((v) => v === null)) {
      return NextResponse.json({ error: '점수 형식이 올바르지 않습니다.', needsReview: true }, { status: 200 });
    }
    const [a, b, c, d] = crit as number[];
    const total = a + b + c + d;
    const score = maxScore === 20 ? total : Math.round((total / 20) * maxScore);

    let feedback = (parsed.feedback || '').toString().trim();
    feedback = feedback.replace(/\\n/g, '\n');
    if (feedback.length > 1500) feedback = feedback.slice(0, 1500);
    const breakdown =
      '[IB Paper 1 기준] A 이해와 해석 ' + a + '/5 · B 분석과 평가 ' + b + '/5 · C 초점과 구성 ' + c + '/5 · D 언어 ' + d + '/5 → 총 ' + total + '/20' +
      (maxScore === 20 ? '' : ' (' + maxScore + '점 만점 환산 ' + score + '점)');
    feedback = breakdown + '\n\n' + feedback;

    return NextResponse.json({ score, feedback });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '알 수 없는 오류';
    return NextResponse.json({ error: '서버 오류: ' + msg }, { status: 500 });
  }
}
