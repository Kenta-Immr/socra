# Socra

> **AI that asks, not answers.**

Most AI tools give you one answer. Socra gives you **7 perspectives** — then asks *you* what you'll do next.

**[Live Demo](https://socra-seven.vercel.app)** | AI Agent Olympics Hackathon 2026

---

## What is Socra?

Socra is a **Socratic AI facilitation tool** that transforms how people make decisions. Instead of giving a single "best answer," it orchestrates 7 AI agents — each with a distinct thinking style — to explore your question from every angle.

The result? You don't just get an answer. You get **clarity**.

## How It Works

```
You ask a question
    ↓
叡 (Ei) asks 3 clarifying questions to understand your context
    ↓
明 (Mei) gathers real-world facts with web search
    ↓
情 (Jo) · 戒 (Kai) · 光 (Ko) · 創 (So) debate in parallel
    ↓
理 (Ri) checks for contradictions and logic gaps
    ↓
叡 (Ei) synthesizes everything and asks: "What will YOU do next?"
```

Your thinking process is visualized as a **live mind map** that grows with each round of conversation.

## The 7 Perspectives

| Agent | Role | Model |
|-------|------|-------|
| 🔍 **明 (Mei)** | Facts & Evidence | Gemini 2.5 Flash (with Google Search Grounding) |
| ❤️ **情 (Jo)** | Gut Feeling & Values | Claude Haiku 4.5 |
| ⚫ **戒 (Kai)** | Risks & Warnings | Claude Haiku 4.5 |
| ✨ **光 (Ko)** | Opportunities & Optimism | Claude Haiku 4.5 |
| 🌱 **創 (So)** | Creative Alternatives | Claude Haiku 4.5 |
| ⚡ **理 (Ri)** | Logic & Contradiction Check | GPT-4o |
| 🔮 **叡 (Ei)** | Synthesis & Mentorship | Claude Sonnet 4.5 |

## Why Socra?

**The problem:** Important decisions are often made alone, with limited perspective. AI chatbots make this worse by giving confident single answers.

**Our approach:** Inspired by Edward de Bono's thinking frameworks and the Japanese philosophy of *"動機善なりか"* (Is your motivation good?) from Kazuo Inamori — Socra doesn't decide for you. It illuminates blind spots, surfaces contradictions, and returns the decision to where it belongs: **you**.

## Tech Stack

- **Frontend:** Next.js 14, D3.js (force-directed mind map), Tailwind CSS
- **AI Pipeline:** 5-stage SSE streaming pipeline orchestrating 3 providers
  - Anthropic Claude (Sonnet 4.5 + Haiku 4.5)
  - Google Gemini 2.5 Flash (with Search Grounding)
  - OpenAI GPT-4o
- **Architecture:** Agentic engineering — diversity comes from deep persona design, not just model differences

## Quick Start

```bash
git clone https://github.com/Kenta-Immr/socra.git
cd socra
npm install
cp .env.local.example .env.local  # Add your API keys
npm run dev
```

## Demo Scenarios

Try these questions to see Socra in action:

1. **Career:** "Should I leave my stable job to start a business?"
2. **Business:** "Should I hire a full-time developer or use freelancers?"
3. **Strategy:** "Should we expand to a new market or deepen our current one?"

## License

MIT

---

Built for [AI Agent Olympics Hackathon 2026](https://lablab.ai) — Milan AI Week, May 13-20, 2026
