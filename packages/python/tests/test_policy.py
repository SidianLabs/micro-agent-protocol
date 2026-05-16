# MAP Protocol - Micro Agent Protocol
#
# Copyright © 2026 Sidian Labs
# SPDX-License-Identifier: Apache-2.0

# SPDX-License-Identifier: Apache-2.0
"""
Tests for MAP Protocol policy engine.
"""

import pytest

from mapprotocol.policy import (
    PolicyCondition,
    PolicyContext,
    PolicyEffect,
    PolicyEngine,
    PolicyResult,
    PolicyRule,
    PolicyTarget,
    create_risk_based_policy,
    evaluate_task_constraints,
)
from mapprotocol.types import (
    RequesterIdentity,
    RiskLevel,
    TaskConstraints,
    TaskEnvelope,
)


class TestPolicyEngine:
    """Tests for PolicyEngine class."""

    def test_policy_engine_initialization(self):
        """Test policy engine can be initialized."""
        engine = PolicyEngine()
        assert engine is not None

    def test_add_rule(self):
        """Test adding a rule to the engine."""
        engine = PolicyEngine()
        rule = PolicyRule(
            id="rule-1",
            name="test-rule",
            effect=PolicyEffect.ALLOW,
        )
        engine.add_rule(rule)
        rules = engine.get_rules()
        assert len(rules) == 1
        assert rules[0].name == "test-rule"

    def test_add_rules(self):
        """Test adding multiple rules at once."""
        engine = PolicyEngine()
        rules = [
            PolicyRule(id="rule-1", name="rule-1", effect=PolicyEffect.ALLOW),
            PolicyRule(id="rule-2", name="rule-2", effect=PolicyEffect.DENY),
        ]
        engine.add_rules(rules)
        assert len(engine.get_rules()) == 2

    def test_remove_rule(self):
        """Test removing a rule."""
        engine = PolicyEngine()
        rule = PolicyRule(id="rule-1", name="test-rule", effect=PolicyEffect.ALLOW)
        engine.add_rule(rule)
        engine.remove_rule("rule-1")
        assert len(engine.get_rules()) == 0

    def test_clear_rules(self):
        """Test clearing all rules."""
        engine = PolicyEngine()
        engine.add_rule(
            PolicyRule(id="rule-1", name="rule-1", effect=PolicyEffect.ALLOW)
        )
        engine.add_rule(
            PolicyRule(id="rule-2", name="rule-2", effect=PolicyEffect.DENY)
        )
        engine.clear_rules()
        assert len(engine.get_rules()) == 0

    def test_set_default_effect(self):
        """Test setting default effect."""
        engine = PolicyEngine()
        engine.set_default_effect(PolicyEffect.DENY)
        assert engine._default_effect == PolicyEffect.DENY


class TestPolicyEvaluate:
    """Tests for policy evaluation."""

    def test_evaluate_no_rules(self):
        """Test evaluation with no rules returns default allow."""
        engine = PolicyEngine()
        envelope = TaskEnvelope(
            task_id="task-1",
            requester_identity=RequesterIdentity(type="user", id="user-1"),
            target_agent="agent-1",
            intent="test",
            constraints=TaskConstraints(),
            risk_class=RiskLevel.LOW,
            delegation_token="token",
            requested_output_mode="full",
        )
        result = engine.evaluate(envelope)
        assert result.effect == PolicyEffect.ALLOW

    def test_evaluate_with_allow_rule(self):
        """Test evaluation with an allow rule."""
        engine = PolicyEngine()
        rule = PolicyRule(
            id="allow-low-risk",
            name="allow-low-risk",
            effect=PolicyEffect.ALLOW,
            target=PolicyTarget(risk_class=["low"]),
        )
        engine.add_rule(rule)
        envelope = TaskEnvelope(
            task_id="task-1",
            requester_identity=RequesterIdentity(type="user", id="user-1"),
            target_agent="agent-1",
            intent="test",
            constraints=TaskConstraints(),
            risk_class=RiskLevel.LOW,
            delegation_token="token",
            requested_output_mode="full",
        )
        result = engine.evaluate(envelope)
        assert result.effect == PolicyEffect.ALLOW

    def test_evaluate_with_deny_rule(self):
        """Test evaluation with a deny rule."""
        engine = PolicyEngine()
        rule = PolicyRule(
            id="deny-high-risk",
            name="deny-high-risk",
            effect=PolicyEffect.DENY,
            target=PolicyTarget(risk_class=["high"]),
        )
        engine.add_rule(rule)
        envelope = TaskEnvelope(
            task_id="task-1",
            requester_identity=RequesterIdentity(type="user", id="user-1"),
            target_agent="agent-1",
            intent="test",
            constraints=TaskConstraints(),
            risk_class=RiskLevel.HIGH,
            delegation_token="token",
            requested_output_mode="full",
        )
        result = engine.evaluate(envelope)
        assert result.effect == PolicyEffect.DENY


class TestPolicyResult:
    """Tests for PolicyResult dataclass."""

    def test_policy_result_creation(self):
        """Test PolicyResult creation."""
        result = PolicyResult(
            effect=PolicyEffect.ALLOW,
            reason="allowed",
        )
        assert result.effect == PolicyEffect.ALLOW


class TestPolicyCondition:
    """Tests for PolicyCondition dataclass."""

    def test_policy_condition_creation(self):
        """Test PolicyCondition creation."""
        condition = PolicyCondition(
            field="risk_class",
            operator="eq",
            value="high",
        )
        assert condition.field == "risk_class"
        assert condition.operator == "eq"
        assert condition.value == "high"


class TestPolicyContext:
    """Tests for PolicyContext dataclass."""

    def test_policy_context_creation(self):
        """Test PolicyContext creation."""
        context = PolicyContext(
            requester=RequesterIdentity(type="user", id="user-1"),
            target_agent="agent-1",
            capability="payment",
            risk_class=RiskLevel.MEDIUM,
            constraints={"max_amount": 1000},
        )
        assert context.target_agent == "agent-1"
        assert context.risk_class == RiskLevel.MEDIUM


class TestCreateRiskBasedPolicy:
    """Tests for create_risk_based_policy function."""

    def test_create_risk_based_policy_engine(self):
        """Test creating risk-based policy engine."""
        engine_or_rules = create_risk_based_policy()
        if isinstance(engine_or_rules, PolicyEngine):
            assert len(engine_or_rules.get_rules()) > 0
        else:
            # It might return a list of rules
            assert len(engine_or_rules) > 0


class TestEvaluateTaskConstraints:
    """Tests for evaluate_task_constraints function."""

    def test_evaluate_task_constraints_allowed(self):
        """Test evaluating task constraints that are allowed."""
        constraints = TaskConstraints(
            common={"max_amount": 1000},
            domain={"category": "payment"},
        )
        context = PolicyContext(
            requester=RequesterIdentity(type="user", id="user-1"),
            target_agent="agent-1",
            capability="payment",
            risk_class=RiskLevel.LOW,
            constraints={},
        )
        result = evaluate_task_constraints(constraints, context)
        assert result is not None

    def test_evaluate_task_constraints_with_empty_constraints(self):
        """Test evaluating empty constraints."""
        constraints = TaskConstraints()
        context = PolicyContext(
            requester=RequesterIdentity(type="user", id="user-1"),
            target_agent="agent-1",
            capability="payment",
            risk_class=RiskLevel.LOW,
            constraints={},
        )
        result = evaluate_task_constraints(constraints, context)
        assert result is not None
