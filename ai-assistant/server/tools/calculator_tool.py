"""
Safe mathematical calculation tool for Gabby AI Agent.
Evaluates arithmetic and scientific calculations using AST parsing.
Zero dangerous eval() or exec() usage.
"""

from typing import Dict, Any
import ast
import operator
import math
from .base import BaseTool, PermissionLevel

ALLOWED_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}

ALLOWED_FUNCTIONS = {
    "abs": abs,
    "round": round,
    "sqrt": math.sqrt,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "log": math.log,
    "log10": math.log10,
    "log2": math.log2,
    "exp": math.exp,
    "ceil": math.ceil,
    "floor": math.floor,
    "factorial": math.factorial,
    "pi": math.pi,
    "e": math.e,
}

class SafeEvalVisitor(ast.NodeVisitor):
    def visit(self, node):
        method = 'visit_' + node.__class__.__name__
        visitor = getattr(self, method, self.generic_visit)
        return visitor(node)

    def visit_Expression(self, node):
        return self.visit(node.body)

    def visit_Constant(self, node):
        if isinstance(node.value, (int, float, complex)):
            return node.value
        raise ValueError(f"Unsupported constant type: {type(node.value)}")

    def visit_UnaryOp(self, node):
        op_type = type(node.op)
        if op_type in ALLOWED_OPERATORS:
            operand = self.visit(node.operand)
            return ALLOWED_OPERATORS[op_type](operand)
        raise ValueError(f"Unsupported unary operator: {op_type}")

    def visit_BinOp(self, node):
        op_type = type(node.op)
        if op_type in ALLOWED_OPERATORS:
            left = self.visit(node.left)
            right = self.visit(node.right)
            # Prevent excessive exponentiation denial-of-service
            if op_type == ast.Pow and (isinstance(right, (int, float)) and right > 1000):
                raise ValueError("Exponent too large (max 1000)")
            return ALLOWED_OPERATORS[op_type](left, right)
        raise ValueError(f"Unsupported binary operator: {op_type}")

    def visit_Name(self, node):
        if node.id in ALLOWED_FUNCTIONS:
            return ALLOWED_FUNCTIONS[node.id]
        raise ValueError(f"Undefined identifier: {node.id}")

    def visit_Call(self, node):
        func = self.visit(node.func)
        if not callable(func):
            raise ValueError(f"Target is not a function: {func}")
        args = [self.visit(arg) for arg in node.args]
        return func(*args)

    def generic_visit(self, node):
        raise ValueError(f"Unsupported expression syntax: {node.__class__.__name__}")

class CalculatorTool(BaseTool):
    name = "calculate"
    description = (
        "Accurately perform mathematical calculations, formulas, arithmetic, "
        "trigonometry, statistics, percentages, and scientific calculations."
    )
    permission_level = PermissionLevel.READ_ONLY
    timeout_seconds = 4.0

    parameters = {
        "type": "OBJECT",
        "properties": {
            "expression": {
                "type": "STRING",
                "description": "Mathematical formula to evaluate (e.g. '10000 * (1 + 0.07)**15' or 'sqrt(144) + 25 * 4')."
            }
        },
        "required": ["expression"]
    }

    async def run(self, expression: str) -> Dict[str, Any]:
        expr = (expression or "").strip()
        if not expr:
            return {"error": "Empty expression"}

        # Replace common mathematical symbols
        cleaned = (
            expr.replace("^", "**")
            .replace("×", "*")
            .replace("÷", "/")
            .replace("π", "pi")
        )

        try:
            tree = ast.parse(cleaned, mode='eval')
            evaluator = SafeEvalVisitor()
            result = evaluator.visit(tree)

            if isinstance(result, float) and result.is_integer():
                result = int(result)

            return {
                "expression": expr,
                "result": result,
                "formatted": f"{expr} = {result}"
            }
        except ZeroDivisionError:
            return {"expression": expr, "error": "Division by zero is undefined."}
        except Exception as e:
            return {"expression": expr, "error": f"Invalid math expression: {str(e)}"}
