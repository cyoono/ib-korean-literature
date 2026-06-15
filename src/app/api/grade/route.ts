import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type GradeRequest = {
  prompt: string;
  answer: string;
  maxScore?: number;
  workTitle?: string;
  lessonTitle?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GradeRequest;
    const { prompt, answer, maxScore = 7, workTitle = '', lessonTitle = '' } = body;

    if (!answer || answer.trim() === '') {
      return NextResponse.json({ score: 0, feedback: '답안이 제출되지 않았습니다.' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API 키가 설정되지 않았습니다.' }, { status: 500 });
    }

    // 답안이 너무 길면 앞부분만 (비용 가드)
    const safeAnswer = answer.length > 4000 ? answer.slice(0, 4000) : answer;

    const systemPrompt = [
      '당신은 IB Korean A: Literature 과정의 채점 보조자입니다.',
      '세터스 어학원의 "글로컬 K-문학" 커리큘럼 기준으로 학생 답안을 채점합니다.',
      '',
      '채점 원칙:',
      `1. 점수는 0부터 ${maxScore}까지의 정수 하나만 부여한다 (소수점 금지).`,
      '2. 문항이 요구하는 핵심 논점을 얼마나 충실히 다루는지, 텍스트 근거가 정확한지를 우선 평가한다.',
      '3. 단순 줄거리 요약이나 문항과 무관한 내용은 감점한다.',
      '4. 피드백은 한국어 1~2문장. 첫 문장은 잘한 점, 둘째 문장은 보완점. 학생이 직접 읽으므로 존댓말로 구체적으로 쓴다.',
      '5. 반드시 아래 JSON 형식만 출력한다. 다른 텍스트나 마크다운 백틱은 금지한다.',
      '',
      '출력 형식: {"score": <0-' + maxScore + ' 정수>, "feedback": "<1-2문장>"}',
    ].join('\n');

    const userPrompt = [
      workTitle ? `[작품/과정] ${workTitle}` : '',
      lessonTitle ? `[차시] ${lessonTitle}` : '',
      '',
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
        max_tokens: 600,
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
    if (feedback.length > 200) feedback = feedback.slice(0, 200);

    return NextResponse.json({ score, feedback });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '알 수 없는 오류';
    return NextResponse.json({ error: '서버 오류: ' + msg }, { status: 500 });
  }
}