"""
Skill registry for Gabby AI Agent.
Adapted from Everything-gabby-ai architectural patterns.
Defines modular procedural skills with purpose, instructions, required tools,
constraints, and verification requirements.
"""

from typing import Dict, List, Optional
from dataclasses import dataclass, field

@dataclass
class Skill:
    name: str
    purpose: str
    instructions: str
    required_tools: List[str] = field(default_factory=list)
    constraints: List[str] = field(default_factory=list)
    verification_requirements: List[str] = field(default_factory=list)

    def to_system_prompt_snippet(self) -> str:
        constraints_text = "\n".join([f"- {c}" for c in self.constraints]) if self.constraints else "None"
        verif_text = "\n".join([f"- {v}" for v in self.verification_requirements]) if self.verification_requirements else "None"
        return (
            f"### Active Skill: {self.name.upper()}\n"
            f"**Purpose**: {self.purpose}\n"
            f"**Execution Guidelines**:\n{self.instructions}\n"
            f"**Constraints**:\n{constraints_text}\n"
            f"**Verification Requirements**:\n{verif_text}\n"
        )

class SkillRegistry:
    def __init__(self):
        self._skills: Dict[str, Skill] = {}
        self._register_default_skills()

    def register(self, skill: Skill):
        self._skills[skill.name.lower()] = skill

    def get(self, name: str) -> Optional[Skill]:
        return self._skills.get(name.lower())

    def list_skills(self) -> List[Skill]:
        return list(self._skills.values())

    def _register_default_skills(self):
        # 1. Research Skill
        self.register(Skill(
            name="research",
            purpose="Conduct thorough, fact-checked research using web search and knowledge tools.",
            instructions=(
                "Formulate targeted search queries. Cross-reference claims across multiple sources. "
                "Structure findings with clear headings, bullet points, and source citations. "
                "Distinguish between verified facts and speculative or outdated claims."
            ),
            required_tools=["web_search"],
            constraints=[
                "Never present ungrounded assertions as verified current facts.",
                "Always cite sources and provide URLs where available."
            ],
            verification_requirements=[
                "Verify factual accuracy against tool search results before answering.",
                "Acknowledge when search returns incomplete or conflicting information."
            ]
        ))

        # 2. Coding Skill
        self.register(Skill(
            name="coding",
            purpose="Develop modular, clean, secure, and production-ready code.",
            instructions=(
                "Design modular architecture before writing code. Handle edge cases, errors, and input validation. "
                "When requested to create or update files, use workspace_file tools to save the code in the workspace."
            ),
            required_tools=["workspace_file"],
            constraints=[
                "Keep functions focused and under ~50 lines.",
                "Zero emojis in code or comments.",
                "Ensure syntax and types are correct."
            ],
            verification_requirements=[
                "Confirm code syntax validity.",
                "Ensure imports and dependencies match requirements."
            ]
        ))

        # 3. Data & Calculation Skill
        self.register(Skill(
            name="data_analysis",
            purpose="Perform accurate calculations, mathematical modeling, and numerical data analysis.",
            instructions=(
                "Break complex formulas down step-by-step. Always execute calculations through the calculate tool "
                "rather than computing large figures in text generation to avoid arithmetic hallucination."
            ),
            required_tools=["calculate"],
            constraints=[
                "Never guess mathematical results or statistical calculations.",
                "Clearly display both the mathematical formula and the calculated result."
            ],
            verification_requirements=[
                "Verify calculated values against input parameters."
            ]
        ))

        # 4. Project Planning Skill
        self.register(Skill(
            name="project_planning",
            purpose="Break large or ambiguous tasks into phased, manageable, trackable steps.",
            instructions=(
                "Analyze user requirements. Formulate discrete phases with clear deliverables, "
                "prerequisites, and verification checkpoints. Present plans cleanly to the user."
            ),
            required_tools=[],
            constraints=[
                "Follow YAGNI principle: create only what is necessary now.",
                "Separate planning from execution."
            ],
            verification_requirements=[
                "Ensure every phase has measurable completion criteria."
            ]
        ))

        # 5. File Analysis Skill
        self.register(Skill(
            name="file_analysis",
            purpose="Inspect, parse, and analyze files within the sandboxed user workspace.",
            instructions=(
                "Use workspace_file with action 'read' or 'list' to examine project contents. "
                "Summarize architecture, identify patterns, and propose targeted improvements."
            ),
            required_tools=["workspace_file"],
            constraints=[
                "Never modify files without explicit user instruction.",
                "Respect the sandbox jail."
            ],
            verification_requirements=[
                "Confirm file existence before attempting to read."
            ]
        ))

        # 6. Writing & Synthesis Skill
        self.register(Skill(
            name="writing",
            purpose="Produce articulate, compelling, clear, and structured written content.",
            instructions=(
                "Adopt an authoritative yet engaging voice. Structure with clear Markdown hierarchy, "
                "executive summaries, and concise paragraphs. Eliminate fluff, hedging, and filler."
            ),
            required_tools=[],
            constraints=[
                "Tone must adapt to requested genre (technical, professional, creative).",
                "Ensure zero repetition across paragraphs."
            ],
            verification_requirements=[
                "Review clarity, coherence, and flow."
            ]
        ))

default_skill_registry = SkillRegistry()
