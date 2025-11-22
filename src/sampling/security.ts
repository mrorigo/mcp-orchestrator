import { EventEmitter } from "events";
import { SamplingCreateMessageRequest, SamplingResult, SamplingOptions } from './types.js';

/**
 * Security and Trust Manager for MCP Sampling
 * 
 * Handles:
 * - User approval workflows
 * - Logging and audit trails
 * - Rate limiting and quotas
 * - Content filtering
 * - Policy enforcement
 */
export class SamplingSecurityManager extends EventEmitter {
    private approvalQueue: Map<string, PendingApproval> = new Map();
    private rateLimits: Map<string, RateLimitTracker> = new Map();
    private auditLog: AuditEntry[] = [];
    private policies: SecurityPolicy[] = [];
    private maxQueueSize: number;
    private defaultRateLimit: RateLimitConfig;

    constructor(options: SecurityManagerOptions = {}) {
        super();
        this.maxQueueSize = options.maxQueueSize || 100;
        this.defaultRateLimit = options.defaultRateLimit || {
            requestsPerMinute: 60,
            requestsPerHour: 1000,
            requestsPerDay: 10000,
        };
    }

    /**
     * Request user approval for a sampling operation
     */
    async requestApproval(
        request: SamplingCreateMessageRequest,
        options: SamplingOptions,
        context: ApprovalContext
    ): Promise<ApprovalResult> {
        // Check rate limits first
        await this.checkRateLimit(context.origin || 'unknown');

        // Apply security policies
        const policyResult = await this.applyPolicies(request, options, context);
        if (!policyResult.approved) {
            await this.logEvent('policy_rejected', { request, context, reason: policyResult.reason });
            return {
                approved: false,
                reason: policyResult.reason,
            };
        }

        // If approval is not required, auto-approve
        if (!options.requireApproval) {
            await this.logEvent('auto_approved', { request, context });
            return { approved: true };
        }

        // Queue for user approval
        const approvalId = this.generateApprovalId();
        const pendingApproval: PendingApproval = {
            id: approvalId,
            request,
            options,
            context,
            timestamp: Date.now(),
            status: 'pending',
        };

        this.approvalQueue.set(approvalId, pendingApproval);

        // Emit event for UI integration
        this.emit('approval_requested', {
            id: approvalId,
            request: this.sanitizeForDisplay(request),
            context,
            metadata: this.generateApprovalMetadata(request, context),
        });

        // Return promise that resolves when approval is given
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.approvalQueue.delete(approvalId);
                resolve({ approved: false, reason: 'Timeout' });
            }, (options.timeoutMs || 30000));

            const checkApproval = () => {
                const approval = this.approvalQueue.get(approvalId);
                if (!approval) {
                    clearTimeout(timeout);
                    resolve({ approved: false, reason: 'Cancelled' });
                    return;
                }

                if (approval.status === 'approved') {
                    clearTimeout(timeout);
                    this.approvalQueue.delete(approvalId);
                    resolve({ approved: true });
                } else if (approval.status === 'rejected') {
                    clearTimeout(timeout);
                    this.approvalQueue.delete(approvalId);
                    resolve({ approved: false, reason: approval.rejectionReason });
                }

                setTimeout(checkApproval, 100);
            };

            checkApproval();
        });
    }

    /**
     * Approve a pending request
     */
    approveRequest(approvalId: string, modifiedRequest?: SamplingCreateMessageRequest): void {
        const approval = this.approvalQueue.get(approvalId);
        if (!approval) {
            throw new Error(`Approval request ${approvalId} not found`);
        }

        approval.status = 'approved';
        if (modifiedRequest) {
            approval.request = modifiedRequest;
        }

        this.logEvent('approved', { approvalId, originalRequest: approval.request });
    }

    /**
     * Reject a pending request
     */
    rejectRequest(approvalId: string, reason?: string): void {
        const approval = this.approvalQueue.get(approvalId);
        if (!approval) {
            throw new Error(`Approval request ${approvalId} not found`);
        }

        approval.status = 'rejected';
        approval.rejectionReason = reason || 'User rejected';

        this.logEvent('rejected', { approvalId, reason });
    }

    /**
     * Get pending approvals (for UI)
     */
    getPendingApprovals() {
        return Array.from(this.approvalQueue.values())
            .filter(approval => approval.status === 'pending')
            .map(approval => ({
                id: approval.id,
                request: this.sanitizeForDisplay(approval.request),
                context: approval.context,
                timestamp: approval.timestamp,
                metadata: this.generateApprovalMetadata(approval.request, approval.context),
            }));
    }

    /**
     * Add a security policy
     */
    addPolicy(policy: SecurityPolicy): void {
        this.policies.push(policy);
    }

    /**
     * Get audit log
     */
    getAuditLog(filter?: AuditLogFilter): AuditEntry[] {
        let filteredLog = this.auditLog;

        if (filter) {
            if (filter.origin) {
                filteredLog = filteredLog.filter(entry => entry.context?.origin === filter.origin);
            }
            if (filter.eventType) {
                filteredLog = filteredLog.filter(entry => entry.eventType === filter.eventType);
            }
            if (filter.startTime) {
                filteredLog = filteredLog.filter(entry => entry.timestamp >= filter.startTime!);
            }
            if (filter.endTime) {
                filteredLog = filteredLog.filter(entry => entry.timestamp <= filter.endTime!);
            }
        }

        return filteredLog;
    }

    /**
     * Get rate limit status for an origin
     */
    getRateLimitStatus(origin: string): RateLimitStatus {
        const tracker = this.rateLimits.get(origin) || {
            requestsThisMinute: 0,
            requestsThisHour: 0,
            requestsThisDay: 0,
            minuteWindowStart: Date.now(),
            hourWindowStart: Date.now(),
            dayWindowStart: Date.now(),
        };

        // Reset counters if windows have expired
        const now = Date.now();
        const config = this.getRateLimitConfig(origin);

        if (now - tracker.minuteWindowStart > 60000) {
            tracker.requestsThisMinute = 0;
            tracker.minuteWindowStart = now;
        }
        if (now - tracker.hourWindowStart > 3600000) {
            tracker.requestsThisHour = 0;
            tracker.hourWindowStart = now;
        }
        if (now - tracker.dayWindowStart > 86400000) {
            tracker.requestsThisDay = 0;
            tracker.dayWindowStart = now;
        }

        this.rateLimits.set(origin, tracker);

        return {
            origin,
            current: {
                minute: tracker.requestsThisMinute,
                hour: tracker.requestsThisHour,
                day: tracker.requestsThisDay,
            },
            limits: config,
            canProceed: this.checkRateLimitValues(tracker, config),
        };
    }

    private async checkRateLimit(origin: string): Promise<void> {
        const status = this.getRateLimitStatus(origin);
        if (!status.canProceed.minute || !status.canProceed.hour || !status.canProceed.day) {
            throw new Error(`Rate limit exceeded for ${origin}`);
        }

        // Update counters
        const tracker = this.rateLimits.get(origin)!;
        tracker.requestsThisMinute++;
        tracker.requestsThisHour++;
        tracker.requestsThisDay++;
    }

    private async applyPolicies(
        request: SamplingCreateMessageRequest,
        options: SamplingOptions,
        context: ApprovalContext
    ): Promise<PolicyResult> {
        for (const policy of this.policies) {
            const result = await policy.evaluate(request, options, context);
            if (!result.approved) {
                return result;
            }
        }
        return { approved: true };
    }

    private getRateLimitConfig(origin: string): RateLimitConfig {
        // In a real implementation, you'd have per-origin configs
        // For now, return the default
        return this.defaultRateLimit;
    }

    private checkRateLimitValues(tracker: RateLimitTracker, config: RateLimitConfig): {
        minute: boolean;
        hour: boolean;
        day: boolean;
    } {
        return {
            minute: tracker.requestsThisMinute < config.requestsPerMinute,
            hour: tracker.requestsThisHour < config.requestsPerHour,
            day: tracker.requestsThisDay < config.requestsPerDay,
        };
    }

    private sanitizeForDisplay(request: SamplingCreateMessageRequest) {
        // Remove or truncate sensitive content for display
        return {
            ...request,
            messages: request.messages.map(msg => ({
                ...msg,
                content: msg.content.length > 200 ? msg.content.substring(0, 200) + '...' : msg.content,
            })),
            systemPrompt: request.systemPrompt && request.systemPrompt.length > 200 ? 
                request.systemPrompt.substring(0, 200) + '...' : request.systemPrompt,
        };
    }

    private generateApprovalMetadata(request: SamplingCreateMessageRequest, context: ApprovalContext) {
        return {
            messageCount: request.messages.length,
            hasSystemPrompt: !!request.systemPrompt,
            maxTokens: request.maxTokens,
            temperature: request.temperature,
            hasTools: !!request.tools,
            origin: context.origin,
            estimatedCost: this.estimateCost(request),
        };
    }

    private estimateCost(request: SamplingCreateMessageRequest): number {
        // Simple cost estimation based on message length and max tokens
        const messageLength = request.messages.reduce((sum, msg) => sum + msg.content.length, 0);
        const estimatedTokens = Math.ceil(messageLength / 4) + (request.maxTokens || 1000);
        return estimatedTokens * 0.0001; // Rough estimate
    }

    private generateApprovalId(): string {
        return `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private logEvent(eventType: string, data: any): void {
        const entry: AuditEntry = {
            id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            eventType,
            timestamp: Date.now(),
            data,
            context: data.context,
        };

        this.auditLog.push(entry);

        // Keep only last 1000 entries to prevent memory issues
        if (this.auditLog.length > 1000) {
            this.auditLog = this.auditLog.slice(-1000);
        }

        this.emit('audit_logged', entry);
    }
}

// Types and interfaces
export interface SecurityManagerOptions {
    maxQueueSize?: number;
    defaultRateLimit?: RateLimitConfig;
}

export interface PendingApproval {
    id: string;
    request: SamplingCreateMessageRequest;
    options: SamplingOptions;
    context: ApprovalContext;
    timestamp: number;
    status: 'pending' | 'approved' | 'rejected';
    rejectionReason?: string;
}

export interface ApprovalContext {
    origin: string;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, any>;
}

export interface ApprovalResult {
    approved: boolean;
    reason?: string;
}

export interface RateLimitConfig {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
}

export interface RateLimitTracker {
    requestsThisMinute: number;
    requestsThisHour: number;
    requestsThisDay: number;
    minuteWindowStart: number;
    hourWindowStart: number;
    dayWindowStart: number;
}

export interface RateLimitStatus {
    origin: string;
    current: {
        minute: number;
        hour: number;
        day: number;
    };
    limits: RateLimitConfig;
    canProceed: {
        minute: boolean;
        hour: boolean;
        day: boolean;
    };
}

export interface AuditEntry {
    id: string;
    eventType: string;
    timestamp: number;
    data: any;
    context?: ApprovalContext;
}

export interface AuditLogFilter {
    origin?: string;
    eventType?: string;
    startTime?: number;
    endTime?: number;
}

export interface PolicyResult {
    approved: boolean;
    reason?: string;
}

export interface SecurityPolicy {
    name: string;
    description?: string;
    evaluate: (
        request: SamplingCreateMessageRequest,
        options: SamplingOptions,
        context: ApprovalContext
    ) => Promise<PolicyResult>;
}