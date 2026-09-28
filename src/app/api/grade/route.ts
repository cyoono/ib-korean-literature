import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type GradeRequest = {
  prompt: string;
  answer: string;
  maxScore?: number;
  workTitle?: string;
  lessonTitle?: string;
  passage?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GradeRequest;
    const { prompt, answer, maxScore = 7, workTitle = '', lessonTitle = '', passage = '' } = body;

    if (!answer || answer.trim() === '') {
      return NextResponse.json({ score: 0, feedback: '답안이 제출되지 않았습니다.' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API 키가 설정되지 않았습니다.' }, { status: 500 });
    }

    // 답안이 너무 길면 앞부분만 (비용 가드)
    const safeAnswer = answer.length > 4000 ? answer.slice(0, 4000) : answer;
    const safePassage = passage.length > 15000 ? passage.slice(0, 15000) : passage;

    const systemPrompt = [
      '당신은 IB Korean A: Literature 과정의 채점 보조자입니다.',
      '세터스 어학원의 "글로컬 K-문학" 커리큘럼 기준으로 학생 답안을 채점합니다.',
      '',
      '채점 원칙:',
      '0. [본문]이 주어지면, 채점과 피드백은 오직 그 본문만을 기준으로 한다.',
      '   - 학생 답안의 근거가 본문에 실제로 있는 내용인지 확인한다. 본문에 없는 장면·인물·사건·배경지식(작품의 다른 부분, 작가 생애, 인터넷 해설 등)에 기댄 주장은 근거로 인정하지 않고 감점한다.',
      '   - 피드백에서 인용하거나 제안하는 장면·표현도 반드시 [본문] 안에서만 고른다. 본문에 없는 장면을 예로 들지 않는다.',
      '   - 학생이 본문 밖 내용을 썼다면 아쉬운 점에서 "본문에 없는 내용"이라고 분명히 짚고, 대신 본문의 어느 표현을 근거로 삼을 수 있는지 알려 준다.',
      `1. 점수는 0부터 ${maxScore}까지의 정수 하나만 부여한다 (소수점 금지).`,
      '2. 문항이 요구하는 핵심 논점을 얼마나 충실히 다루는지, 텍스트 근거가 정확한지를 우선 평가한다.',
      '3. 단순 줄거리 요약이나 문항과 무관한 내용은 감점한다.',
      '4. 피드백은 학생이 직접 읽는다. 존댓말로, 반드시 정확히 5줄로 쓰고 줄 사이는 \\n 으로 구분한다.',
      '   1줄: "✔ 잘한 점: " 으로 시작. 학생 답안의 표현을 작은따옴표로 짧게 인용하고, 그 생각이 왜 타당한지 작품의 구체적 장면·인물·표현과 연결해 설명한다.',
      '   2줄: "✔ 잘한 점: " 으로 시작. 1줄과 다른 두 번째 강점을 같은 방식으로 인용과 근거를 들어 설명한다. 강점이 하나뿐이면 그 강점이 문항의 어떤 요구를 충족했는지 구체적으로 쓴다.',
      '   3줄: "△ 아쉬운 점: " 으로 시작. 학생 답안의 특정 부분을 인용하거나 지목하고, 무엇이 부족·부정확한지(근거 부족, 해석 비약, 요약에 머묾, 문항 요구 누락 등) 분명히 밝힌다.',
      '   4줄: "△ 아쉬운 점: " 으로 시작. 3줄과 다른 두 번째 보완점을 같은 방식으로 쓴다.',
      '   5줄: "→ 다음에는: " 으로 시작. 이 답안을 한 단계 올리기 위해 [본문]에서 인용할 만한 표현이나 장면 하나를 직접 인용해 제시한다.',
      '   "좋습니다", "더 깊이 분석하세요" 같은 추상적 표현만으로 끝내지 말고, 모든 줄에 답안이나 작품의 구체적 내용을 넣는다. 각 줄은 1~2문장.',
      '5. 반드시 아래 JSON 형식만 출력한다. 다른 텍스트나 마크다운 백틱은 금지한다.',
      '',
      '출력 형식: {"score": <0-' + maxScore + ' 정수>, "feedback": "<5줄, 줄 사이는 \\n>"}',
    ].join('\n');

    const userPrompt = [
      workTitle ? `[작품/과정] ${workTitle}` : '',
      lessonTitle ? `[차시] ${lessonTitle}` : '',
      '',
      safePassage ? '[본문] (이 본문만을 근거로 채점할 것)\n' + safePassage + '\n' : '',
      '[문항]',
      prompt,
      '',
      '[학생 답안]',
      safeAnswer,
    ].filter(Boolean).join('\n');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: 'AI 채점 호출 실패: ' + errText }, { status: 502 });
    }

    const data = await res.json();
    const textBlock = Array.isArray(data.content)
      ? data.content.find((c: { type: string }) => c.type === 'text')
      : null;
    let raw = textBlock && textBlock.text ? textBlock.text : '';

    // 백틱이나 여분 텍스트 제거 후 JSON 파싱
    raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd >= 0) {
      raw = raw.slice(jsonStart, jsonEnd + 1);
    }

    let parsed: { score?: number; feedback?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'AI 응답을 해석하지 못했습니다.', needsReview: true }, { status: 200 });
    }

    let score = typeof parsed.score === 'number' ? Math.round(parsed.score) : null;
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