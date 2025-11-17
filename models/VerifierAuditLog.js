// models/VerifierAuditLog.js
import mongoose from 'mongoose';

// ==================== VERIFIER AUDIT LOG SCHEMA ====================
const VerifierAuditLogSchema = new mongoose.Schema({
  // Core Audit Identity
  auditId: {
    type: String,
    required: true,
    unique: true,
    default: () => `VAUDIT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },
  
  // Actor Information (Who performed the action)
  actor: {
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true,
      index: true
    },
    registryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VerifierRegistry",
      required: true,
      index: true
    },
    name: { type: String, required: true },
    email: { type: String, required: true },
    role: { type: String, required: true },
    level: { type: Number, required: true },
    department: { type: String, required: true },
    ipAddress: { type: String, required: true },
    userAgent: { type: String },
    sessionId: { type: String }
  },
  
  // Action Details (What was done)
  action: {
    type: {
      type: String,
      required: true,
      enum: [
        // Role Management
        "role_assignment", "role_modification", "role_revocation", "role_suspension",
        // Permission Management
        "permission_grant", "permission_revoke", "permission_update",
        // User Management
        "user_creation", "user_suspension", "user_reactivation", "user_deletion",
        // Access Control
        "access_attempt", "login", "logout", "session_timeout",
        // Security
        "password_change", "mfa_enabled", "mfa_disabled",
        // System Operations
        "system_config_change", "audit_log_access", "export_operation",
        // Compliance
        "compliance_check", "violation_flag", "escalation"
      ],
      index: true
    },
    resource: { 
      type: String, 
      required: true,
      enum: [
        "user_management", "role_management", "permission_management",
        "system_config", "audit_logs", "mining_analysis", "compliance_reports",
        "satellite_imagery", "volumetric_calculations", "3d_visualization"
      ]
    },
    operation: { 
      type: String, 
      required: true,
      enum: ["create", "read", "update", "delete", "approve", "reject", "export", "execute"]
    },
    description: { type: String, required: true },
    
    // Hierarchical context
    hierarchyLevel: {
      assignerLevel: Number,
      targetLevel: Number,
      levelDifference: Number
    }
  },
  
  // Target Information (On whom/what the action was performed)
  target: {
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User",
      index: true
    },
    registryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VerifierRegistry"
    },
    name: String,
    email: String,
    resourceId: mongoose.Schema.Types.ObjectId,
    resourceType: String,
    
    // State changes for comprehensive audit trail
    beforeState: {
      type: mongoose.Schema.Types.Mixed,
      required: function() {
        return ['role_assignment', 'role_modification', 'role_revocation', 'permission_grant', 'permission_revoke'].includes(this.action.type);
      }
    },
    afterState: {
      type: mongoose.Schema.Types.Mixed,
      required: function() {
        return ['role_assignment', 'role_modification', 'role_revocation', 'permission_grant', 'permission_revoke'].includes(this.action.type);
      }
    }
  },
  
  // Geographical & Jurisdictional Context
  jurisdiction: {
    stateCode: { type: String, index: true },
    districtCode: { type: String, index: true },
    stateName: String,
    districtName: String,
    scope: {
      type: String,
      enum: ["national", "state", "district", "technical"],
      required: true
    }
  },
  
  // Workflow & Approval Context
  workflow: {
    stage: {
      type: String,
      enum: ["initiated", "pending_approval", "approved", "rejected", "completed", "rolled_back"],
      default: "completed"
    },
    approvalRequired: { type: Boolean, default: false },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
    reason: {  // Required for role assignments and sensitive operations
      type: String,
      required: function() {
        return ['role_assignment', 'role_revocation', 'user_suspension'].includes(this.action.type);
      }
    },
    notes: String  // Additional context from approver
  },
  
  // Security & Compliance Metadata
  security: {
    riskLevel: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "low",
      index: true
    },
    mfaVerified: { type: Boolean, default: false },
    location: {
      country: String,
      region: String,
      city: String,
      coordinates: {
        lat: Number,
        lng: Number
      }
    },
    deviceFingerprint: String,
    threatScore: { type: Number, min: 0, max: 100, default: 0 }
  },
  
  // Performance & Result Metrics
  performance: {
    responseTime: Number, // milliseconds
    processingTime: Number, // milliseconds
    memoryUsage: Number, // MB
    databaseQueries: Number
  },
  
  // Result & Status
  result: {
    status: {
      type: String,
      enum: ["success", "failure", "partial", "pending", "rejected", "timeout"],
      required: true,
      index: true
    },
    errorCode: String,
    errorMessage: String,
    stackTrace: String, // For debugging failures
    affectedRecords: Number,
    dataSize: Number // bytes affected
  },
  
  // Retention & Archiving
  retention: {
    category: {
      type: String,
      enum: ["operational", "compliance", "security", "legal"],
      default: "operational"
    },
    retentionPeriod: {  // in days
      type: Number,
      default: 2555  // 7 years default for compliance
    },
    archiveRequired: { type: Boolean, default: false },
    archivedAt: Date
  },
  
  // Timestamps with TTL for automatic cleanup
  createdAt: { 
    type: Date, 
    default: Date.now, 
    index: true,
    expires: 220752000 // 7 years in seconds
  },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  strict: false // Allow flexible storage for state changes
});

// ==================== COMPREHENSIVE INDEXING ====================
VerifierAuditLogSchema.index({ "actor.userId": 1, "createdAt": -1 });
VerifierAuditLogSchema.index({ "target.userId": 1, "createdAt": -1 });
VerifierAuditLogSchema.index({ "action.type": 1, "result.status": 1 });
VerifierAuditLogSchema.index({ "jurisdiction.stateCode": 1, "jurisdiction.districtCode": 1 });
VerifierAuditLogSchema.index({ "security.riskLevel": 1, "createdAt": -1 });
VerifierAuditLogSchema.index({ "workflow.stage": 1 });
VerifierAuditLogSchema.index({ "retention.category": 1 });

// Compound indexes for common query patterns
VerifierAuditLogSchema.index({ 
  "actor.userId": 1, 
  "action.type": 1, 
  "createdAt": -1 
});
VerifierAuditLogSchema.index({
  "jurisdiction.stateCode": 1,
  "action.resource": 1,
  "createdAt": -1
});
VerifierAuditLogSchema.index({
  "result.status": 1,
  "security.riskLevel": 1,
  "createdAt": -1
});

// ==================== STATIC METHODS ====================
VerifierAuditLogSchema.statics.logVerifierAction = async function(auditData) {
  try {
    // Auto-calculate hierarchy level difference for role assignments
    if (auditData.action.type === 'role_assignment' && auditData.action.hierarchyLevel) {
      const { assignerLevel, targetLevel } = auditData.action.hierarchyLevel;
      auditData.action.hierarchyLevel.levelDifference = assignerLevel - targetLevel;
      
      // Auto-set risk level based on hierarchy violation
      if (auditData.action.hierarchyLevel.levelDifference < 0) {
        auditData.security.riskLevel = 'critical';
      }
    }

    const auditLog = new this(auditData);
    await auditLog.save();
    
    // Trigger real-time alerts for high-risk actions
    if (auditData.security.riskLevel === 'high' || auditData.security.riskLevel === 'critical') {
      await this.triggerSecurityAlert(auditLog);
    }
    
    return auditLog;
  } catch (error) {
    console.error('Verifier Audit logging failed:', error);
    // Fallback logging to prevent breaking main functionality
    console.log('AUDIT_FALLBACK:', JSON.stringify(auditData));
  }
};

VerifierAuditLogSchema.statics.triggerSecurityAlert = async function(auditLog) {
  // Implementation for real-time security alerts
  // This could integrate with email, SMS, or dashboard notifications
  console.log(`🚨 SECURITY ALERT: ${auditLog.action.type} by ${auditLog.actor.email} - Risk: ${auditLog.security.riskLevel}`);
};

// Method to get audit summary for a user
VerifierAuditLogSchema.statics.getUserAuditSummary = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        $or: [
          { "actor.userId": userId },
          { "target.userId": userId }
        ],
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: "$action.type",
        count: { $sum: 1 },
        lastPerformed: { $max: "$createdAt" },
        successRate: {
          $avg: {
            $cond: [{ $eq: ["$result.status", "success"] }, 1, 0]
          }
        }
      }
    },
    {
      $project: {
        actionType: "$_id",
        count: 1,
        lastPerformed: 1,
        successRate: { $multiply: ["$successRate", 100] },
        _id: 0
      }
    }
  ]);
};

// Export the model
export default mongoose.model("VerifierAuditLog", VerifierAuditLogSchema);