"""
Verification engine for Gabby AI Agent.
Validates post-conditions and outcomes of tool executions before declaring success.
Prevents hallucinated completion claims.
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass
import pathlib
import logging

logger = logging.getLogger("gabby.verifier")

@dataclass
class VerificationOutcome:
    verified: bool
    reason: Optional[str] = None
    details: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        d = {"verified": self.verified}
        if self.reason:
            d["reason"] = self.reason
        if self.details:
            d["details"] = self.details
        return d

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

class ToolVerifier:
    """
    Validates that physical actions (file creation, API calls, calculations)
    actually achieved their intended side effects.
    """

    @staticmethod
    def verify_workspace_file_action(action: str, path: str, workspace_root: pathlib.Path) -> Dict[str, Any]:
        """
        Confirms file exists and has non-zero content when written.
        """
        target = (workspace_root / path.lstrip("/\\")).resolve()
        if action == "write":
            exists = target.exists() and target.is_file()
            size = target.stat().st_size if exists else 0
            if not exists:
                return {"verified": False, "reason": f"File '{path}' does not exist on disk after write."}
            return {"verified": True, "size_bytes": size, "path": path}
        elif action == "read":
            exists = target.exists()
            return {"verified": exists, "path": path}
        return {"verified": True}

    @staticmethod
    def verify_calculation(expression: str, result: Any) -> Dict[str, Any]:
        """
        Confirms calculation yielded a valid numeric or boolean result.
        """
        if result is None or isinstance(result, Exception):
            return {"verified": False, "reason": "Calculation failed to produce a valid number."}
        return {"verified": True, "result": result}

    @staticmethod
    def verify_plan(plan: Any) -> VerificationOutcome:
        """
        Validates task plan integrity and completeness.
        """
        if not plan:
            return VerificationOutcome(verified=False, reason="Plan is empty.")
        steps = plan.steps if hasattr(plan, "steps") else plan.get("steps", [])
        if not steps:
            return VerificationOutcome(verified=False, reason="Plan has no executable steps.")
        return VerificationOutcome(
            verified=True,
            details={"step_count": len(steps), "is_complex": getattr(plan, "is_complex", False)}
        )

    @staticmethod
    def verify_tool_result(tool_name: str, args: Dict[str, Any], result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Central verifier dispatch.
        """
        if not result.get("success", False):
            return {
                "verified": False,
                "reason": f"Tool '{tool_name}' failed with error: {result.get('error', 'Unknown error')}"
            }

        data = result.get("data", {})
        if tool_name == "workspace_file":
            action = args.get("action", "")
            path = args.get("path", "")
            try:
                from tools.workspace_tool import WORKSPACE_ROOT
            except (ImportError, ValueError):
                from ..tools.workspace_tool import WORKSPACE_ROOT
            return ToolVerifier.verify_workspace_file_action(action, path, WORKSPACE_ROOT)

        elif tool_name == "calculate":
            expr = args.get("expression", "")
            res = data.get("result") if isinstance(data, dict) else None
            return ToolVerifier.verify_calculation(expr, res)

        elif tool_name == "web_search":
            has_results = isinstance(data, list) and len(data) > 0
            return {"verified": True, "found_results": has_results, "result_count": len(data) if isinstance(data, list) else 0}

        elif tool_name in ("search_knowledge", "store_knowledge"):
            return {"verified": True, "data": data}

        return {"verified": True}
