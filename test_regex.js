const msg = { content: 'test string' };

let cleanContent = msg.content;
const citations = [];

const regex = /\[Source:\s*Page\s*(\d+)\](.*?)(?=\[Source:\s*Page|$)/gis;
let match;
let firstMatchIndex = -1;
let lastMatchIndex = -1;

while ((match = regex.exec(msg.content)) !== null) {
  if (firstMatchIndex === -1) firstMatchIndex = match.index;
  citations.push({
    page: match[1],
    quote: match[2].trim().replace(/^["']|["']$/g, '')
  });
  lastMatchIndex = match.index + match[0].length;
}

console.log({ cleanContent, citations });
