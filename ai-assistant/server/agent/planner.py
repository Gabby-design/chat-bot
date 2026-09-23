"""
Task planner and intent decomposition for Gabby AI Agent.
Analyzes query complexity, formulates concise execution plans,
and coordinates user-facing progress signals without exposing private chain-of-thought.
"""

from typing import Dict, Any, List
from dataclasses import dataclass, field
import re

@dataclass
class PlannedStep:
    step_number: int
    description: str
    action_type: str = "general"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "step_number": self.step_number,
            "description": self.description,
            "action_type": self.action_type
        }

@dataclass
class TaskPlan:
    is_complex: bool
    steps: List[str]
    initial_status: str
    detailed_steps: List[PlannedStep] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_complex": self.is_complex,
            "steps": self.steps,
            "initial_status": self.initial_status,
            "detailed_steps": [s.to_dict() for s in self.detailed_steps]
        }

    # Backward compatibility for dictionary-style access: plan["is_complex"]
    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)

class TaskPlanner:
    """
    Lightweight, fast rule-and-heuristic planner that identifies multi-step tasks
    and prepares clean status updates for the client.
    """

    def create_plan(self, prompt: str) -> TaskPlan:
        return self.plan_task(prompt)

    @staticmethod
    def plan_task(prompt: str) -> TaskPlan:
        p = (prompt or "").strip()
        p_lower = p.lower()

        steps: List[str] = []
        detailed_steps: List[PlannedStep] = []

        needs_search = any(k in p_lower for k in [
            "who is", "what is happening", "latest", "recent", "search for", "find out", "news",
            "stock price", "current weather", "what happened", "research"
        ])
        needs_calc = any(k in p_lower for k in [
            "calculate", "how much is", "plus", "minus", "multiplied by", "divided by", "compound interest", "sqrt"
        ])
        needs_file = any(k in p_lower for k in [
            "create a file", "save this to", "write a script", "write to workspace", "in my workspace",
            "to my workspace", "workspace", "make a project", "generate a file", "save a report", "save report"
        ])
        needs_knowledge = any(k in p_lower for k in [
            "note", "stored", "remember", "knowledge", "preference", "saved note"
        ])

        step_idx = 1
        if needs_knowledge:
            desc = "Consulting persistent knowledge base..."
            steps.append(desc)
            detailed_steps.append(PlannedStep(step_number=step_idx, description=desc, action_type="knowledge"))
            step_idx += 1

        if needs_search:
            desc = "Gathering relevant information from the web..."
            steps.append(desc)
            detailed_steps.append(PlannedStep(step_number=step_idx, description=desc, action_type="search"))
            step_idx += 1

        if needs_calc:
            desc = "Performing calculations and quantitative analysis..."
            steps.append(desc)
            detailed_steps.append(PlannedStep(step_number=step_idx, description=desc, action_type="math"))
            step_idx += 1

        if needs_file:
            desc = "Preparing and saving project files in workspace..."
            steps.append(desc)
            detailed_steps.append(PlannedStep(step_number=step_idx, description=desc, action_type="workspace"))
            step_idx += 1

        if not steps:
            steps = ["Processing your request..."]
            detailed_steps = [PlannedStep(step_number=1, description="Synthesizing response...", action_type="general")]

        is_complex = len(steps) >= 2 or (" and " in p_lower and len(p.split()) > 25)

        return TaskPlan(
            is_complex=is_complex,
            steps=steps,
            initial_status=steps[0],
            detailed_steps=detailed_steps
        )
