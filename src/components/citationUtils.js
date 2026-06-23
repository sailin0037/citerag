/**
 * citationUtils.js
 * Pure parsing functions for Oracle Report schemas.
 */

/**
 * Parses the quote for a percentile indicator and currency symbol.
 * RULE 1: TRIGGER -> Quote contains regex `P\d{2}` AND currency values (₹).
 * 
 * @param {string} quote 
 * @returns {number|null} The extracted percentile, or null if not found.
 */
export function parsePercentile(quote) {
  if (!quote) return null;
  
  try {
    // Check for currency symbol
    if (!quote.includes('₹')) {
      return null;
    }
    
    // Regex matches P followed by exactly 2 digits (e.g., P62)
    const match = quote.match(/P(\d{2})/i);
    if (match && match[1]) {
      const percentile = parseInt(match[1], 10);
      if (!isNaN(percentile)) {
        return percentile;
      }
    }
  } catch (err) {
    console.error("Error parsing percentile:", err);
  }
  
  return null;
}

/**
 * Detects scope validation status based on keyword matches.
 * RULE 2: Priority -> MISSING > PARTIAL > VALIDATED.
 * 
 * @param {string} quote 
 * @returns {'MISSING' | 'PARTIAL' | 'VALIDATED' | null}
 */
export function detectScopeStatus(quote) {
  if (!quote) return null;
  
  try {
    const upperQuote = quote.toUpperCase();
    
    // MISSING has highest priority
    if (upperQuote.includes('MISSING')) {
      return 'MISSING';
    }
    
    if (upperQuote.includes('PARTIAL')) {
      return 'PARTIAL';
    }
    
    if (upperQuote.includes('VALIDATED')) {
      return 'VALIDATED';
    }
  } catch (err) {
    console.error("Error detecting scope status:", err);
  }
  
  return null;
}

/**
 * Sanitizes the quote text by removing raw markdown artifacts.
 * 
 * @param {string} text 
 * @returns {string} Sanitized plain text
 */
export function sanitizeQuote(text) {
  if (!text) return "";
  
  let clean = text;
  
  // Remove markdown headers (###, ##, #) at the start of string or after newlines
  clean = clean.replace(/(^|\n)\s*#{1,6}\s+/g, '$1');
  
  // Remove bold (**) and italic (*) markers
  clean = clean.replace(/\*\*(.*?)\*\*/g, '$1');
  clean = clean.replace(/\*(.*?)\*/g, '$1');
  
  // Remove list markers at the start of lines (- , 1. , • )
  clean = clean.replace(/(^|\n)\s*(?:[-•]|\d+\.)\s+/g, '$1');
  
  // Normalize multiple spaces to a single space
  clean = clean.replace(/\s+/g, ' ');
  
  return clean.trim();
}
