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

## Rules
- Each question should reveal critical context that changes the analysis
- Ask about: current situation, constraints, what they've already tried, what matters most
- Be warm but concise. You're a mentor, not an interrogator.
- If the question is already very specific and clear, generate fewer questions (even 1 is fine)
- Questions should be in the same language as the user's question
- Each question should be 1 sentence, direct and easy to answer

Example good questions:
- "What's your current budget range for this?"
- "Have you already tried any alternatives?"
- "What's the deadline you're working with?"`,
    })

    return Response.json(object)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
