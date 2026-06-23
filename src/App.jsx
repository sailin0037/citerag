import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Hero from './components/Hero';
import ChatInterface from './components/ChatInterface';

function App() {
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e) => {
      document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
      document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black text-zinc-50 selection:bg-emerald-500/30 font-sans antialiased overflow-hidden">
      
      {/* Deep Dark Aurora Background for high contrast */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 4, ease: "easeOut" }}
        className="fixed inset-0 overflow-hidden pointer-events-none z-0"
      >
        <motion.div 
          animate={{ scale: [1, 1.2, 1], x: [0, 80, 0], y: [0, -60, 0] }}
          transition={{ repeat: Infinity, duration: 20, ease: "easeInOut" }}
          className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw]"
          style={{ background: 'radial-gradient(circle, rgba(13,148,136,0.07) 0%, rgba(0,0,0,0) 70%)' }}
        />
        <motion.div 
          animate={{ scale: [1, 1.5, 1], x: [0, -100, 0], y: [0, 100, 0] }}
          transition={{ repeat: Infinity, duration: 25, ease: "easeInOut", delay: 2 }}
          className="absolute bottom-[-20%] right-[-10%] w-[70vw] h-[70vw]"
          style={{ background: 'radial-gradient(circle, rgba(79,70,229,0.05) 0%, rgba(0,0,0,0) 70%)' }}
        />
      </motion.div>

      {/* Interactive Mouse Spotlight Layer - Only visible during Intro */}
      <div 
        className={`pointer-events-none fixed inset-0 z-0 mix-blend-screen transition-opacity duration-1000 ${!showChat ? 'opacity-50' : 'opacity-0'}`}
        style={{
          background: 'radial-gradient(800px circle at var(--mouse-x, 50vw) var(--mouse-y, 50vh), rgba(255,255,255,0.06), transparent 40%)',
          transition: 'background 0.15s ease-out, opacity 1s ease-in-out'
        }}
      />

      {/* Clean, High-Contrast Textured Mesh Overlay */}
      <motion.div 
        animate={{ opacity: [0.15, 0.3, 0.15] }}
        transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
        className="fixed inset-0 bg-noise z-0 pointer-events-none mix-blend-overlay"
      ></motion.div>
      
      <main className="relative z-10 w-full h-screen flex flex-col items-center justify-center">
        
        <AnimatePresence mode="wait">
          {!showChat ? (
            <motion.section 
              key="hero-section"
              exit={{ opacity: 0, scale: 1.08, filter: "blur(16px)" }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 flex items-center justify-center w-full h-full"
            >
              <Hero onComplete={() => setShowChat(true)} />
            </motion.section>
          ) : (
            <motion.section 
              key="chat-section"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 flex flex-col items-center pt-8 pb-4 px-6 h-full w-full"
            >
              <ChatInterface />
            </motion.section>
          )}
        </AnimatePresence>
        
      </main>
    </div>
  );
}

export default App;
