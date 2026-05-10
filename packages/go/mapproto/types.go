// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2024 MAP Protocol

package mapproto

type RiskLevel string

const (
	RiskLevelNone     RiskLevel = "none"
	RiskLevelLow      RiskLevel = "low"
	RiskLevelMedium   RiskLevel = "medium"
	RiskLevelHigh     RiskLevel = "high"
	RiskLevelCritical RiskLevel = "critical"
)

type TaskStatus string

const (
	TaskStatusPending   TaskStatus = "pending"
	TaskStatusRunning   TaskStatus = "running"
	TaskStatusCompleted TaskStatus = "completed"
	TaskStatusFailed    TaskStatus = "failed"
	TaskStatusCancelled TaskStatus = "cancelled"
)

type VisibilityMode string

const (
	VisibilityModePublic  VisibilityMode = "public"
	VisibilityModePrivate VisibilityMode = "private"
	VisibilityModeShared  VisibilityMode = "shared"
)

type ExecutionMode string

const (
	ExecutionModeAuto     ExecutionMode = "auto"
	ExecutionModeDelegate ExecutionMode = "delegate"
	ExecutionModeManual   ExecutionMode = "manual"
)

type RequesterIdentity struct {
	Address     string                 `json:"address"`
	ChainID     string                 `json:"chainId"`
	Credentials string                 `json:"credentials,omitempty"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

type TaskConstraints struct {
	MaxBudget       string    `json:"maxBudget"`
	MaxDuration     int64     `json:"maxDuration"`
	RequiredTags    []string  `json:"requiredTags,omitempty"`
	ExcludedAgents  []string  `json:"excludedAgents,omitempty"`
	PreferredAgents []string  `json:"preferredAgents,omitempty"`
	RiskLevel       RiskLevel `json:"riskLevel"`
	Timeout         int64     `json:"timeout"`
}

type TaskEnvelope struct {
	ID          string            `json:"id"`
	Requester   RequesterIdentity `json:"requester"`
	Constraints TaskConstraints   `json:"constraints"`
	Payload     []byte            `json:"payload"`
	Signature   string            `json:"signature,omitempty"`
	CreatedAt   int64             `json:"createdAt"`
	ExpiresAt   int64             `json:"expiresAt"`
}

type DelegationToken struct {
	Token     string   `json:"token"`
	IssuedAt  int64    `json:"issuedAt"`
	ExpiresAt int64    `json:"expiresAt"`
	Delegator string   `json:"delegator"`
	Scope     []string `json:"scope,omitempty"`
}

type ResultPackage struct {
	TaskID      string                 `json:"taskId"`
	Results     []byte                 `json:"results"`
	Proof       string                 `json:"proof,omitempty"`
	CompletedAt int64                  `json:"completedAt"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

type ExecutionReceipt struct {
	ID          string     `json:"id"`
	TaskID      string     `json:"taskId"`
	AgentID     string     `json:"agentId"`
	Status      TaskStatus `json:"status"`
	StartedAt   int64      `json:"startedAt"`
	CompletedAt int64      `json:"completedAt,omitempty"`
	GasUsed     string     `json:"gasUsed"`
	ExitCode    int        `json:"exitCode,omitempty"`
	Logs        []string   `json:"logs,omitempty"`
}

type InvokeResult struct {
	Success     bool   `json:"success"`
	ReturnValue []byte `json:"returnValue,omitempty"`
	Error       string `json:"error,omitempty"`
	GasUsed     string `json:"gasUsed"`
}

type DispatchRequest struct {
	Envelope    TaskEnvelope    `json:"envelope"`
	Delegation  DelegationToken `json:"delegation,omitempty"`
	CallbackURL string          `json:"callbackUrl,omitempty"`
}

type ApprovalRequest struct {
	RequestID      string                 `json:"requestId"`
	Task           TaskEnvelope           `json:"task"`
	Reason         string                 `json:"reason"`
	RequiresAction bool                   `json:"requiresAction"`
	Metadata       map[string]interface{} `json:"metadata,omitempty"`
}

type AgentDescriptor struct {
	AgentID      string            `json:"agentId"`
	Name         string            `json:"name"`
	Description  string            `json:"description"`
	Capabilities []AgentCapability `json:"capabilities"`
	Endpoint     string            `json:"endpoint"`
	PublicKey    string            `json:"publicKey,omitempty"`
	Tags         []string          `json:"tags,omitempty"`
	TrustScore   float64           `json:"trustScore"`
	RateLimit    int               `json:"rateLimit,omitempty"`
}

type TaskRecord struct {
	ID          string            `json:"id"`
	Status      TaskStatus        `json:"status"`
	Requester   string            `json:"requester"`
	Constraints TaskConstraints   `json:"constraints"`
	CreatedAt   int64             `json:"createdAt"`
	UpdatedAt   int64             `json:"updatedAt"`
	Result      *ResultPackage    `json:"result,omitempty"`
	Receipt     *ExecutionReceipt `json:"receipt,omitempty"`
}

type AgentCapability struct {
	Type        string   `json:"type"`
	Description string   `json:"description"`
	Version     string   `json:"version"`
	Endpoints   []string `json:"endpoints,omitempty"`
}
