import React from 'react';
import { motion } from 'framer-motion';
import { FileText, ArrowUpRight } from 'lucide-react';

export default function CitationCard({ page, quote }) {
  const isQuoteValid = quote && quote.trim().length >= 10;
  const displayQuote = isQuoteValid ? `"${quote}"` : "Source verified on this page.";

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -4 }}
      transition={{ type: "spring", stiffness: 400, damping: 25, mass: 0.8 }}
      className="group relative p-5 rounded-2xl bg-white/[0.03] backdrop-blur-2xl border border-white/10 hover:border-white/20 hover:bg-white/[0.06] shadow-[0_8px_30px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] transition-all duration-300 overflow-hidden"
    >
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center w-12 h-12 rounded-full border border-emerald-900/40 shrink-0">
             <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#062c1e]">
                <FileText className="w-4 h-4 text-emerald-400" />
             </div>
          </div>
          
          <div className="flex flex-col">
            <h4 className="text-[15px] font-medium text-zinc-100 tracking-tight">Source Document</h4>
            <span className="text-[13px] text-zinc-500 mt-0.5">Page {page} • Verified Citation</span>
          </div>
        </div>
        
        <ArrowUpRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors cursor-pointer" />
      </div>
      
      <div className="relative mt-2">
        <div className="pl-4 py-1 border-l-[3px] border-emerald-500">
          <p className={`text-[15px] leading-relaxed antialiased line-clamp-4 ${isQuoteValid ? 'text-zinc-400 font-light' : 'text-zinc-500 italic'}`}>
            {displayQuote}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
