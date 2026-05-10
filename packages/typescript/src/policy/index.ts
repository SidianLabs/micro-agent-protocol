/**
 * MAP Protocol - Policy Module
 *
 * Policy evaluation engine for task constraints
 * Copyright MAP Protocol Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RiskLevel, TaskEnvelope, RequesterIdentity } from '../types.js';

export enum PolicyEffect {
  ALLOW = 'allow',
  DENY = 'deny',
  DENY_WITH_REASON = 'deny_with_reason',
  CHALLENGE = 'challenge',
}

export interface PolicyResult {
  effect: PolicyEffect;
  reason?: string;
  required_approvals?: string[];
  constraints_applied?: Record<string, unknown>;
  policy_logs?: string[];
}

export interface PolicyRule {
  id: string;
  name: string;
  description?: string;
  target: {
    capability?: string;
    agent_id?: string;
    risk_class?: RiskLevel[];
  };
  condition?: PolicyCondition;
  effect: PolicyEffect;
  reason?: string;
  priority: number;
}

export interface PolicyCondition {
  operator: 'and' | 'or' | 'not' | 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'contains';
  field?: string;
  value?: unknown;
  conditions?: PolicyCondition[];
}

export interface PolicyContext {
  requester: RequesterIdentity;
  target_agent: string;
  capability: string;
  risk_class: RiskLevel;
  constraints: Record<string, unknown>;
  delegation_token_valid?: boolean;
  resource_in_scope?: boolean;
  time_window_valid?: boolean;
}

export class PolicyEngine {
  private rules: PolicyRule[] = [];
  private defaultEffect: PolicyEffect = PolicyEffect.ALLOW;

  addRule(rule: PolicyRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  removeRule(ruleId: string): void {
    this.rules = this.rules.filter(r => r.id !== ruleId);
  }

  getRules(): PolicyRule[] {
    return [...this.rules];
  }

  clearRules(): void {
    this.rules = [];
  }

  setDefaultEffect(effect: PolicyEffect): void {
    this.defaultEffect = effect;
  }

  evaluate(envelope: TaskEnvelope, context: Partial<PolicyContext>): PolicyResult {
    const logs: string[] = [];

    logs.push(`Evaluating policy for task ${envelope.task_id}`);
    logs.push(`Risk class: ${envelope.risk_class}, Capability: ${envelope.constraints?.common?.capability || 'unknown'}`);

    const applicableRules = this.rules.filter(rule => this.ruleApplies(rule, envelope, context));

    if (applicableRules.length === 0) {
      logs.push('No applicable rules found, applying default effect');
      return {
        effect: this.defaultEffect,
        policy_logs: logs,
      };
    }

    for (const rule of applicableRules) {
      logs.push(`Evaluating rule: ${rule.name} (${rule.id})`);

      if (rule.condition && !this.evaluateCondition(rule.condition, envelope, context)) {
        logs.push(`Rule ${rule.name} condition not met`);
        continue;
      }

      logs.push(`Rule ${rule.name} matched with effect: ${rule.effect}`);

      if (rule.effect === PolicyEffect.DENY || rule.effect === PolicyEffect.DENY_WITH_REASON) {
        return {
          effect: rule.effect,
          reason: rule.reason || `Denied by rule: ${rule.name}`,
          policy_logs: logs,
        };
      }

      if (rule.effect === PolicyEffect.CHALLENGE) {
        return {
          effect: rule.effect,
          required_approvals: ['human_review'],
          reason: rule.reason || `Challenge required by rule: ${rule.name}`,
          policy_logs: logs,
        };
      }

      if (rule.effect === PolicyEffect.ALLOW) {
        return {
          effect: PolicyEffect.ALLOW,
          constraints_applied: this.mergeConstraints(rule),
          policy_logs: logs,
        };
      }
    }

    return {
      effect: this.defaultEffect,
      policy_logs: logs,
    };
  }

  private ruleApplies(rule: PolicyRule, envelope: TaskEnvelope, _context: Partial<PolicyContext>): boolean {
    const { target } = rule;

    if (target.risk_class && target.risk_class.length > 0) {
      if (!target.risk_class.includes(envelope.risk_class)) {
        return false;
      }
    }

    if (target.capability) {
      const commonConstraints = envelope.constraints?.common as Record<string, unknown> | undefined;
      const envelopeCapability = commonConstraints?.capability as string | undefined;
      if (envelopeCapability !== target.capability) {
        return false;
      }
    }

    if (target.agent_id && target.agent_id !== envelope.target_agent) {
      return false;
    }

    return true;
  }

  private evaluateCondition(
    condition: PolicyCondition,
    envelope: TaskEnvelope,
    context: Partial<PolicyContext>
  ): boolean {
    switch (condition.operator) {
      case 'and':
        return condition.conditions!.every(c => this.evaluateCondition(c, envelope, context));

      case 'or':
        return condition.conditions!.some(c => this.evaluateCondition(c, envelope, context));

      case 'not':
        return !this.evaluateCondition(condition.conditions![0], envelope, context);

      case 'eq':
        return this.getFieldValue(condition.field!, envelope, context) === condition.value;

      case 'neq':
        return this.getFieldValue(condition.field!, envelope, context) !== condition.value;

      case 'gt':
        return Number(this.getFieldValue(condition.field!, envelope, context)) > Number(condition.value);

      case 'lt':
        return Number(this.getFieldValue(condition.field!, envelope, context)) < Number(condition.value);

      case 'gte':
        return Number(this.getFieldValue(condition.field!, envelope, context)) >= Number(condition.value);

      case 'lte':
        return Number(this.getFieldValue(condition.field!, envelope, context)) <= Number(condition.value);

      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(this.getFieldValue(condition.field!, envelope, context));

      case 'contains':
        const fieldValue = this.getFieldValue(condition.field!, envelope, context);
        if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
          return fieldValue.includes(condition.value);
        }
        if (Array.isArray(fieldValue)) {
          return fieldValue.includes(condition.value);
        }
        return false;

      default:
        return false;
    }
  }

  private getFieldValue(field: string, envelope: TaskEnvelope, context: Partial<PolicyContext>): unknown {
    switch (field) {
      case 'risk_class':
        return envelope.risk_class;
      case 'target_agent':
        return envelope.target_agent;
      case 'requester.type':
        return envelope.requester_identity.type;
      case 'requester.id':
        return envelope.requester_identity.id;
      case 'requester.tenant_id':
        return envelope.requester_identity.tenant_id;
      case 'delegation_token_valid':
        return context.delegation_token_valid ?? false;
      case 'resource_in_scope':
        return context.resource_in_scope ?? false;
      case 'time_window_valid':
        return context.time_window_valid ?? true;
      default:
        if (field.startsWith('constraints.')) {
          const constraintPath = field.substring('constraints.'.length);
          return this.getNestedValue(envelope.constraints as unknown as Record<string, unknown>, constraintPath);
        }
        return undefined;
    }
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return current;
  }

  private mergeConstraints(rule: PolicyRule): Record<string, unknown> {
    return rule.reason ? { policy_rule_id: rule.id, policy_rule_name: rule.name } : {};
  }
}

export function createRiskBasedPolicy(): PolicyRule[] {
  const highRiskLevels: RiskLevel[] = ['high', 'critical'];
  const lowRiskLevels: RiskLevel[] = ['low'];
  const mediumRiskLevels: RiskLevel[] = ['medium'];

  return [
    {
      id: 'high-risk-approval',
      name: 'High Risk Requires Approval',
      description: 'High and critical risk tasks require human approval',
      target: {
        risk_class: highRiskLevels,
      },
      effect: PolicyEffect.CHALLENGE,
      reason: 'High risk operations require human approval',
      priority: 100,
    },
    {
      id: 'low-risk-allow',
      name: 'Low Risk Allowed',
      description: 'Low risk tasks are allowed without approval',
      target: {
        risk_class: lowRiskLevels,
      },
      effect: PolicyEffect.ALLOW,
      priority: 50,
    },
    {
      id: 'medium-risk-moderate',
      name: 'Medium Risk Conditional',
      description: 'Medium risk tasks may proceed with additional logging',
      target: {
        risk_class: mediumRiskLevels,
      },
      effect: PolicyEffect.ALLOW,
      priority: 75,
    },
  ];
}

export function evaluateTaskConstraints(
  _envelope: TaskEnvelope,
  constraints: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const common = constraints.common as Record<string, unknown> | undefined;

  if (common) {
    if (common.max_amount !== undefined) {
      const maxAmount = Number(common.max_amount);
      if (isNaN(maxAmount) || maxAmount < 0) {
        errors.push('max_amount must be a non-negative number');
      }
    }

    if (common.environment) {
      const validEnvironments = ['development', 'staging', 'production'];
      if (!validEnvironments.includes(common.environment as string)) {
        errors.push('environment must be development, staging, or production');
      }
    }

    if (common.redaction_level) {
      const validLevels = ['none', 'basic', 'strict'];
      if (!validLevels.includes(common.redaction_level as string)) {
        errors.push('redaction_level must be none, basic, or strict');
      }
    }

    if (common.time_window) {
      const timeWindow = common.time_window as { start: string; end: string };
      if (timeWindow.start && timeWindow.end) {
        const start = new Date(timeWindow.start);
        const end = new Date(timeWindow.end);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          errors.push('time_window must contain valid ISO 8601 timestamps');
        } else if (start >= end) {
          errors.push('time_window.start must be before time_window.end');
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
