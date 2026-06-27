# The Daily Tako — Short Demo Script

*The frame: **CopilotKit is the hands, Tako is the eyes.** CopilotKit runs the chat and turns my words into real edits; Tako supplies the live facts and the raw numbers behind every chart.*

---

**1. Open the Copy Desk.**
"This chat panel is **CopilotKit**. The whole app is wrapped in `<CopilotKit>`, the panel is `<CopilotSidebar>`, and it talks to a `CopilotRuntime` + `OpenAIAdapter` backend at `/api/copilotkit`. Why CopilotKit? It gives us a chat that can actually *do things* in the app, not just talk."

**2. "Notice it already knows what's on the page."**
"I never tell it which story I mean. We hand it the whole edition with `useCopilotReadable`, addressed by page and article — that's how it targets edits precisely."

**3. Rewrite a story — "tighten the lead and sharpen the headline."**
"That's a CopilotKit frontend action, `useCopilotAction` (`editArticle`). The handler runs in the browser against our state, so it applies instantly. No live data needed — pure rewrite."

**4. Ask a live question — "what's the latest US GDP figure?"**
"Here's why **Tako** exists. CopilotKit alone only knows the model's training data — it can't know today's number. So the `askTako` action calls Tako: `tako_search` for live data and web, `tako_contents` for the raw figures, both from `@takoviz/ai-sdk`. The answer streams in with real citations. Tako makes it *true and current*."

**5. Add a researched section with a chart.**
"This is the combo. `addSection` (CopilotKit) opens the section; Tako researches it live. The chart appears right in the chat — that's the action's `render` prop mounting our real chart component. And because `tako_contents` returns raw numbers, not a picture, I can then reshape it: `editChart` to switch type or filter the range. That editable chart is the proof the data is real."

---

**Why both, in one line:** CopilotKit decides *what to do* (chat → `useCopilotAction` edits, `useCopilotReadable` context); Tako supplies *what's true* (`tako_search` + `tako_contents` → live facts and chartable numbers). Interface vs. ground truth.
