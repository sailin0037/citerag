import React from 'react';
import { motion } from 'framer-motion';

const titleText = "Interrogate your documents.";
const subtitleText = "Experience precision-driven retrieval. Uncover insights with sub-second latency and pinpoint accuracy, tailored for enterprise intelligence.";

const titleContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.2 }
  }
};

const subtitleContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 1.5 }
  }
};

const wordContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.03 }
  }
};

const letterVariant = {
  hidden: { opacity: 0, y: 15, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.4, ease: "easeOut" } }
};

export default function Hero({ onComplete }) {
  const handleAnimationComplete = () => {
    // Wait for a brief pause after text completes, then trigger the fade transition to chat
    setTimeout(() => {
      if (onComplete) {
        onComplete();
      }
    }, 2000); 
  };

  return (
    <div className="flex flex-col items-center justify-center pt-32 pb-16 px-4 text-center z-10 relative">
      <motion.h1 
        variants={titleContainer}
        initial="hidden"
        animate="show"
        className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6 max-w-4xl flex flex-wrap justify-center py-2 drop-shadow-sm"
      >
        {titleText.split(' ').map((word, wordIndex) => (
          <motion.span key={`word-${wordIndex}`} variants={wordContainer} className="inline-block mr-[0.25em] whitespace-nowrap">
            {word.split('').map((char, charIndex) => (
              <motion.span key={`char-${charIndex}`} variants={letterVariant} className="inline-block">
                {char}
              </motion.span>
            ))}
          </motion.span>
        ))}
      </motion.h1>
      
      <motion.p 
        variants={subtitleContainer}
        initial="hidden"
        animate="show"
        className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed flex flex-wrap justify-center py-2"
      >
        {subtitleText.split(' ').map((word, wordIndex, wordsArray) => {
          const isLastWord = wordIndex === wordsArray.length - 1;
          return (
            <motion.span key={`sub-word-${wordIndex}`} variants={wordContainer} className="inline-block mr-[0.25em] whitespace-nowrap">
              {word.split('').map((char, charIndex, charsArray) => {
                const isLastChar = isLastWord && charIndex === charsArray.length - 1;
                return (
                  <motion.span 
                    key={`sub-char-${charIndex}`} 
                    variants={letterVariant} 
                    className="inline-block"
                    onAnimationComplete={isLastChar ? handleAnimationComplete : undefined}
                  >
                    {char}
                  </motion.span>
                );
              })}
            </motion.span>
          );
        })}
      </motion.p>
    </div>
  );
}
