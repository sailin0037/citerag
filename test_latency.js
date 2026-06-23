const apiKey = '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';
const baseURL = 'https://integrate.api.nvidia.com/v1/chat/completions';

async function testModel(modelName) {
  console.log(`\nTesting ${modelName}...`);
  const body = {
    model: modelName,
    messages: [{ role: 'user', content: 'Explain quantum computing in one short sentence.' }],
    max_tokens: 100,
    temperature: 0.7,
    stream: true,
  };

  if (modelName === 'z-ai/glm-5.1') {
    body.top_p = 1;
  }

  const startTime = Date.now();
  try {
    const response = await fetch(baseURL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const ttft = Date.now() - startTime;
    console.log(`Headers (TTFT) received in ${ttft}ms. Status: ${response.status}`);
    
    if (!response.ok) {
      console.log('Error:', await response.text());
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let tokenCount = 0;
    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      if (value) {
        const text = decoder.decode(value, {stream:true});
        const matches = text.match(/"content":"/g);
        if (matches) tokenCount += matches.length;
      }
    }
    const totalTime = Date.now() - startTime;
    console.log(`Finished generation. Total Time: ${totalTime}ms. Speed: ${Math.round((tokenCount / (totalTime / 1000)))} tokens/sec.`);
    
    return {
      model: modelName,
      ttft: ttft,
      totalTime: totalTime,
      speed: Math.round((tokenCount / (totalTime / 1000)))
    };
  } catch (err) {
    console.error(`Fetch failed for ${modelName}:`, err);
    return null;
  }
}

async function run() {
  const results = [];
  results.push(await testModel('z-ai/glm-5.1'));
  results.push(await testModel('stepfun-ai/step-3.7-flash'));
  results.push(await testModel('meta/llama-3.1-70b-instruct'));
  
  console.log('\n--- BENCHMARK RESULTS ---');
  console.table(results);
}
run();
