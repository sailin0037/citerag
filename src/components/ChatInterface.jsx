import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, Sparkles, Plus, FileText, X, Loader2, ChevronDown, ShieldCheck, ShieldAlert } from 'lucide-react';
import CitationCard from './CitationCard';
import { sanitizeQuote } from './citationUtils';
import ReactMarkdown from 'react-markdown';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';

// Configure PDF.js worker using unpkg to avoid Vite bundling issues with the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const interfaceContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.4,
      delayChildren: 0.1
    }
  }
};

const itemVariant = {
  hidden: { opacity: 0, y: 50, filter: "blur(16px)", scale: 0.95 },
  show: { 
    opacity: 1, 
    y: 0, 
    filter: "blur(0px)", 
    scale: 1, 
    transition: { type: "spring", stiffness: 80, damping: 15, duration: 1.2 } 
  }
};

export default function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [selectedModel, setSelectedModel] = useState('z-ai/glm-5.1');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [pdfContext, setPdfContext] = useState('');
  const [contextSource, setContextSource] = useState(null);
  const [isAnimationComplete, setIsAnimationComplete] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  const extractTextFromPDF = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const typedArray = new Uint8Array(arrayBuffer);
      const loadingTask = pdfjsLib.getDocument({ data: typedArray });
      const pdf = await loadingTask.promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        text += pageText + '\n\n';
      }
      return text;
    } catch (err) {
      console.error("PDF Extraction Error:", err);
      throw new Error("Failed to read PDF document.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim() && !selectedFile) return;
    
    setError(null);
    const userMessageId = Date.now().toString();
    const currentQuery = query;
    const currentFile = selectedFile;
    
    // Clear inputs immediately for better UX
    setQuery('');
    setSelectedFile(null);
    
    // Add user message to UI
    setMessages(prev => [...prev, {
      id: userMessageId,
      role: 'user',
      content: currentQuery,
      fileName: currentFile?.name
    }]);

    let newContext = pdfContext;

    if (currentFile) {
      setIsProcessingPdf(true);
      try {
        const extracted = await extractTextFromPDF(currentFile);
        newContext = extracted;
        if (newContext.length > 100000) {
          newContext = newContext.substring(0, 100000) + '... [truncated]';
        }
        setPdfContext(newContext);
        setContextSource(currentFile.name);
      } catch (err) {
        setError(err.message);
        setIsProcessingPdf(false);
        return;
      }
      setIsProcessingPdf(false);
    }

    const assistantMessageId = (Date.now() + 1).toString();
    // Add empty assistant message placeholder
    setMessages(prev => [...prev, {
      id: assistantMessageId,
      role: 'assistant',
      content: ''
    }]);
    
    setIsStreaming(true);

    try {
      // We format previous messages for the API
      const apiMessages = messages.map(m => ({
        role: m.role,
        content: m.content
      }));
      // Add the current query
      apiMessages.push({ role: 'user', content: currentQuery || "Please analyze the uploaded document." });

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: apiMessages, 
          context: newContext, 
          model: selectedModel 
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        let errorMessage = errorData.error || `HTTP error! status: ${response.status}`;
        if (errorData.details) {
          try {
            const detailsJson = JSON.parse(errorData.details);
            errorMessage += `: ${detailsJson.error?.message || errorData.details}`;
          } catch(e) {
            errorMessage += `: ${errorData.details}`;
          }
        }
        throw new Error(errorMessage);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let fullResponse = '';
      let fullReasoning = '';
      let buffer = '';

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        
        if (value) {
          buffer += decoder.decode(value, { stream: true });
        }
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the incomplete line in the buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr.trim() === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);
              
              if (data.custom_event === "gate_check") {
                setMessages(prev => prev.map(m => 
                  m.id === assistantMessageId ? { ...m, gatePassed: data.passed } : m
                ));
                continue;
              } else if (data.custom_event === "reasoning") {
                fullReasoning += data.content;
                setMessages(prev => prev.map(m => 
                  m.id === assistantMessageId ? { ...m, reasoning: fullReasoning } : m
                ));
              } else if (data.content !== undefined) {
                fullResponse += data.content;
                
                // Update specific assistant message
                setMessages(prev => prev.map(m => 
                  m.id === assistantMessageId ? { ...m, content: fullResponse } : m
                ));
              }
            } catch (err) {
              // Ignore incomplete JSON chunks
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => prev.map(m => 
        m.id === assistantMessageId ? { ...m, content: '', error: err.message } : m
      ));
    } finally {
      setIsStreaming(false);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <motion.div 
      variants={interfaceContainer}
      initial="hidden"
      whileInView="show"
      onAnimationComplete={() => setIsAnimationComplete(true)}
      viewport={{ once: true, margin: "-100px" }}
      className="w-full max-w-4xl mx-auto px-4 mt-8 relative z-10 flex flex-col h-[calc(100vh-160px)]"
    >
      
      {/* Messages Area */}
      <div className={`flex-1 ${isAnimationComplete ? 'overflow-y-auto' : 'overflow-hidden'} mb-6 pr-2 custom-scrollbar flex flex-col gap-8`}>
        {messages.length === 0 ? (
          <motion.div variants={itemVariant} className="flex flex-col items-center justify-center h-full text-center mt-12 w-full max-w-2xl mx-auto">
            <motion.div 
              animate={{ y: [0, -12, 0] }} 
              transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
              className="mb-8 relative"
            >
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-20 h-4 bg-emerald-500/20 blur-xl rounded-full"></div>
              <div className="apple-orb-container w-28 h-28 shadow-[0_20px_50px_rgba(16,185,129,0.2)]">
                <div className="apple-orb-layer1"></div>
                <div className="apple-orb-layer2"></div>
                <div className="glass-sphere-overlay"></div>
                <div className="glass-sphere-reflection"></div>
                <Sparkles className="w-10 h-10 text-white drop-shadow-md z-10" />
              </div>
            </motion.div>
            
            <h3 className="text-3xl sm:text-4xl font-semibold bg-gradient-to-br from-white via-white/90 to-white/30 bg-clip-text text-transparent tracking-tight mb-4">
              How can I help you today?
            </h3>
            <p className="text-[15px] text-zinc-500 max-w-md mx-auto leading-relaxed mb-10">
              Upload a PDF document and ask questions, or just start chatting directly with the AI to explore insights.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 w-full">
              {[
                "What are the critical points?",
                "Summarize this document",
                "Extract key entities"
              ].map((suggestion, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setQuery(suggestion)}
                  className="px-5 py-2.5 rounded-full bg-white/[0.02] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 text-sm text-zinc-400 hover:text-white hover:shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all duration-300 backdrop-blur-md"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          messages.map((msg) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={msg.id}
              className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'user' ? (
                <div className="relative px-4 py-3 sm:px-6 sm:py-4 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900/90 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),_0_8px_20px_rgba(0,0,0,0.5)] max-w-[90%] sm:max-w-[85%] self-end">
                  {msg.fileName && (
                    <div className="relative flex items-center gap-2 mb-2 pb-2 border-b border-white/10 text-xs text-zinc-400">
                      <FileText className="w-3 h-3 text-emerald-400" />
                      <span className="truncate">{msg.fileName}</span>
                    </div>
                  )}
                  <p className="relative text-zinc-200 whitespace-pre-wrap text-[15px] sm:text-base">{msg.content}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4 self-start w-full sm:max-w-[95%]">
                  {msg.content === "⚠️ I cannot find this information in the uploaded document. Please try rephrasing or check another section." ? (
                    <div className="flex items-start gap-4">
                      <div className="px-5 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 backdrop-blur-sm max-w-[80%] flex items-center gap-3">
                        <span className="text-xl">⚠️</span>
                        <p className="text-red-400 text-sm font-medium">
                          I cannot find this information in the uploaded document. Please try rephrasing or check another section.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 mt-1">
                          <div className="apple-orb-container w-8 h-8 shadow-[0_0_10px_rgba(59,130,246,0.2)]">
                            <div className="apple-orb-layer1"></div>
                            <div className="apple-orb-layer2"></div>
                            <div className="glass-sphere-overlay"></div>
                            <div className="glass-sphere-reflection"></div>
                            {isStreaming && msg.content === '' && !msg.error ? (
                              <Loader2 className="w-3.5 h-3.5 text-white animate-spin z-10" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5 text-white z-10" />
                            )}
                          </div>
                        </div>
                        <div className="pt-1 text-zinc-300 leading-relaxed max-w-full overflow-hidden w-full">
                          <div className="flex items-center justify-between mb-2">
                             <div className="text-[11px] uppercase tracking-widest font-bold bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]">AI Assistant</div>
                             {msg.gatePassed !== undefined && !isStreaming && (
                               msg.gatePassed ? (
                                 <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-[9px] uppercase tracking-widest font-semibold text-emerald-400/90 shadow-[0_0_12px_rgba(16,185,129,0.1)] animate-pulse-slow">
                                   <ShieldCheck className="w-3 h-3 text-emerald-400" strokeWidth={1.5} />
                                   Verified Grounded
                                 </div>
                               ) : (
                                 <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-red-500/20 bg-red-500/5 text-[9px] uppercase tracking-widest font-semibold text-red-400/90 shadow-[0_0_12px_rgba(239,68,68,0.1)] animate-pulse-slow">
                                   <ShieldAlert className="w-3 h-3 text-red-400" strokeWidth={1.5} />
                                   Potential Hallucination
                                 </div>
                               )
                             )}
                          </div>
                          
                          {msg.error ? (
                            <span className="text-red-400">{msg.error}</span>
                          ) : !msg.content && isStreaming ? (
                            <div className="flex flex-col gap-3 max-w-[85%] pt-1">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 bg-clip-text text-transparent font-medium text-sm tracking-wide animate-pulse">
                                  Synthesizing response
                                </span>
                                <div className="typing-indicator flex gap-0.5 ml-1">
                                  <span className="w-1 h-1 rounded-full bg-teal-400"></span>
                                  <span className="w-1 h-1 rounded-full bg-teal-400"></span>
                                  <span className="w-1 h-1 rounded-full bg-teal-400"></span>
                                </div>
                              </div>
                              <div className="flex flex-col gap-2.5">
                                <div className="w-full h-1.5 rounded-full bg-zinc-800/40 overflow-hidden relative shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
                                  <motion.div 
                                    initial={{ x: "-100%" }}
                                    animate={{ x: "200%" }}
                                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                                    className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"
                                  />
                                </div>
                                <div className="w-5/6 h-1.5 rounded-full bg-zinc-800/40 overflow-hidden relative shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
                                  <motion.div 
                                    initial={{ x: "-100%" }}
                                    animate={{ x: "200%" }}
                                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut", delay: 0.15 }}
                                    className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"
                                  />
                                </div>
                                <div className="w-2/3 h-1.5 rounded-full bg-zinc-800/40 overflow-hidden relative shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
                                  <motion.div 
                                    initial={{ x: "-100%" }}
                                    animate={{ x: "200%" }}
                                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut", delay: 0.3 }}
                                    className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"
                                  />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="prose prose-invert prose-emerald max-w-none text-[15px] sm:text-base">
                              {msg.reasoning && (
                                <details className="mb-4 text-xs sm:text-sm text-zinc-400 bg-zinc-800/30 p-3 sm:p-4 rounded-xl border border-zinc-700/50 open:bg-zinc-800/60 transition-colors">
                                  <summary className="cursor-pointer font-medium text-emerald-400/80 hover:text-emerald-400 select-none flex items-center gap-2 outline-none">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    View Thinking Process
                                  </summary>
                                  <div className="mt-3 whitespace-pre-wrap leading-relaxed opacity-80 pl-4 border-l-2 border-zinc-700/50 font-mono text-[11px] sm:text-xs">
                                    {msg.reasoning}
                                  </div>
                                </details>
                              )}
                              {(() => {
                                let cleanContent = msg.content;
                                const citations = [];
                                
                                const regex = /\[Source:\s*Page\s*(\d+)(?:\s*\|\s*Match:\s*([\d.]+))?(?:\s*\|\s*Meta:\s*(\{.*?\}))?\](.*?)(?=\[Source:\s*Page|$)/gis;
                                let match;
                                let firstMatchIndex = -1;
                                let lastMatchIndex = -1;
                                
                                while ((match = regex.exec(msg.content)) !== null) {
                                  if (firstMatchIndex === -1) firstMatchIndex = match.index;
                                  let metadata = null;
                                  try {
                                      if (match[3]) metadata = JSON.parse(match[3]);
                                  } catch(e) {}
                                  
                                  let rawQuote = match[4].trim().replace(/^["']|["']$/g, '');
                                  rawQuote = rawQuote.replace(/^(?:>\s*)?Quote:\s*/i, '').replace(/^"|"$/g, '').trim();
                                  rawQuote = sanitizeQuote(rawQuote);

                                  citations.push({
                                    page: match[1],
                                    confidence: match[2] ? parseFloat(match[2]) : null,
                                    metadata: metadata,
                                    quote: rawQuote
                                  });
                                  lastMatchIndex = match.index + match[0].length;
                                }
                                
                                // Sort by relevance descending
                                citations.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
                                if (citations.length > 0) {
                                  cleanContent = msg.content.substring(0, firstMatchIndex).trim();
                                  const trailingText = msg.content.substring(lastMatchIndex);
                                  
                                  if (trailingText.trim().length > 0) {
                                    if (trailingText.match(/\[S[^\]]*$/i)) {
                                      // Ignore partial
                                    } else {
                                      citations[citations.length - 1].quote += trailingText;
                                    }
                                  }
                                } else {
                                  const partialTagMatch = cleanContent.match(/\[S[^\]]*$/i);
                                  if (partialTagMatch && partialTagMatch.index >= 0) {
                                      cleanContent = cleanContent.substring(0, partialTagMatch.index);
                                  }
                                }
                                  if (cleanContent.length === 0 && citations.length > 0) {
                                    cleanContent = "Based on the provided document:";
                                  } else if (cleanContent.trim().length === 0 && citations.length === 0) {
                                    cleanContent = `[DEBUG: Empty Output] The backend returned an empty response. msg.content length: ${msg.content.length}, error: ${msg.error}`;
                                  }
                                  
                                  return (
                                    <>
                                      <ReactMarkdown
                                        components={{
                                          p: ({node, ...props}) => (
                                            <p className="leading-8 mb-4 text-zinc-300" {...props} />
                                          ),
                                          strong: ({node, ...props}) => (
                                            <strong className="font-semibold text-white" {...props} />
                                          ),
                                          code: ({node, inline, children, ...props}) => inline ? (
                                            <span className="font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{children}</span>
                                          ) : (
                                            <code {...props}>{children}</code>
                                          )
                                        }}
                                      >
                                        {cleanContent}
                                      </ReactMarkdown>
                                      
                                      {citations.length > 0 && (
                                        <motion.div layout className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6 not-prose">
                                          {citations.map((cit, idx) => (
                                            <CitationCard 
                                              key={idx}
                                              page={cit.page}
                                              quote={cit.quote}
                                            />
                                          ))}
                                        </motion.div>
                                      )}
                                    </>
                                  );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area (Sticky at Bottom) */}
      <motion.div variants={itemVariant} className="w-full pb-6 shrink-0">
        <form onSubmit={handleSubmit} className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-zinc-800 to-zinc-700 rounded-3xl blur opacity-30 group-hover:opacity-50 transition duration-500"></div>
          <div className="apple-glow-input relative flex flex-col bg-[#09090b]/90 backdrop-blur-3xl saturate-150 border border-zinc-800/80 border-t-zinc-700/80 rounded-3xl p-2 shadow-2xl transition-all duration-300 focus-within:bg-[#050505]/95 focus-within:border-zinc-600 focus-within:shadow-[0_0_30px_rgba(255,255,255,0.03)] hover:border-zinc-700/50">
            <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
              <div className="bg-noise mix-blend-overlay w-full h-full"></div>
            </div>
            
            {/* File Attachment Preview */}
            <AnimatePresence>
              {selectedFile && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginTop: 4 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  className="px-3 pb-2 overflow-hidden flex items-center"
                >
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/80 border border-zinc-700/50 rounded-xl text-sm text-zinc-300">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span className="truncate max-w-[200px]">{selectedFile.name}</span>
                    <button 
                      type="button"
                      onClick={() => setSelectedFile(null)} 
                      className="text-zinc-500 hover:text-white ml-1 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              )}
              {isProcessingPdf && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-4 py-2 flex items-center gap-2 text-xs text-emerald-400"
                >
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Extracting document context...
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative flex items-center z-10">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-3 m-1 rounded-2xl text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors duration-200 shrink-0"
                title="Add document"
              >
                <Plus className="w-5 h-5" />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange}
                accept=".pdf" 
                className="hidden" 
              />

              <div className="relative flex items-center justify-center shrink-0 ml-1">
                <button 
                  type="button"
                  onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                  className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 text-zinc-200 font-medium text-[10px] sm:text-xs py-1.5 px-2 sm:px-3 rounded-lg focus:outline-none transition-colors hover:bg-zinc-800"
                >
                  <Sparkles className="w-3 h-3 text-emerald-400 hidden sm:block" />
                  <span className="truncate max-w-[80px] sm:max-w-none">
                    {selectedModel === 'z-ai/glm-5.1' ? 'GLM-5.1 (Recommended)' : 
                     selectedModel === 'stepfun-ai/step-3.7-flash' ? 'Step-3.7 (Fast)' : 
                     selectedModel === 'meta/llama-3.1-70b-instruct' ? 'Llama 70B (Medium)' : 
                     selectedModel.split('/').pop()}
                  </span>
                  <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                <AnimatePresence>
                  {isModelDropdownOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setIsModelDropdownOpen(false)}
                      ></div>
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full left-0 mb-3 w-48 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden py-1 z-50 origin-bottom-left"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedModel('z-ai/glm-5.1');
                            setIsModelDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700/50 hover:text-white transition-colors"
                        >
                          <div className={`w-1.5 h-1.5 rounded-full ${selectedModel === 'z-ai/glm-5.1' ? 'bg-emerald-400' : 'bg-transparent'}`}></div>
                          GLM-5.1 (Recommended)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedModel('stepfun-ai/step-3.7-flash');
                            setIsModelDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700/50 hover:text-white transition-colors"
                        >
                          <div className={`w-1.5 h-1.5 rounded-full ${selectedModel === 'stepfun-ai/step-3.7-flash' ? 'bg-emerald-400' : 'bg-transparent'}`}></div>
                          Step-3.7 (Fast)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedModel('meta/llama-3.1-70b-instruct');
                            setIsModelDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700/50 hover:text-white transition-colors"
                        >
                          <div className={`w-1.5 h-1.5 rounded-full ${selectedModel === 'meta/llama-3.1-70b-instruct' ? 'bg-emerald-400' : 'bg-transparent'}`}></div>
                          Llama 70B (Medium)
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
              
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything or chat..."
                className="flex-1 max-h-32 min-h-[48px] sm:min-h-[56px] resize-none bg-transparent border-none outline-none text-white placeholder:text-zinc-400 px-2 sm:px-3 py-3 sm:py-4 custom-scrollbar z-10 text-[16px] sm:text-[15px]"
                rows={1}
              />
              <button
                type="submit"
                disabled={(!query.trim() && !selectedFile) || isStreaming || isProcessingPdf}
                className="p-3 m-1 rounded-2xl bg-white text-black hover:bg-zinc-200 disabled:opacity-40 disabled:hover:bg-white transition-all duration-200 shrink-0 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
              >
                {isStreaming || isProcessingPdf ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ArrowUp className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
