// Import React core features (useState for variables that update the UI, useRef to point to HTML elements, useEffect to run code automatically)
import React, { useState, useRef, useEffect } from 'react';
// Import Framer Motion library to create smooth, complex animations for the UI
import { motion, AnimatePresence } from 'framer-motion';
// Import a bunch of beautiful pre-made SVG icons from the lucide-react library
import { ArrowUp, Sparkles, Plus, FileText, X, Loader2, ChevronDown, ShieldCheck, ShieldAlert } from 'lucide-react';
// Import our custom sub-component that draws the citation reference cards
import CitationCard from './CitationCard';
// Import a utility function to clean up quotes before displaying them
import { sanitizeQuote } from './citationUtils';
// Import a tool to convert Markdown text into actual HTML elements safely
import ReactMarkdown from 'react-markdown';
// Import PDF.js to read and extract text from PDF files directly inside the browser
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';

// Configure the PDF.js worker. We load it from an external CDN (unpkg) so Vite doesn't crash trying to bundle it.
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// Define the animation properties for the main chat container
const interfaceContainer = {
  hidden: { opacity: 0 }, // Start invisible
  show: {
    opacity: 1, // Fade to fully visible
    transition: {
      staggerChildren: 0.4, // Animate inner elements one after another with a 0.4s delay
      delayChildren: 0.1 // Wait 0.1s before starting the first child animation
    }
  }
};

// Define the animation properties for individual chat items (messages or buttons)
const itemVariant = {
  hidden: { opacity: 0, y: 50, filter: "blur(16px)", scale: 0.95 }, // Start low, blurry, and slightly small
  show: { 
    opacity: 1, // Become fully visible
    y: 0, // Move to final resting vertical position
    filter: "blur(0px)", // Remove the blur
    scale: 1, // Grow to normal size
    // Use a bouncy spring animation so it feels lively
    transition: { type: "spring", stiffness: 80, damping: 15, duration: 1.2 } 
  }
};

// Start defining the main ChatInterface component
export default function ChatInterface() {
  // Store the list of all chat messages in an array
  const [messages, setMessages] = useState([]);
  // Store whatever the user is currently typing into the text box
  const [query, setQuery] = useState('');
  // Store the PDF file the user has chosen to upload
  const [selectedFile, setSelectedFile] = useState(null);
  // Keep track of whether we are currently busy reading a PDF
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  // Keep track of whether the AI is currently typing back to us
  const [isStreaming, setIsStreaming] = useState(false);
  // Store any error messages that happen so we can show them on screen
  const [error, setError] = useState(null);
  // Store which AI brain the user wants to use, defaulting to GLM-5.1
  const [selectedModel, setSelectedModel] = useState('z-ai/glm-5.1');
  // Track if the model selector dropdown menu is open or closed
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  // Store the massive block of text we extracted from the PDF
  const [pdfContext, setPdfContext] = useState('');
  // Store images extracted from the PDF or uploaded directly
  const [pdfImages, setPdfImages] = useState([]);
  // Store the name of the file the text came from
  const [contextSource, setContextSource] = useState(null);
  // Wait until the initial intro animations finish before enabling scrolling
  const [isAnimationComplete, setIsAnimationComplete] = useState(false);
  
  // Create a reference to the hidden file input element so we can trigger it with a custom button
  const fileInputRef = useRef(null);
  // Create a reference to the bottom of the chat list so we can auto-scroll there
  const messagesEndRef = useRef(null);

  // A helper function that smoothly scrolls the chat window to the very bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Run this block automatically every time 'messages' or 'isStreaming' changes
  useEffect(() => {
    // Scroll to the bottom so the user always sees the newest text
    scrollToBottom();
  }, [messages, isStreaming]);

  // A helper to convert a regular image file into a base64 string
  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });

  // A helper to render the first 5 pages of a PDF to base64 images
  const renderPdfToImages = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const typedArray = new Uint8Array(arrayBuffer);
      const loadingTask = pdfjsLib.getDocument({ data: typedArray });
      const pdf = await loadingTask.promise;
      
      const images = [];
      const numPagesToRender = Math.min(pdf.numPages, 5); // Cap to 5 pages
      
      for (let i = 1; i <= numPagesToRender; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        images.push(canvas.toDataURL('image/jpeg', 0.8));
      }
      return images;
    } catch (err) {
      console.error("PDF Image Extraction Error:", err);
      throw new Error("Failed to render PDF document as images.");
    }
  };

  // A function that takes a raw File object (PDF) and turns it into readable text
  const extractTextFromPDF = async (file) => {
    try {
      // Convert the file into raw binary data the browser can understand
      const arrayBuffer = await file.arrayBuffer();
      const typedArray = new Uint8Array(arrayBuffer);
      
      // Tell PDF.js to load the document from our raw binary data
      const loadingTask = pdfjsLib.getDocument({ data: typedArray });
      const pdf = await loadingTask.promise;
      
      let text = ''; // Prepare an empty string to hold our text
      
      // Loop through every single page in the PDF one by one
      for (let i = 1; i <= pdf.numPages; i++) {
        // Fetch the specific page
        const page = await pdf.getPage(i);
        // Ask PDF.js to parse out the text content
        const content = await page.getTextContent();
        // Join all the little text fragments on the page together into one big string
        const pageText = content.items.map(item => item.str).join(' ');
        // Append this page's text to our master string, followed by a double line break
        text += pageText + '\n\n';
      }
      
      // Return the complete extracted text
      return text;
    } catch (err) {
      // If anything fails (like a corrupted PDF), log it and throw an error
      console.error("PDF Extraction Error:", err);
      throw new Error("Failed to read PDF document.");
    }
  };

  // This function runs when the user hits Enter or clicks the Send button
  const handleSubmit = async (e) => {
    // Stop the browser from refreshing the page
    e.preventDefault();
    
    // If the text box is empty and no file is attached, do nothing
    if (!query.trim() && !selectedFile) return;
    
    // Clear any previous errors
    setError(null);
    
    // Create a unique ID for the user's message using the current timestamp
    const userMessageId = Date.now().toString();
    // Save the current text and file into local variables so we can clear the UI immediately
    const currentQuery = query;
    const currentFile = selectedFile;
    
    // Clear the text box so the user can type again immediately
    setQuery('');
    // Remove the file from the attachment preview
    setSelectedFile(null);
    
    // Add the user's message to the chat list so it appears on screen
    setMessages(prev => [...prev, {
      id: userMessageId,
      role: 'user', // Mark it as coming from the user
      content: currentQuery, // The text they typed
      fileName: currentFile?.name // The name of the file they attached (if any)
    }]);

    // Start with whatever PDF text we already had in memory
    let newContext = pdfContext;
    let newImages = pdfImages;

    // If the user just attached a new file...
    if (currentFile) {
      // Tell the UI to show a loading spinner for PDF processing
      setIsProcessingPdf(true);
      try {
        const isVisionModel = selectedModel.includes('nemotron');
        
        if (currentFile.type.startsWith('image/')) {
          const base64 = await fileToBase64(currentFile);
          newImages = [base64];
          newContext = '';
        } else if (currentFile.type === 'application/pdf' && isVisionModel) {
          newImages = await renderPdfToImages(currentFile);
          newContext = '';
        } else {
          // Run our extractor function to get the text
          const extracted = await extractTextFromPDF(currentFile);
          newContext = extracted; // Save the extracted text
          newImages = []; // Clear images
          
          // If the PDF is insanely huge, cut it off at 100,000 characters to avoid crashing the AI
          if (newContext.length > 100000) {
            newContext = newContext.substring(0, 100000) + '... [truncated]';
          }
        }
        
        // Save this new state so we remember it for next time
        setPdfContext(newContext);
        setPdfImages(newImages);
        setContextSource(currentFile.name);
      } catch (err) {
        // If parsing fails, show the error on screen and stop
        setError(err.message);
        setIsProcessingPdf(false);
        return;
      }
      // Hide the PDF loading spinner
      setIsProcessingPdf(false);
    }

    // Create a unique ID for the AI's upcoming response
    const assistantMessageId = (Date.now() + 1).toString();
    
    // Add a blank message bubble for the AI so the UI knows it's thinking
    setMessages(prev => [...prev, {
      id: assistantMessageId,
      role: 'assistant',
      content: ''
    }]);
    
    // Tell the UI that data is about to start streaming in
    setIsStreaming(true);

    try {
      // Format our entire chat history into a clean format the API expects
      const apiMessages = messages.map(m => ({
        role: m.role,
        content: m.content
      }));
      // Append the very latest question to the end of the history
      apiMessages.push({ role: 'user', content: currentQuery || "Please analyze the uploaded document." });

      // Open a network connection to our backend server
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send the chat history, the PDF text, images, and the chosen model as JSON
        body: JSON.stringify({ 
          messages: apiMessages, 
          context: newContext, 
          images: newImages,
          model: selectedModel 
        })
      });

      // If the server returns a bad status code (like 500)...
      if (!response.ok) {
        // Try to parse the error message
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
        // Throw the error so our catch block can display it
        throw new Error(errorMessage);
      }

      // Start reading the continuous stream of data coming back from the server
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false; // Flag to know when the stream finishes
      let fullResponse = ''; // String to accumulate the actual answer
      let fullReasoning = ''; // String to accumulate the AI's "thoughts"
      let buffer = ''; // Buffer to handle chunks of data cut in half during transit

      // Keep looping as long as the server is still sending data
      while (!done) {
        // Read the next chunk of raw bytes
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        
        // If we got bytes, decode them into text and add to our buffer
        if (value) {
          buffer += decoder.decode(value, { stream: true });
        }
        
        // Split the buffer by newlines because the server sends data line-by-line
        const lines = buffer.split('\n');
        // The last line might be cut in half, so pop it off and save it in the buffer for the next loop
        buffer = lines.pop() || ''; 
        
        // Loop through every complete line we received
        for (const line of lines) {
          // Check if it's an official Server-Sent Event data line
          if (line.startsWith('data: ')) {
            // Cut off the "data: " prefix to just get the JSON payload
            const dataStr = line.slice(6);
            // If the server says it's totally done, skip the rest
            if (dataStr.trim() === '[DONE]') continue;
            try {
              // Parse the JSON payload
              const data = JSON.parse(dataStr);
              
              // If the server sent a hallucination gate result...
              if (data.custom_event === "gate_check") {
                // Find this specific message in our state and add the pass/fail boolean to it
                setMessages(prev => prev.map(m => 
                  m.id === assistantMessageId ? { ...m, gatePassed: data.passed } : m
                ));
                continue;
              } 
              // If the server sent some "thinking" text...
              else if (data.custom_event === "reasoning") {
                fullReasoning += data.content; // Add it to our full thoughts
                // Update the state so the UI can render the thoughts
                setMessages(prev => prev.map(m => 
                  m.id === assistantMessageId ? { ...m, reasoning: fullReasoning } : m
                ));
              } 
              // If the server sent the actual answer text...
              else if (data.content !== undefined) {
                fullResponse += data.content; // Append to our full answer
                
                // Update the state so the new word appears on screen immediately
                setMessages(prev => prev.map(m => 
                  m.id === assistantMessageId ? { ...m, content: fullResponse } : m
                ));
              }
            } catch (err) {
              // If the JSON parsing fails (usually due to bad network), just silently ignore it
            }
          }
        }
      }
    } catch (err) {
      // Log any major errors and display them inside the AI's chat bubble in red
      console.error(err);
      setMessages(prev => prev.map(m => 
        m.id === assistantMessageId ? { ...m, content: '', error: err.message } : m
      ));
    } finally {
      // No matter what happens, turn off the streaming animation when we are finished
      setIsStreaming(false);
    }
  };

  // Runs whenever the user selects a file from the hidden file picker
  const handleFileChange = (e) => {
    // If they picked a file, save it to our state so we can show the preview
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  // Allows the user to hit the "Enter" key to send a message, unless they hold Shift for a new line
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Render the actual HTML/JSX for the page
  return (
    // The main wrapper container, animated by Framer Motion when the page loads
    <motion.div 
      variants={interfaceContainer}
      initial="hidden"
      whileInView="show"
      onAnimationComplete={() => setIsAnimationComplete(true)} // Allow scrolling only after load animation finishes
      viewport={{ once: true, margin: "-100px" }}
      className="w-full max-w-4xl mx-auto px-4 mt-8 relative z-10 flex flex-col h-[calc(100vh-160px)]"
    >
      
      {/* ---------------- MESSAGES AREA ---------------- */}
      <div className={`flex-1 ${isAnimationComplete ? 'overflow-y-auto' : 'overflow-hidden'} mb-6 pr-2 custom-scrollbar flex flex-col gap-8`}>
        
        {/* If there are no messages yet, show the beautiful Welcome Screen */}
        {messages.length === 0 ? (
          <motion.div variants={itemVariant} className="flex flex-col items-center justify-center h-full text-center mt-12 w-full max-w-2xl mx-auto">
            {/* Animate a glowing 3D orb that floats up and down */}
            <motion.div 
              animate={{ y: [0, -12, 0] }} 
              transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
              className="mb-8 relative"
            >
              {/* A subtle green shadow on the floor below the orb */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-20 h-4 bg-emerald-500/20 blur-xl rounded-full"></div>
              {/* The actual orb container with CSS glass effects */}
              <div className="apple-orb-container w-28 h-28 shadow-[0_20px_50px_rgba(16,185,129,0.2)]">
                <div className="apple-orb-layer1"></div>
                <div className="apple-orb-layer2"></div>
                <div className="glass-sphere-overlay"></div>
                <div className="glass-sphere-reflection"></div>
                {/* A sparkles icon in the middle of the orb */}
                <Sparkles className="w-10 h-10 text-white drop-shadow-md z-10" />
              </div>
            </motion.div>
            
            {/* The main welcome text with a subtle gradient */}
            <h3 className="text-3xl sm:text-4xl font-semibold bg-gradient-to-br from-white via-white/90 to-white/30 bg-clip-text text-transparent tracking-tight mb-4">
              How can I help you today?
            </h3>
            {/* Subtext explaining what to do */}
            <p className="text-[15px] text-zinc-500 max-w-md mx-auto leading-relaxed mb-10">
              Upload a PDF document and ask questions, or just start chatting directly with the AI to explore insights.
            </p>

            {/* A row of quick-start suggestion buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 w-full">
              {[
                "What are the critical points?",
                "Summarize this document",
                "Extract key entities"
              ].map((suggestion, i) => (
                <button
                  key={i}
                  type="button"
                  // Clicking a suggestion immediately pastes it into the chat box
                  onClick={() => setQuery(suggestion)}
                  // Styling: translucent glass buttons that glow slightly on hover
                  className="px-5 py-2.5 rounded-full bg-white/[0.02] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 text-sm text-zinc-400 hover:text-white hover:shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all duration-300 backdrop-blur-md"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          /* If there ARE messages, loop through and render each chat bubble */
          messages.map((msg) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={msg.id}
              // Push user messages to the right, and AI messages to the left
              className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              
              {/* --- USER MESSAGE BUBBLE --- */}
              {msg.role === 'user' ? (
                // Styling: Dark, gradient-filled bubble with subtle inner shadows
                <div className="relative px-4 py-3 sm:px-6 sm:py-4 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900/90 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),_0_8px_20px_rgba(0,0,0,0.5)] max-w-[90%] sm:max-w-[85%] self-end">
                  {/* If the user attached a file to this message, show a tiny preview card above the text */}
                  {msg.fileName && (
                    <div className="relative flex items-center gap-2 mb-2 pb-2 border-b border-white/10 text-xs text-zinc-400">
                      <FileText className="w-3 h-3 text-emerald-400" />
                      <span className="truncate">{msg.fileName}</span>
                    </div>
                  )}
                  {/* Display the user's actual text */}
                  <p className="relative text-zinc-200 whitespace-pre-wrap text-[15px] sm:text-base">{msg.content}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4 self-start w-full sm:max-w-[95%]">
                  {/* --- AI MESSAGE BUBBLE --- */}
                  {/* Hardcoded check: If the AI returns this exact phrase, render a special Red Warning Box */}
                  {msg.content === "⚠️ I cannot find this information in the uploaded document. Please try rephrasing or check another section." ? (
                    <div className="flex items-start gap-4">
                      {/* Red tinted warning box indicating failure to retrieve data */}
                      <div className="px-5 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 backdrop-blur-sm max-w-[80%] flex items-center gap-3">
                        <span className="text-xl">⚠️</span>
                        <p className="text-red-400 text-sm font-medium">
                          I cannot find this information in the uploaded document. Please try rephrasing or check another section.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Standard AI Message Container */}
                      <div className="flex items-start gap-4">
                        {/* Avatar Column */}
                        <div className="flex-shrink-0 mt-1">
                          {/* A smaller version of the floating orb for the AI's profile picture */}
                          <div className="apple-orb-container w-8 h-8 shadow-[0_0_10px_rgba(59,130,246,0.2)]">
                            <div className="apple-orb-layer1"></div>
                            <div className="apple-orb-layer2"></div>
                            <div className="glass-sphere-overlay"></div>
                            <div className="glass-sphere-reflection"></div>
                            {/* If the AI is busy typing, show a spinning loader; otherwise, show sparkles */}
                            {isStreaming && msg.content === '' && !msg.error ? (
                              <Loader2 className="w-3.5 h-3.5 text-white animate-spin z-10" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5 text-white z-10" />
                            )}
                          </div>
                        </div>
                        
                        {/* Text and Badges Column */}
                        <div className="pt-1 text-zinc-300 leading-relaxed max-w-full overflow-hidden w-full">
                          
                          {/* Header Row: Contains the "AI Assistant" label and Validation Badges */}
                          <div className="flex items-center justify-between mb-2">
                             <div className="text-[11px] uppercase tracking-widest font-bold bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]">AI Assistant</div>
                             
                             {/* Only render badges once streaming is completely finished and a check was run */}
                             {msg.gatePassed !== undefined && !isStreaming && (
                               msg.gatePassed ? (
                                 // Green shield if the AI's response passed the hallucination checks
                                 <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-[9px] uppercase tracking-widest font-semibold text-emerald-400/90 shadow-[0_0_12px_rgba(16,185,129,0.1)] animate-pulse-slow">
                                   <ShieldCheck className="w-3 h-3 text-emerald-400" strokeWidth={1.5} />
                                   Verified Grounded
                                 </div>
                               ) : (
                                 // Red shield if the AI failed checks and likely hallucinated
                                 <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-red-500/20 bg-red-500/5 text-[9px] uppercase tracking-widest font-semibold text-red-400/90 shadow-[0_0_12px_rgba(239,68,68,0.1)] animate-pulse-slow">
                                   <ShieldAlert className="w-3 h-3 text-red-400" strokeWidth={1.5} />
                                   Potential Hallucination
                                 </div>
                               )
                             )}
                          </div>
                          
                          {/* If the server sent back a hard error, show it in red text */}
                          {msg.error ? (
                            <span className="text-red-400">{msg.error}</span>
                          ) : !msg.content && isStreaming ? (
                            
                            /* If there is no text yet but we ARE streaming, show a cool animated loading state */
                            <div className="flex flex-col gap-3 max-w-[85%] pt-1">
                              {/* Glowing text that says "Synthesizing response..." */}
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
                              
                              {/* 3 animated loading bars mimicking paragraphs of text */}
                              <div className="flex flex-col gap-2.5">
                                {/* First bar (full width) */}
                                <div className="w-full h-1.5 rounded-full bg-zinc-800/40 overflow-hidden relative shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
                                  <motion.div 
                                    initial={{ x: "-100%" }}
                                    animate={{ x: "200%" }}
                                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                                    className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"
                                  />
                                </div>
                                {/* Second bar (slightly shorter) */}
                                <div className="w-5/6 h-1.5 rounded-full bg-zinc-800/40 overflow-hidden relative shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
                                  <motion.div 
                                    initial={{ x: "-100%" }}
                                    animate={{ x: "200%" }}
                                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut", delay: 0.15 }}
                                    className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"
                                  />
                                </div>
                                {/* Third bar (shortest) */}
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
                            
                            /* The actual text rendering logic once we start receiving words */
                            <div className="prose prose-invert prose-emerald max-w-none text-[15px] sm:text-base">
                              
                              {/* If the AI sent us "Thinking" data (like Nemotron does), render an expandable box */}
                              {msg.reasoning && (
                                <details className="mb-4 text-xs sm:text-sm text-zinc-400 bg-zinc-800/30 p-3 sm:p-4 rounded-xl border border-zinc-700/50 open:bg-zinc-800/60 transition-colors">
                                  <summary className="cursor-pointer font-medium text-emerald-400/80 hover:text-emerald-400 select-none flex items-center gap-2 outline-none">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    View Thinking Process
                                  </summary>
                                  {/* The actual internal thoughts of the AI printed in a terminal-like font */}
                                  <div className="mt-3 whitespace-pre-wrap leading-relaxed opacity-80 pl-4 border-l-2 border-zinc-700/50 font-mono text-[11px] sm:text-xs">
                                    {msg.reasoning}
                                  </div>
                                </details>
                              )}
                              
                              {/* An IIFE (Immediately Invoked Function Expression) to parse out the citations */}
                              {(() => {
                                let cleanContent = msg.content; // Copy the raw text
                                const citations = []; // Array to hold the parsed out citation cards
                                
                                // A massive regex that hunts for our specific formatting: [Source: Page X | Match: 0.99]
                                const regex = /\[Source:\s*Page\s*(\d+)(?:\s*\|\s*Match:\s*([\d.]+))?(?:\s*\|\s*Meta:\s*(\{.*?\}))?\](.*?)(?=\[Source:\s*Page|$)/gis;
                                let match;
                                let firstMatchIndex = -1; // To track where the main answer ends and citations begin
                                let lastMatchIndex = -1;
                                
                                // While the regex keeps finding citation blocks in the text...
                                while ((match = regex.exec(msg.content)) !== null) {
                                  // Record where the very first citation starts
                                  if (firstMatchIndex === -1) firstMatchIndex = match.index;
                                  
                                  // Parse out the JSON metadata attached to the citation (if it exists)
                                  let metadata = null;
                                  try {
                                      if (match[3]) metadata = JSON.parse(match[3]);
                                  } catch(e) {}
                                  
                                  // Clean up the actual quoted text by removing stray quotes and prefixes
                                  let rawQuote = match[4].trim().replace(/^["']|["']$/g, '');
                                  rawQuote = rawQuote.replace(/^(?:>\s*)?Quote:\s*/i, '').replace(/^"|"$/g, '').trim();
                                  rawQuote = sanitizeQuote(rawQuote); // Call our custom cleaner function

                                  // Push this beautifully parsed citation data into our array
                                  citations.push({
                                    page: match[1],
                                    confidence: match[2] ? parseFloat(match[2]) : null,
                                    metadata: metadata,
                                    quote: rawQuote
                                  });
                                  lastMatchIndex = match.index + match[0].length;
                                }
                                
                                // Sort the citation cards so the most relevant (highest match score) appears first
                                citations.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
                                
                                // If we actually found citations...
                                if (citations.length > 0) {
                                  // Chop off the citations from the main text body so we can render them as cards instead
                                  cleanContent = msg.content.substring(0, firstMatchIndex).trim();
                                  
                                  // Handle any trailing text that might have streamed in after the last citation
                                  const trailingText = msg.content.substring(lastMatchIndex);
                                  if (trailingText.trim().length > 0) {
                                    if (trailingText.match(/\[S[^\]]*$/i)) {
                                      // If it's half of a "[Source..." tag, just ignore it until the rest streams in
                                    } else {
                                      // Otherwise, attach it to the last citation quote
                                      citations[citations.length - 1].quote += trailingText;
                                    }
                                  }
                                } else {
                                  // If we haven't completed a full citation yet, but a partial tag `[S` exists, hide it so the user doesn't see broken brackets
                                  const partialTagMatch = cleanContent.match(/\[S[^\]]*$/i);
                                  if (partialTagMatch && partialTagMatch.index >= 0) {
                                      cleanContent = cleanContent.substring(0, partialTagMatch.index);
                                  }
                                }
                                
                                  // Fallback handling if the AI only spit out citations and no main text
                                  if (cleanContent.length === 0 && citations.length > 0) {
                                    cleanContent = "Based on the provided document:";
                                  } else if (cleanContent.trim().length === 0 && citations.length === 0) {
                                    // Debug fallback if the string is just empty
                                    cleanContent = `[DEBUG: Empty Output] The backend returned an empty response. msg.content length: ${msg.content.length}, error: ${msg.error}`;
                                  }
                                  
                                  // Return the final layout: The markdown answer, followed by a grid of Citation Cards
                                  return (
                                    <>
                                      {/* Convert the markdown string into real HTML headers, lists, and bold text */}
                                      <ReactMarkdown
                                        components={{
                                          // Override paragraphs to add nice line height
                                          p: ({node, ...props}) => (
                                            <p className="leading-8 mb-4 text-zinc-300" {...props} />
                                          ),
                                          // Override bold text to be bright white
                                          strong: ({node, ...props}) => (
                                            <strong className="font-semibold text-white" {...props} />
                                          ),
                                          // Override code blocks to look like cool green terminals
                                          code: ({node, inline, children, ...props}) => inline ? (
                                            <span className="font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{children}</span>
                                          ) : (
                                            <code {...props}>{children}</code>
                                          )
                                        }}
                                      >
                                        {cleanContent}
                                      </ReactMarkdown>
                                      
                                      {/* If we have citations to show, render them below the main text in a 2-column grid */}
                                      {citations.length > 0 && (
                                        <motion.div layout className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6 not-prose">
                                          {citations.map((cit, idx) => (
                                            // Call our custom UI card component for each citation
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
        {/* An invisible div at the very bottom we use as an anchor for auto-scrolling */}
        <div ref={messagesEndRef} />
      </div>

      {/* ---------------- INPUT AREA (Sticky at Bottom) ---------------- */}
      <motion.div variants={itemVariant} className="w-full pb-6 shrink-0">
        <form onSubmit={handleSubmit} className="relative group">
          {/* A glowing blur effect that surrounds the text box, intensifying when hovered */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-zinc-800 to-zinc-700 rounded-3xl blur opacity-30 group-hover:opacity-50 transition duration-500"></div>
          
          {/* The actual text box container with glassmorphism effects */}
          <div className="apple-glow-input relative flex flex-col bg-[#09090b]/90 backdrop-blur-3xl saturate-150 border border-zinc-800/80 border-t-zinc-700/80 rounded-3xl p-2 shadow-2xl transition-all duration-300 focus-within:bg-[#050505]/95 focus-within:border-zinc-600 focus-within:shadow-[0_0_30px_rgba(255,255,255,0.03)] hover:border-zinc-700/50">
            
            {/* A subtle static noise texture overlaid on the input to make it feel premium */}
            <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
              <div className="bg-noise mix-blend-overlay w-full h-full"></div>
            </div>
            
            {/* --- FILE ATTACHMENT PREVIEW ZONE --- */}
            <AnimatePresence>
              {/* If a file is selected, smoothly animate a little preview chip into existence above the text input */}
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
                    {/* A tiny X button to cancel/remove the uploaded file */}
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
              {/* If we are actively extracting text from the PDF, show a tiny loading state */}
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

            {/* --- THE TEXT INPUT ROW --- */}
            <div className="relative flex items-center z-10">
              {/* The "+" button on the left to upload a PDF */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()} // Trigger the hidden file input
                className="p-3 m-1 rounded-2xl text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors duration-200 shrink-0"
                title="Add document"
              >
                <Plus className="w-5 h-5" />
              </button>
              
              {/* The hidden HTML file input (because default browser file pickers are ugly) */}
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange}
                accept=".pdf,image/*" 
                className="hidden" 
              />

              {/* --- MODEL SELECTOR DROPDOWN --- */}
              <div className="relative flex items-center justify-center shrink-0 ml-1">
                {/* The button that shows the currently selected model */}
                <button 
                  type="button"
                  onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                  className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 text-zinc-200 font-medium text-[10px] sm:text-xs py-1.5 px-2 sm:px-3 rounded-lg focus:outline-none transition-colors hover:bg-zinc-800"
                >
                  <Sparkles className="w-3 h-3 text-emerald-400 hidden sm:block" />
                  <span className="truncate max-w-[80px] sm:max-w-none">
                    {/* Translate ugly API names into friendly human names */}
                    {selectedModel === 'z-ai/glm-5.1' ? 'GLM-5.1 (Recommended)' : 
                     selectedModel === 'stepfun-ai/step-3.7-flash' ? 'Step-3.7 (Fast)' : 
                     selectedModel === 'meta/llama-3.1-70b-instruct' ? 'Llama 70B (Medium)' : 
                     selectedModel === 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning' ? 'Nemotron Vision (Extra)' : 
                     selectedModel.split('/').pop()}
                  </span>
                  {/* The little arrow that flips upside down when open */}
                  <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {/* The actual popup menu list of models */}
                <AnimatePresence>
                  {isModelDropdownOpen && (
                    <>
                      {/* An invisible full-screen overlay so clicking anywhere else closes the menu */}
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setIsModelDropdownOpen(false)}
                      ></div>
                      
                      {/* The animated popup box */}
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full left-0 mb-3 w-48 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden py-1 z-50 origin-bottom-left"
                      >
                        {/* Option 1: GLM */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedModel('z-ai/glm-5.1');
                            setIsModelDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700/50 hover:text-white transition-colors"
                        >
                          {/* Green dot indicator if selected */}
                          <div className={`w-1.5 h-1.5 rounded-full ${selectedModel === 'z-ai/glm-5.1' ? 'bg-emerald-400' : 'bg-transparent'}`}></div>
                          GLM-5.1 (Recommended)
                        </button>
                        
                        {/* Option 2: Stepfun */}
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
                        
                        {/* Option 3: Llama */}
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
                        
                        {/* Option 4: Nemotron Vision */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedModel('nvidia/nemotron-3-nano-omni-30b-a3b-reasoning');
                            setIsModelDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700/50 hover:text-white transition-colors"
                        >
                          <div className={`w-1.5 h-1.5 rounded-full ${selectedModel === 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning' ? 'bg-emerald-400' : 'bg-transparent'}`}></div>
                          Nemotron Vision (Extra)
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
              
              {/* --- MAIN TEXT AREA --- */}
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything or chat..."
                className="flex-1 max-h-32 min-h-[48px] sm:min-h-[56px] resize-none bg-transparent border-none outline-none text-white placeholder:text-zinc-400 px-2 sm:px-3 py-3 sm:py-4 custom-scrollbar z-10 text-[16px] sm:text-[15px]"
                rows={1}
              />
              
              {/* --- SUBMIT BUTTON --- */}
              <button
                type="submit"
                // Button is disabled if there's no text/file, or if we are busy streaming/processing
                disabled={(!query.trim() && !selectedFile) || isStreaming || isProcessingPdf}
                className="p-3 m-1 rounded-2xl bg-white text-black hover:bg-zinc-200 disabled:opacity-40 disabled:hover:bg-white transition-all duration-200 shrink-0 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
              >
                {/* Swap the up-arrow icon with a spinning loader if we are busy */}
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
