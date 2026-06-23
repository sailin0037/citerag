import OpenAI from 'openai';

export const config = {
  runtime: 'edge',
};

// Use the user's requested NVIDIA API key and baseURL
const openai = new OpenAI({
  apiKey: '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',
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { messages, context, model } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages array is required' }), { status: 400 });
    }

    const systemPrompt = `You are an intelligent AI assistant tasked with answering questions based on the provided context document.
If the answer is not contained within the context, simply state that you don't have enough information. Do not hallucinate.

Answer the question using ONLY the provided context. At the end of your response, you MUST cite the source for EACH quote individually in this exact format: [Source: Page X | Match: 0.XX] followed by the exact quote used. NEVER combine page numbers or citations (e.g., do NOT write [Source: Page 1, 3]). Produce a separate [Source: ...] block for every quote. Return citations as plain text only. NO markdown formatting.

Context:
${context || "No context document provided."}`;

    // Construct final messages array with the system prompt
    const finalMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const requestedModel = model || 'meta/llama-3.1-70b-instruct';
    const requestBody = {
      model: requestedModel,
      messages: finalMessages,
      temperature: 1,
      top_p: 0.95,
      stream: true
    };

    // Apply reasoning parameters only for Nemotron-3
    if (requestedModel.includes('nemotron')) {
      requestBody.max_tokens = 16384;
      requestBody.reasoning_budget = 16384;
      requestBody.chat_template_kwargs = {"enable_thinking":true};
    } else if (requestedModel === 'z-ai/glm-5.1') {
      requestBody.max_tokens = 16384;
      requestBody.top_p = 1;
    } else {
      requestBody.max_tokens = 4000;
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        // Prevent Vercel 504 timeout by sending initial and periodic keep-alives
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ custom_event: "keep_alive" })}\n\n`));
        const keepAliveInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ custom_event: "keep_alive" })}\n\n`));
          } catch(e) {
            clearInterval(keepAliveInterval);
          }
        }, 8000);

        try {
          const response = await openai.chat.completions.create(requestBody);
          clearInterval(keepAliveInterval);
          
          let fullDraft = '';
          
          for await (const chunk of response) {
            // Check for reasoning tokens
            const reasoning = chunk.choices[0]?.delta?.reasoning_content;
            if (reasoning) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ custom_event: "reasoning", content: reasoning })}\n\n`));
            }
            
            // Check for regular content
            const text = chunk.choices[0]?.delta?.content;
            if (text) {
              fullDraft += text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
            }
          }

          // Run Hallucination Gate (Deterministic Threshold & Keywords) on the accumulated text
          let gatePassed = true;
          const matchRegex = /Match:\s*([\d.]+)/gi;
          let maxSimilarity = 0;
          let hasCitations = false;
          let match;
          
          while ((match = matchRegex.exec(fullDraft)) !== null) {
              const score = parseFloat(match[1]);
              if (!isNaN(score) && score > maxSimilarity) {
                  maxSimilarity = score;
              }
              hasCitations = true;
          }

          const lowerDraft = fullDraft.toLowerCase();
          const hasNegativePhrases = lowerDraft.includes("i cannot find") || 
                                     lowerDraft.includes("not mentioned") || 
                                     lowerDraft.includes("unclear");

          if (hasNegativePhrases) {
              gatePassed = false;
          } else if (hasCitations && maxSimilarity < 0.75) {
              gatePassed = false;
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ custom_event: "gate_check", passed: gatePassed })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    console.error('Error in chat API:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: err.message }), { status: 500 });
  }
}
