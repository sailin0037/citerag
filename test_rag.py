import numpy as np
import re
from backend_retrieval import RAGBackend, ChunkMetadata
from langchain_core.documents import Document

def test_rag():
    backend = RAGBackend()
    
    # Mock some chunks
    processed_chunks = [
        Document(page_content="The fair market price range for Category A is ₹1.45L-₹1.95L.", metadata={"page": 0, "type": "text", "entity_type": "fair_market_range"}),
        Document(page_content="Distribution across all projects (P10-P90): P10 is ₹85K, P90 is ₹3L.", metadata={"page": 2, "type": "text", "entity_type": "percentile_scale"}),
        Document(page_content="Cost breakdown for standard project execution involves multiple phases.", metadata={"page": 4, "type": "text", "entity_type": "cost_breakdown"}),
        Document(page_content="Budget gap analysis shows hourly rate discrepancies.", metadata={"page": 1, "type": "text", "entity_type": "other"}),
    ]
    
    # Monkey patch the get_embeddings function from backend_retrieval to just return deterministic embeddings
    # Or just use the existing one which returns random
    backend.vector_store = processed_chunks
    # Use deterministic embeddings for predictable sorting
    # Let's say query embedding is 0 for simplicity, and chunks are just 0.
    
    import backend_retrieval
    # Override embeddings to be non-random for test
    def deterministic_embeddings(texts):
        # returns an array of ones
        return np.ones((len(texts), 768))
        
    backend_retrieval.get_embeddings = deterministic_embeddings
    backend.vector_embeddings = backend_retrieval.get_embeddings([c.page_content for c in processed_chunks])
    
    queries = [
        "fair market price",
        "percentile position",
        "budget gap",
        "hourly rate"
    ]
    
    for q in queries:
        print(f"\n--- QUERY: {q} ---")
        # To make it pick the right chunks without real embeddings, we can inject a mock cosine_similarity
        # where it assigns high score based on keyword match
        def keyword_sim(q_emb, doc_emb):
            sims = []
            for c in processed_chunks:
                score = 0.5
                if "fair market" in q and "fair market" in c.page_content.lower(): score = 0.8
                if "percentile" in q and "percentile" in c.page_content.lower(): score = 0.8
                if "budget" in q and "budget" in c.page_content.lower(): score = 0.8
                if "hourly" in q and "hourly" in c.page_content.lower(): score = 0.8
                sims.append(score)
            return np.array([sims])
            
        backend_retrieval.cosine_similarity = keyword_sim
        
        success, context, chunks = backend.retrieve_context(q, top_k=2)
        print(f"Success: {success}")
        for i, c in enumerate(chunks):
            print(f"Result {i+1} (Score {c['similarity']:.2f}): {c['text']}")

if __name__ == '__main__':
    test_rag()
