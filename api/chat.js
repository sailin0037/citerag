// Import the OpenAI SDK, which we will use to communicate with NVIDIA's NIM API (since it is OpenAI compatible)
import OpenAI from 'openai';

// Tell Vercel to deploy this function on their global Edge Network for faster response times
export const config = {
  runtime: 'edge',
};

// Initialize the OpenAI client using the user's requested NVIDIA API key and custom base URL
const openai = new OpenAI({
  apiKey: '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',
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

// The main handler function that runs whenever someone calls this API endpoint
export default async function handler(req) {
  // We only allow POST requests. If someone tries to GET this URL, return an error.
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // Extract the chat history (messages), the document text (context), and the requested AI model from the request body
    const { messages, context, model } = await req.json();

    // Make sure the user actually sent a valid array of messages. If not, return an error.
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages array is required' }), { status: 400 });
    }

    // Define the strict rules (System Prompt) that the AI must follow when answering
    const systemPrompt = `You are an intelligent AI assistant tasked with answering questions based on the provided context document.
If the answer is not contained within the context, simply state that you don't have enough information. Do not hallucinate.

Answer the question using ONLY the provided context. At the end of your response, you MUST cite the source for EACH quote individually in this exact format: [Source: Page X | Match: 0.XX] followed by the exact quote used. NEVER combine page numbers or citations (e.g., do NOT write [Source: Page 1, 3]). Produce a separate [Source: ...] block for every quote. Return citations as plain text only. NO markdown formatting.

Context:
${context || "No context document provided."}`;

    // Combine the system prompt with the actual chat history from the user
    const finalMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    // Determine which AI model to use. If the user didn't specify one, default to Llama 70B
    const requestedModel = model || 'meta/llama-3.1-70b-instruct';
    
    // Build the configuration object we will send to the AI model
    const requestBody = {
      model: requestedModel,
      messages: finalMessages,
      temperature: 1, // High temperature for creative but constrained answers
      top_p: 0.95, // Filter out low-probability words
      stream: true // Ask the AI to stream the response back word-by-word
    };

    // If the user requested the Nemotron-3 model, we need to pass specific parameters to enable its "thinking" mode
    if (requestedModel.includes('nemotron')) {
      requestBody.max_tokens = 16384; // Allow long responses
      requestBody.reasoning_budget = 16384; // Give it space to think
      requestBody.chat_template_kwargs = {"enable_thinking":true}; // Turn on the thinking feature
    } 
    // If they requested the GLM-5.1 model, adjust settings specifically for its logic requirements
    else if (requestedModel === 'z-ai/glm-5.1') {
      requestBody.max_tokens = 16384;
      requestBody.top_p = 1;
    } 
    // For standard models, just cap the response length to 4000 tokens
    else {
      requestBody.max_tokens = 4000;
    }

    // Create a new stream pipeline that will send data back to the user's browser in real-time
    const stream = new ReadableStream({
      async start(controller) {
        // We need a text encoder to convert our strings into raw bytes for streaming
        const encoder = new TextEncoder();
        
        // Vercel Edge functions will kill the connection if the AI takes too long to think.
        // To prevent this 504 timeout, we immediately send a "keep_alive" ping to the browser.
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ custom_event: "keep_alive" })}\n\n`));
        
        // Setup an interval to ping the browser every 8 seconds so the connection stays open
        const keepAliveInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ custom_event: "keep_alive" })}\n\n`));
          } catch(e) {
            // If the connection drops, clear the interval
            clearInterval(keepAliveInterval);
          }
        }, 8000);

        try {
          // Send the actual request to the NVIDIA AI model
          const response = await openai.chat.completions.create(requestBody);
          
          // Once the AI starts responding, we don't need the keep-alive interval anymore
          clearInterval(keepAliveInterval);
          
          // A variable to keep track of the entire response as it comes in piece by piece
          let fullDraft = '';
          
          // Loop through every chunk of data the AI streams back
          for await (const chunk of response) {
            // Check if this chunk contains the AI's internal "thinking" or "reasoning"
            const reasoning = chunk.choices[0]?.delta?.reasoning_content;
            if (reasoning) {
              // Send the reasoning back to the browser immediately so the user can see it thinking
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ custom_event: "reasoning", content: reasoning })}\n\n`));
            }
            
            // Check if this chunk contains the actual response text
            const text = chunk.choices[0]?.delta?.content;
            if (text) {
              // Add it to our full draft
              fullDraft += text;
              // Send the text back to the browser immediately
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
            }
          }

          // --- HALLUCINATION GATE ---
          // Now that the AI has finished its response, we check if it hallucinated
          
          let gatePassed = true; // Assume it passed until proven guilty
          
          // Use a regex to find all the "Match: 0.XX" scores the AI printed in its citations
          const matchRegex = /Match:\s*([\d.]+)/gi;
          let maxSimilarity = 0;
          let hasCitations = false;
          let match;
          
          // Loop through all matches found in the text
          while ((match = matchRegex.exec(fullDraft)) !== null) {
              // Parse the score number out of the text
              const score = parseFloat(match[1]);
              // If it's a valid number and it's higher than our current max, update the max
              if (!isNaN(score) && score > maxSimilarity) {
                  maxSimilarity = score;
              }
              hasCitations = true;
          }

          // Convert the entire response to lowercase to make it easier to search for phrases
          const lowerDraft = fullDraft.toLowerCase();
          
          // Check if the AI admitted it couldn't find the answer in the document
          const hasNegativePhrases = lowerDraft.includes("i cannot find") || 
                                     lowerDraft.includes("not mentioned") || 
                                     lowerDraft.includes("unclear");

          // If the AI admitted it couldn't find it, it failed the "has data" check
          if (hasNegativePhrases) {
              gatePassed = false;
          } 
          // Alternatively, if it did provide citations, but the BEST citation has a match score under 0.75...
          else if (hasCitations && maxSimilarity < 0.75) {
              // ...then it probably hallucinated an answer using low-quality context, so it fails the gate
              gatePassed = false;
          }

          // Send the final result of the Hallucination Gate to the frontend to trigger the UI badges
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ custom_event: "gate_check", passed: gatePassed })}\n\n`));
          
          // Tell the browser the stream is completely done
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (err) {
          // If the NVIDIA API errors out, pass that error down the stream
          controller.error(err);
        } finally {
          // Always make sure to close the stream to free up resources
          controller.close();
        }
      }
    });

    // Return the stream pipeline back to the user's browser, letting it know data will come continuously
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    // Catch any massive errors (like parsing the request body) and return a clean 500 error
    console.error('Error in chat API:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: err.message }), { status: 500 });
  }
}
