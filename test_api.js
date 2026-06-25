// Define the API key required to authenticate with the NVIDIA servers
const apiKey = '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';

// Define the direct URL to the NVIDIA chat completion API endpoint
const baseURL = 'https://integrate.api.nvidia.com/v1/chat/completions';

// An asynchronous function to test if a specific AI model is responding correctly
async function testModel(modelName, useThinking) {
  // Print to the console which model we are currently testing
  console.log(`Testing model: ${modelName}`);
  
  // Construct the payload (body) we will send to the API
  const body = {
    // Specify the model name we want to use (e.g., Llama or Nemotron)
    model: modelName,
    // Send a very simple, direct prompt from a simulated user
    messages: [{ role: 'user', content: 'Say hello in 2 words.' }],
    // Cap the response at 100 tokens to save time and money during the test
    max_tokens: 100,
    // Set a moderate temperature for standard creativity
    temperature: 0.7,
  };

  // If we want to test the model's internal "thinking" capabilities (like Nemotron has)...
  if (useThinking) {
    // Allocate 100 tokens purely for the model to think before it answers
    body.reasoning_budget = 100;
    // Pass the specific keyword arguments required to turn thinking on
    body.chat_template_kwargs = { enable_thinking: true };
  }

  // Use the browser's built-in fetch tool to send the HTTP request over the network
  const response = await fetch(baseURL, {
    method: 'POST', // Send data to the server
    headers: {
      // Pass our API key as a Bearer token for authorization
      'Authorization': `Bearer ${apiKey}`,
      // Tell the server we are sending JSON data
      'Content-Type': 'application/json',
    },
    // Convert our Javascript object into a JSON string for transmission
    body: JSON.stringify(body),
  });

  // Check if the server responded with an error (anything outside the 200-299 success range)
  if (!response.ok) {
    // If it failed, print the exact text of the error so we can debug it
    console.error(`Failed ${modelName}:`, await response.text());
  } else {
    // If it succeeded, parse the server's response back into a Javascript object
    const data = await response.json();
    // Print the model's actual answer to the console
    console.log(`Success ${modelName}:`, data.choices[0]?.message?.content);
  }
}

// A main wrapper function to run our tests sequentially
async function run() {
  // First, test the massive Nemotron model and specifically turn ON its thinking feature
  await testModel('nvidia/nemotron-3-ultra-550b-a55b', true);
  
  // After that finishes, test the Stepfun model and leave thinking turned OFF
  await testModel('stepfun-ai/step-3.7-flash', false);
}

// Kick off the script by calling the run function
run();
