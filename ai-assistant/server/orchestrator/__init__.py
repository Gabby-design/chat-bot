"""
Orchestrator package for Gabby AI.
Re-exports the core AgentOrchestrator, TaskPlanner, ToolVerifier, and Specialist routing
for modular agent execution.
"""

import sys
import os

# Support both top-level server execution and package-level imports
try:
    from agent.orchestrator import AgentOrchestrator, default_orchestrator, MODEL_FALLBACKS
    from agent.planner import TaskPlanner, TaskPlan, PlannedStep
    from agent.verifier import ToolVerifier, VerificationOutcome
    from agent.specialists import select_specialist, SpecialistRole
except (ImportError, ValueError):
    from ..agent.orchestrator import AgentOrchestrator, default_orchestrator, MODEL_FALLBACKS
    from ..agent.planner import TaskPlanner, TaskPlan, PlannedStep
    from ..agent.verifier import ToolVerifier, VerificationOutcome
    from ..agent.specialists import select_specialist, SpecialistRole

__all__ = [
    "AgentOrchestrator",
    "default_orchestrator",
    "TaskPlanner",
    "TaskPlan",
    "PlannedStep",
    "ToolVerifier",
    "VerificationOutcome",
    "select_specialist",
    "SpecialistRole",
    "MODEL_FALLBACKS"
]
