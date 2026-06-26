import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime';
import OpenAI from 'openai';
import { MODEL } from '@/lib/config';

// CopilotKit's runtime needs Node APIs (streaming, OpenAI SDK), not the edge runtime.
export const runtime = 'nodejs';
export const maxDuration = 120;

// The copilot's tools (edit actions + Tako Q&A) are all registered client-side via
// useCopilotAction, so the runtime needs no server-side actions. Frontend actions
// execute reliably and let us stream Tako activity into the chat UI.

export const POST = async (req: Request) => {
  // Constructed per request so a build/runtime without OPENAI_API_KEY can't crash at
  // module-eval. Reuses the same key as the generation pipeline. This is a separate
  // `openai` client from @ai-sdk/openai (which still powers orchestrate/runReporter);
  // CopilotKit's OpenAIAdapter is built on the official `openai` SDK.
  const serviceAdapter = new OpenAIAdapter({
    openai: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
    model: MODEL,
  });
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: new CopilotRuntime(),
    serviceAdapter,
    endpoint: '/api/copilotkit',
  });
  return handleRequest(req);
};
