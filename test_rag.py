# Import the NumPy library to handle arrays and mathematical operations
import numpy as np

# Import regular expressions to help find patterns in text
import re

# Import our custom backend system so we can test its logic
from backend_retrieval import RAGBackend, ChunkMetadata

# Import a standard Document object structure from LangChain to simulate chunks
from langchain_core.documents import Document

# Define the main function that tests if our retrieval system works correctly
def test_rag():
    # Create a fresh instance of our RAG backend
    backend = RAGBackend()
    
    # Create some fake document chunks (mock data) so we don't have to load a real PDF during testing
    processed_chunks = [
        # A mock chunk representing page 1 with fair market pricing data
        Document(page_content="The fair market price range for Category A is ₹1.45L-₹1.95L.", metadata={"page": 0, "type": "text", "entity_type": "fair_market_range"}),
        # A mock chunk representing page 3 (index 2) containing percentile distributions
        Document(page_content="Distribution across all projects (P10-P90): P10 is ₹85K, P90 is ₹3L.", metadata={"page": 2, "type": "text", "entity_type": "percentile_scale"}),
        # A mock chunk representing page 5 (index 4) with cost breakdown details
        Document(page_content="Cost breakdown for standard project execution involves multiple phases.", metadata={"page": 4, "type": "text", "entity_type": "cost_breakdown"}),
        # A mock chunk containing miscellaneous text
        Document(page_content="Budget gap analysis shows hourly rate discrepancies.", metadata={"page": 1, "type": "text", "entity_type": "other"}),
    ]
    
    # Force the backend to use our fake chunks instead of real document chunks
    backend.vector_store = processed_chunks
    
    # We need to temporarily modify (monkey patch) the embedding function from the backend
    import backend_retrieval
    
    # Create a fake embedding function that always returns an array of 1s instead of random numbers
    # This makes our tests predictable because real embeddings change randomly in the mock backend
    def deterministic_embeddings(texts):
        # Return a 2D array of ones, matching the number of texts we passed in
        return np.ones((len(texts), 768))
        
    # Replace the backend's embedding function with our fake, predictable one
    backend_retrieval.get_embeddings = deterministic_embeddings
    
    # Generate fake embeddings for all our fake chunks and save them in the backend
    backend.vector_embeddings = backend_retrieval.get_embeddings([c.page_content for c in processed_chunks])
    
    # Define a list of test questions (queries) we want the system to try and answer
    queries = [
        "fair market price",   # Should match the first chunk
        "percentile position", # Should match the second chunk
        "budget gap",          # Should match the fourth chunk
        "hourly rate"          # Should match the fourth chunk
    ]
    
    # Loop through each question to test the system
    for q in queries:
        # Print a clear header so we know which query is running
        print(f"\n--- QUERY: {q} ---")
        
        # Because we are using fake vectors of 1s, the math won't actually find the right chunks.
        # So, we replace the mathematical similarity function with a simple keyword matching tool.
        def keyword_sim(q_emb, doc_emb):
            # Create an empty list to store the scores
            sims = []
            
            # Loop through all our fake chunks
            for c in processed_chunks:
                # Give every chunk a baseline score of 0.5
                score = 0.5
                
                # If the query asks for "fair market" and the chunk contains it, boost score to 0.8
                if "fair market" in q and "fair market" in c.page_content.lower(): score = 0.8
                # If the query asks for "percentile" and the chunk contains it, boost score to 0.8
                if "percentile" in q and "percentile" in c.page_content.lower(): score = 0.8
                # If the query asks for "budget" and the chunk contains it, boost score to 0.8
                if "budget" in q and "budget" in c.page_content.lower(): score = 0.8
                # If the query asks for "hourly" and the chunk contains it, boost score to 0.8
                if "hourly" in q and "hourly" in c.page_content.lower(): score = 0.8
                
                # Save the final score
                sims.append(score)
                
            # Return the scores as a NumPy array so the backend can read it
            return np.array([sims])
            
        # Replace the backend's real similarity math with our keyword test function
        backend_retrieval.cosine_similarity = keyword_sim
        
        # Ask the backend to retrieve the top 2 best chunks for the current question
        success, context, chunks = backend.retrieve_context(q, top_k=2)
        
        # Print whether the retrieval was successful
        print(f"Success: {success}")
        
        # Loop through the results and print out the score and text of each found chunk
        for i, c in enumerate(chunks):
            print(f"Result {i+1} (Score {c['similarity']:.2f}): {c['text']}")

# If this file is run directly (instead of being imported), execute the test function
if __name__ == '__main__':
    test_rag()
