

const apiKey = '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';
const baseURL = 'https://integrate.api.nvidia.com/v1/chat/completions';

async function testModel(modelName, useThinking) {
  console.log(`Testing model: ${modelName}`);
  const body = {
    model: modelName,
    messages: [{ role: 'user', content: 'Say hello in 2 words.' }],
    max_tokens: 100,
    temperature: 0.7,
  };

  if (useThinking) {
    body.reasoning_budget = 100;
    body.chat_template_kwargs = { enable_thinking: true };
  }

  const response = await fetch(baseURL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error(`Failed ${modelName}:`, await response.text());
  } else {
    const data = await response.json();
    console.log(`Success ${modelName}:`, data.choices[0]?.message?.content);
  }
}

async function run() {
  await testModel('nvidia/nemotron-3-ultra-550b-a55b', true);
  await testModel('stepfun-ai/step-3.7-flash', false);
}

run();
