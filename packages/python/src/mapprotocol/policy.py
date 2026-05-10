# SPDX-License-Identifier: Apache-2.0
"""
Policy engine for MAP Protocol.

Provides configurable rule-based policy evaluation for task constraints.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from mapprotocol.types import RequesterIdentity, RiskLevel, TaskEnvelope


class PolicyEffect(str, Enum):
    """Policy effect types."""

    ALLOW = "allow"
    DENY = "deny"
    DENY_WITH_REASON = "deny_with_reason"
    CHALLENGE = "challenge"


@dataclass
class PolicyResult:
    """Result from policy evaluation."""

    effect: PolicyEffect
    reason: Optional[str] = None
    required_approvals: Optional[List[str]] = None
    constraints_applied: Optional[Dict[str, Any]] = None
    policy_logs: Optional[List[str]] = None


@dataclass
class PolicyCondition:
    """Condition for policy rule evaluation."""

    operator: str  # "and" | "or" | "not" | "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "in" | "contains"
    field: Optional[str] = None
    value: Any = None
    conditions: Optional[List[PolicyCondition]] = None


@dataclass
class PolicyTarget:
    """Target specification for a policy rule."""

    capability: Optional[str] = None
    agent_id: Optional[str] = None
    risk_class: Optional[List[str]] = None


@dataclass
class PolicyRule:
    """A single policy rule."""

    id: str
    name: str
    description: Optional[str] = None
    target: Optional[PolicyTarget] = None
    condition: Optional[PolicyCondition] = None
    effect: PolicyEffect = PolicyEffect.ALLOW
    reason: Optional[str] = None
    priority: int = 0
    domain: Optional[str] = None  # For per-tenant policy overrides


@dataclass
class PolicyContext:
    """Context for policy evaluation."""

    requester: RequesterIdentity
    target_agent: str
    capability: str
    risk_class: RiskLevel
    constraints: Dict[str, Any]
    delegation_token_valid: bool = True
    resource_in_scope: bool = True
    time_window_valid: bool = True
    tenant_id: Optional[str] = None


class PolicyEngine:
    """
    Configurable policy engine for MAP Protocol.

    Supports rule-based evaluation with pattern matching for domains
    like "payments" (check amount thresholds), default deny/allow modes,
    and per-tenant policy overrides.
    """

    def __init__(self, default_mode: str = "default_allow"):
        """
        Initialize the policy engine.

        Args:
            default_mode: Either "default_allow" or "default_deny"
        """
        self._rules: List[PolicyRule] = []
        self._default_effect = (
            PolicyEffect.ALLOW if default_mode == "default_allow" else PolicyEffect.DENY
        )
        self._tenant_rules: Dict[str, List[PolicyRule]] = {}
        self._logs: List[str] = []

    def add_rule(self, rule: PolicyRule) -> None:
        """Add a policy rule."""
        self._rules.append(rule)
        self._rules.sort(key=lambda r: r.priority, reverse=True)

    def add_rules(self, rules: List[PolicyRule]) -> None:
        """Add multiple policy rules."""
        for rule in rules:
            self.add_rule(rule)

    def remove_rule(self, rule_id: str) -> None:
        """Remove a policy rule by ID."""
        self._rules = [r for r in self._rules if r.id != rule_id]

    def get_rules(self) -> List[PolicyRule]:
        """Get all policy rules."""
        return list(self._rules)

    def clear_rules(self) -> None:
        """Clear all policy rules."""
        self._rules = []

    def set_default_effect(self, effect: PolicyEffect) -> None:
        """Set the default effect when no rules match."""
        self._default_effect = effect

    def load_rules_from_config(self, config: Dict[str, Any]) -> None:
        """
        Load rules from a configuration dictionary.

        Args:
            config: Configuration dict with 'rules' key containing rule definitions
        """
        rules_config = config.get("rules", [])
        for rule_dict in rules_config:
            rule = self._parse_rule_from_dict(rule_dict)
            self.add_rule(rule)

        # Handle tenant-specific rules
        tenant_configs = config.get("tenant_rules", {})
        for tenant_id, tenant_rules_config in tenant_configs.items():
            tenant_rules = []
            for rule_dict in tenant_rules_config.get("rules", []):
                rule = self._parse_rule_from_dict(rule_dict)
                tenant_rules.append(rule)
            self._tenant_rules[tenant_id] = tenant_rules

    def _parse_rule_from_dict(self, rule_dict: Dict[str, Any]) -> PolicyRule:
        """Parse a PolicyRule from a dictionary configuration."""
        target = None
        if "target" in rule_dict:
            target_dict = rule_dict["target"]
            target = PolicyTarget(
                capability=target_dict.get("capability"),
                agent_id=target_dict.get("agent_id"),
                risk_class=target_dict.get("risk_class"),
            )

        condition = None
        if "condition" in rule_dict:
            condition = self._parse_condition_from_dict(rule_dict["condition"])

        return PolicyRule(
            id=rule_dict["id"],
            name=rule_dict["name"],
            description=rule_dict.get("description"),
            target=target,
            condition=condition,
            effect=PolicyEffect(rule_dict.get("effect", "allow")),
            reason=rule_dict.get("reason"),
            priority=rule_dict.get("priority", 0),
            domain=rule_dict.get("domain"),
        )

    def _parse_condition_from_dict(self, cond_dict: Dict[str, Any]) -> PolicyCondition:
        """Parse a PolicyCondition from a dictionary."""
        conditions = None
        if "conditions" in cond_dict:
            conditions = [
                self._parse_condition_from_dict(c) for c in cond_dict["conditions"]
            ]

        return PolicyCondition(
            operator=cond_dict["operator"],
            field=cond_dict.get("field"),
            value=cond_dict.get("value"),
            conditions=conditions,
        )

    def evaluate(
        self, envelope: TaskEnvelope, context: Optional[PolicyContext] = None
    ) -> PolicyResult:
        """
        Evaluate policies for a task envelope.

        Args:
            envelope: The task envelope to evaluate.
            context: Optional policy context for evaluation.

        Returns:
            PolicyResult with the decision.
        """
        self._logs = []
        self._logs.append(f"Evaluating policy for task {envelope.task_id}")
        self._logs.append(f"Risk class: {envelope.risk_class}")

        # Get applicable rules (including tenant-specific if context provided)
        applicable_rules = self._get_applicable_rules(envelope, context)

        if not applicable_rules:
            self._logs.append("No applicable rules found, applying default effect")
            return PolicyResult(
                effect=self._default_effect,
                policy_logs=self._logs,
            )

        for rule in applicable_rules:
            self._logs.append(f"Evaluating rule: {rule.name} ({rule.id})")

            if rule.condition and not self._evaluate_condition(
                rule.condition, envelope, context
            ):
                self._logs.append(f"Rule {rule.name} condition not met")
                continue

            self._logs.append(f"Rule {rule.name} matched with effect: {rule.effect}")

            if rule.effect == PolicyEffect.DENY:
                return PolicyResult(
                    effect=PolicyEffect.DENY,
                    reason=rule.reason or f"Denied by rule: {rule.name}",
                    policy_logs=self._logs,
                )

            if rule.effect == PolicyEffect.DENY_WITH_REASON:
                return PolicyResult(
                    effect=PolicyEffect.DENY_WITH_REASON,
                    reason=rule.reason or f"Denied by rule: {rule.name}",
                    policy_logs=self._logs,
                )

            if rule.effect == PolicyEffect.CHALLENGE:
                return PolicyResult(
                    effect=PolicyEffect.CHALLENGE,
                    required_approvals=["human_review"],
                    reason=rule.reason or f"Challenge required by rule: {rule.name}",
                    policy_logs=self._logs,
                )

            if rule.effect == PolicyEffect.ALLOW:
                return PolicyResult(
                    effect=PolicyEffect.ALLOW,
                    constraints_applied=self._merge_constraints(rule),
                    policy_logs=self._logs,
                )

        return PolicyResult(
            effect=self._default_effect,
            policy_logs=self._logs,
        )

    def _get_applicable_rules(
        self, envelope: TaskEnvelope, context: Optional[PolicyContext]
    ) -> List[PolicyRule]:
        """Get all rules applicable to the given envelope and context."""
        applicable = []

        # Get tenant-specific rules first (higher priority)
        if context and context.tenant_id and context.tenant_id in self._tenant_rules:
            applicable.extend(self._tenant_rules[context.tenant_id])

        # Add global rules
        for rule in self._rules:
            if self._rule_applies(rule, envelope, context):
                applicable.append(rule)

        # Sort by priority (highest first)
        applicable.sort(key=lambda r: r.priority, reverse=True)
        return applicable

    def _rule_applies(
        self, rule: PolicyRule, envelope: TaskEnvelope, context: Optional[PolicyContext]
    ) -> bool:
        """Check if a rule applies to the given envelope."""
        if not rule.target:
            return True

        target = rule.target

        # Check risk class
        if target.risk_class:
            if envelope.risk_class.value not in target.risk_class:
                return False

        # Check capability
        if target.capability:
            common_constraints = (
                envelope.constraints.common
                if envelope.constraints and hasattr(envelope.constraints, "common")
                else {}
            )
            envelope_capability = (
                common_constraints.get("capability")
                if isinstance(common_constraints, dict)
                else None
            )
            if envelope_capability != target.capability:
                return False

        # Check agent ID
        if target.agent_id and target.agent_id != envelope.target_agent:
            return False

        return True

    def _evaluate_condition(
        self,
        condition: PolicyCondition,
        envelope: TaskEnvelope,
        context: Optional[PolicyContext],
    ) -> bool:
        """Evaluate a policy condition."""
        operator = condition.operator

        if operator == "and":
            return all(
                self._evaluate_condition(c, envelope, context)
                for c in (condition.conditions or [])
            )

        if operator == "or":
            return any(
                self._evaluate_condition(c, envelope, context)
                for c in (condition.conditions or [])
            )

        if operator == "not":
            return (
                not self._evaluate_condition(condition.conditions[0], envelope, context)
                if condition.conditions
                else True
            )

        # Comparison operators
        field_value = self._get_field_value(condition.field or "", envelope, context)

        if operator == "eq":
            return field_value == condition.value
        if operator == "neq":
            return field_value != condition.value
        if operator == "gt":
            return float(field_value or 0) > float(condition.value or 0)
        if operator == "lt":
            return float(field_value or 0) < float(condition.value or 0)
        if operator == "gte":
            return float(field_value or 0) >= float(condition.value or 0)
        if operator == "lte":
            return float(field_value or 0) <= float(condition.value or 0)
        if operator == "in":
            return condition.value and field_value in condition.value
        if operator == "contains":
            if isinstance(field_value, str) and isinstance(condition.value, str):
                return condition.value in field_value
            if isinstance(field_value, list):
                return condition.value in field_value
            return False

        return False

    def _get_field_value(
        self, field: str, envelope: TaskEnvelope, context: Optional[PolicyContext]
    ) -> Any:
        """Get a field value from the envelope or context."""
        if field == "risk_class":
            return (
                envelope.risk_class.value
                if hasattr(envelope.risk_class, "value")
                else envelope.risk_class
            )
        if field == "target_agent":
            return envelope.target_agent
        if field == "requester.type":
            return (
                envelope.requester_identity.type.value
                if hasattr(envelope.requester_identity.type, "value")
                else envelope.requester_identity.type
            )
        if field == "requester.id":
            return envelope.requester_identity.id
        if field == "requester.tenant_id":
            return envelope.requester_identity.tenant_id
        if field == "delegation_token_valid":
            return context.delegation_token_valid if context else True
        if field == "resource_in_scope":
            return context.resource_in_scope if context else True
        if field == "time_window_valid":
            return context.time_window_valid if context else True

        # Handle nested constraints
        if field.startswith("constraints."):
            constraint_path = field[len("constraints.") :]
            return self._get_nested_value(
                envelope.constraints.__dict__
                if hasattr(envelope.constraints, "__dict__")
                else {},
                constraint_path,
            )

        return None

    def _get_nested_value(self, obj: Dict[str, Any], path: str) -> Any:
        """Get a nested value from a dictionary."""
        parts = path.split(".")
        current = obj
        for part in parts:
            if current and isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return None
        return current

    def _merge_constraints(self, rule: PolicyRule) -> Dict[str, Any]:
        """Merge constraints from a rule."""
        result = {}
        if rule.reason:
            result["policy_rule_id"] = rule.id
            result["policy_rule_name"] = rule.name
        return result


def create_risk_based_policy() -> List[PolicyRule]:
    """
    Create a risk-based policy with default rules.

    Returns:
        List of PolicyRule objects.
    """
    high_risk_levels = ["high", "critical"]
    low_risk_levels = ["low"]
    medium_risk_levels = ["medium"]

    return [
        PolicyRule(
            id="high-risk-approval",
            name="High Risk Requires Approval",
            description="High and critical risk tasks require human approval",
            target=PolicyTarget(risk_class=high_risk_levels),
            effect=PolicyEffect.CHALLENGE,
            reason="High risk operations require human approval",
            priority=100,
        ),
        PolicyRule(
            id="low-risk-allow",
            name="Low Risk Allowed",
            description="Low risk tasks are allowed without approval",
            target=PolicyTarget(risk_class=low_risk_levels),
            effect=PolicyEffect.ALLOW,
            priority=50,
        ),
        PolicyRule(
            id="medium-risk-moderate",
            name="Medium Risk Conditional",
            description="Medium risk tasks may proceed with additional logging",
            target=PolicyTarget(risk_class=medium_risk_levels),
            effect=PolicyEffect.ALLOW,
            priority=75,
        ),
    ]


def evaluate_task_constraints(
    envelope: TaskEnvelope, constraints: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Evaluate task constraints for validity.

    Args:
        envelope: The task envelope.
        constraints: The constraints to evaluate.

    Returns:
        Dict with 'valid' bool and 'errors' list.
    """
    errors: List[str] = []

    common = constraints.get("common", {}) if isinstance(constraints, dict) else {}

    if common:
        # Validate max_amount
        if "max_amount" in common:
            max_amount = common["max_amount"]
            if not isinstance(max_amount, (int, float)) or max_amount < 0:
                errors.append("max_amount must be a non-negative number")

        # Validate environment
        if "environment" in common:
            valid_environments = ["development", "staging", "production"]
            if common["environment"] not in valid_environments:
                errors.append("environment must be development, staging, or production")

        # Validate redaction_level
        if "redaction_level" in common:
            valid_levels = ["none", "basic", "strict"]
            if common["redaction_level"] not in valid_levels:
                errors.append("redaction_level must be none, basic, or strict")

        # Validate time_window
        if "time_window" in common:
            time_window = common["time_window"]
            if isinstance(time_window, dict):
                start = time_window.get("start")
                end = time_window.get("end")
                if start and end:
                    try:
                        from datetime import datetime

                        start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
                        end_dt = datetime.fromisoformat(end.replace("Z", "+00:00"))
                        if start_dt >= end_dt:
                            errors.append(
                                "time_window.start must be before time_window.end"
                            )
                    except (ValueError, AttributeError):
                        errors.append(
                            "time_window must contain valid ISO 8601 timestamps"
                        )

    return {
        "valid": len(errors) == 0,
        "errors": errors,
    }
