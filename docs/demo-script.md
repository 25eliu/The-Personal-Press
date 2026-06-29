# The Daily Tako — Demo Script

*Plain text = what you say. Italics = what you do.*

---

**Open.**
"Generative UI lets agents build delightful interfaces on the fly — but they're only as good as the data behind them. Tako's new **Contents API** fixes that: real-time, structured data from trusted sources, in a shape that's perfect for generative UI. So I built a personalized newspaper with CopilotKit, Vercel, and Tako Contents."

*Type a topic; let it generate.*
"I just gave it a topic, and it pulled live data and laid out a whole paper around it — articles and real charts from real numbers."

**How it works (10 seconds).**
"Three pieces. **Vercel's AI SDK** runs the agent. **Tako Contents** feeds it the facts — `tako_search` for live data, `tako_contents` for the raw numbers behind every chart. And **CopilotKit** is the chat: it doesn't ship the charts — I built those — it grounds the agent in the page (`useCopilotReadable`), turns what I say into real edits (`useCopilotAction`), and renders my components right in the chat. The agent picks the UI and binds Tako's data into it."

*Add a section — "Add a section on the FIFA World Cup standings."*
"I just ask. That's CopilotKit calling `addSection`, going back to Tako live — you can see the sources stream in, the chart appears right in the chat, then the section drops into the paper."

*Reshape a chart — "Make that bar chart a line graph."*
"Instant — no new lookup. The chart already has its numbers, so it just redraws. That's the win of real data over a static image."

*Replace a section — "Replace this section, make it about the housing market."*
"The whole section erases, the agent re-researches with Tako, and it rebuilds in place — sourced and fresh. I never wrote a word of it."

**Close.**
"CopilotKit is the hands, Tako is the eyes — a newspaper you can talk into existence and reshape on the fly. Thanks!"
