// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2024 MAP Protocol

package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/mapprotocol/go/mapproto"
)

func main() {
	ctx := context.Background()

	signer := mapproto.NewHMACSigner(
		[]byte("your-secret-key"),
		"ethereum:0xYourAddress",
	)

	client, err := mapproto.NewClient(
		mapproto.WithBaseURL("https://api.mapprotocol.io"),
		mapproto.WithTimeout(30*time.Second),
		mapproto.WithSigner(signer),
	)
	if err != nil {
		log.Fatalf("Failed to create client: %v", err)
	}

	health, err := client.GetHealth(ctx)
	if err != nil {
		log.Fatalf("Health check failed: %v", err)
	}
	fmt.Printf("Connected to MAP Protocol API %s (status: %s)\n", health.Version, health.Status)

	taskID, err := dispatchPaymentTask(ctx, client)
	if err != nil {
		log.Fatalf("Failed to dispatch payment task: %v", err)
	}
	fmt.Printf("Dispatched payment task: %s\n", taskID)

	task, err := waitForTaskCompletion(ctx, client, taskID)
	if err != nil {
		log.Fatalf("Task failed or timed out: %v", err)
	}
	fmt.Printf("Task completed with status: %s\n", task.Status)

	if task.Receipt != nil {
		fmt.Printf("Gas used: %s, Exit code: %d\n", task.Receipt.GasUsed, task.Receipt.ExitCode)
	}
}

func dispatchPaymentTask(ctx context.Context, client *mapproto.Client) (string, error) {
	dispatchReq := mapproto.DispatchRequest{
		Envelope: mapproto.TaskEnvelope{
			Requester: mapproto.RequesterIdentity{
				Address: "0xYourAddress",
				ChainID: "ethereum",
				Metadata: map[string]interface{}{
					"app": "payment-demo",
				},
			},
			Constraints: mapproto.TaskConstraints{
				MaxBudget:    "1000000",
				MaxDuration:  300,
				RiskLevel:    mapproto.RiskLevelLow,
				RequiredTags: []string{"payment", "ethereum"},
				Timeout:      60,
			},
			Payload:   buildPaymentPayload("0xRecipient", "1000000000000000"),
			CreatedAt: time.Now().Unix(),
			ExpiresAt: time.Now().Add(5 * time.Minute).Unix(),
		},
		CallbackURL: "https://your-app.com/callback",
	}

	task, err := client.Dispatch(ctx, dispatchReq)
	if err != nil {
		return "", fmt.Errorf("dispatch failed: %w", err)
	}

	return task.ID, nil
}

func buildPaymentPayload(to string, amount string) []byte {
	return []byte(fmt.Sprintf(`{"type":"payment","to":"%s","amount":"%s"}`, to, amount))
}

func waitForTaskCompletion(ctx context.Context, client *mapproto.Client, taskID string) (*mapproto.TaskRecord, error) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	timeout := time.After(5 * time.Minute)

	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-timeout:
			return nil, mapproto.ErrTimeout
		case <-ticker.C:
			task, err := client.GetTask(ctx, taskID)
			if err != nil {
				return nil, fmt.Errorf("get task failed: %w", err)
			}

			switch task.Status {
			case mapproto.TaskStatusCompleted:
				return task, nil
			case mapproto.TaskStatusFailed:
				return task, fmt.Errorf("task failed")
			case mapproto.TaskStatusCancelled:
				return task, fmt.Errorf("task was cancelled")
			}
		}
	}
}
