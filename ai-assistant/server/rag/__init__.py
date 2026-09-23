"""
RAG (Retrieval-Augmented Generation) package for Gabby AI.
Provides local document ingestion, note persistence, and full-text search.
"""

try:
    from rag.knowledge_store import KnowledgeStore, default_knowledge_store
except (ImportError, ValueError):
    from .knowledge_store import KnowledgeStore, default_knowledge_store

__all__ = [
    "KnowledgeStore",
    "default_knowledge_store"
]
