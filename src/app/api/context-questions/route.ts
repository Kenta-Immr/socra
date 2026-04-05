// Stage 0 対話型: 叡（Ei）がユーザーに3問の文脈質問を生成する
import { generateObject } from 'ai'
import { z } from 'zod'
import { anthropic } from '@ai-sdk/anthropic'

export async function POST(req: Request) {
  const { question } = await req.json()

  if (!question || typeof question !== 'string') {
    return Response.json({ error: 'question is required' }, { status: 400 })
  }

  try {
    const { object } = await generateObject({
      model: anthropic('claude-sonnet-4-20250514'),
      schema: z.object({
        questions: z.array(z.string()).max(3).describe('Up to 3 context questions'),
      }),
      prompt: `You are Ei (叡), the mentor of Socra — an AI decision-making team.

A user has asked: "${question}"

Before your team analyzes this, you need to understand the context better. Generate up to 3 short, focused questions that will help your team give better advice.

## Priority order for questions (ask the MOST important first):
1. **What is your specific situation?** — Industry, role, company size, what you actually do. Without this, the team will guess and get it wrong.
2. **What constraints exist?** — Budget, timeline, resources, commitments
3. **What matters most to you?** — The one thing that would make this decision a success or failure

## Rules
- Each question should reveal critical context that PREVENTS the team from guessing wrong
- The #1 priority is understanding WHO the user is and WHAT their situation is. Never skip this.
- Be warm but concise. You're a mentor, not an interrogator.
- If the question is already very specific and clear, generate fewer questions (even 1 is fine)
- Questions should be in the same language as the user's question
- Each question should be 1 sentence, direct and easy to answer

Example good questions:
- "あなたの事業や立場を教えていただけますか？"
- "使える予算や期間の目安はありますか？"
- "この判断で最も重視していることは何ですか？"`,
    })

    return Response.json(object)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
