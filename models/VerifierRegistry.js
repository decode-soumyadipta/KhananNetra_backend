import mongoose from 'mongoose';

// ==================== MODULE-BASED PERMISSION SYSTEM ====================

// Separate collection for available permissions (dynamic registry)
const AvailablePermissionSchema = new mongoose.Schema({
  // Hierarchical permission identifier
  permissionKey: {
    type: String,
    required: true,
    unique: true,
    match: /^[A-Z_]+_[A-Z_]+$/
  },
  
  // Module categorization for better organization
  module: {
    type: String,
    required: true,
    enum: [
      "user_management", 
      "role_management", 
      "system_config", 
      "mining_operations",
      "compliance_monitoring", 
      "intelligence_analytics", 
      "data_export", 
      "public_interface",
      "audit_logs"
    ]
  },
  
  resource: {
    type: String,
    required: true
  },
  
  action: { 
    type: String, 
    required: true,
    enum: [
      "create", "read", "update", "delete", "approve", "reject", 
      "export", "manage", "execute", "verify", "escalate", 
      "delegate", "audit", "configure"
    ]
  },
  
  category: {
    type: String,
    enum: ["technical", "administrative", "intelligence", "compliance", "public", "system"],
    required: true
  },
  
  scope: {
    type: String,
    enum: ["global", "national", "state", "district", "organization", "personal"],
    default: "state"
  },
  
  severityLevel: {
    type: String,
    enum: ["low", "medium", "high", "critical"],
    default: "medium"
  },
  
  isSystemPermission: { type: Boolean, default: false },
  requiresSuperAdmin: { type: Boolean, default: false },
  autoGrantToSuperAdmin: { type: Boolean, default: true },
  
  description: {
    type: String,
    required: true
  },
  
  version: { type: String, default: "1.0" },
  deprecated: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// ==================== ENHANCED PERMISSION ASSIGNMENT SCHEMA ====================
const PermissionAssignmentSchema = new mongoose.Schema({
  permissionRef: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "AvailablePermission",
    required: true
  },
  
  permissionKey: String,
  resource: String,
  action: String,
  module: String,
  
  overrides: {
    isAllowed: { type: Boolean, default: true },
    scope: String,
    conditions: mongoose.Schema.Types.Mixed
  },
  
  grantedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
  
  approvalRequired: { type: Boolean, default: false },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  approvedAt: Date,
  
  status: { 
    type: String, 
    enum: ["active", "inactive", "paused", "revoked", "pending", "expired", "under_review"], 
    default: "active" 
  },
  
  grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  
  lastUsed: Date,
  usageCount: { type: Number, default: 0 }
}, { _id: true, timestamps: true });

// ==================== ENHANCED ROLE SCHEMA ====================
const RoleSchema = new mongoose.Schema({
  role: { 
    type: String, 
    required: true,
    unique: true,
    enum: [
      "geo_analyst", "senior_geo_officer", "ai_model_custodian",
      "district_mining_officer", "state_mining_admin",
      "ntro_nodal_officer", "intelligence_analyst",
      "system_super_admin",
      "public_user", "auditor", "research_analyst"
    ]
  },
  
  description: { type: String, required: true },
  level: { type: Number, required: true, min: 1, max: 7, index: true },
  category: {
    type: String,
    enum: ["technical", "administrative", "intelligence", "system", "public"],
    required: true
  },

  permissions: [PermissionAssignmentSchema],
  roleStatus: {
    type: String,
    enum: ["active", "inactive", "paused", "revoked", "pending", "expired", "under_maintenance"],
    default: "active"
  },
  
  isActive: { type: Boolean, default: true },
  assignedAt: { type: Date, default: Date.now },
  roleExpiresAt: { type: Date },
  
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  
  config: {
    maxConcurrentSessions: { type: Number, default: 3 },
    sessionTimeout: { type: Number, default: 3600 },
    mfaRequired: { type: Boolean, default: false },
    ipRestrictions: [String],
    accessHours: {
      start: String,
      end: String,
      timezone: { type: String, default: "Asia/Kolkata" }
    }
  }
}, { _id: true, timestamps: true });

// ==================== ENHANCED DISTRICT SCHEMA ====================
const DistrictSchema = new mongoose.Schema({
  districtName: { type: String, required: true },
  districtCode: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        // Allow formats: "MH12" (state districts), "NATIONAL", and "ALL"
        return /^[A-Z]{2}\d+$/.test(v) || v === 'NATIONAL' || v === 'ALL';
      },
      message: 'District code must be in format "MH12", "NATIONAL", or "ALL"'
    }
  },
  category: {
    type: String,
    enum: ["mining_intensive", "moderate_mining", "low_mining", "protected", "border_area", "national"],
    default: "moderate_mining"
  },
  miningData: {
    totalLeases: Number,
    activeMines: Number,
    lastSurveyDate: Date,
    complianceRate: Number,
    environmentalRisk: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium"
    }
  },
  isActive: { type: Boolean, default: true },
  activatedAt: Date,
  deactivatedAt: Date,
  districtOfficer: {
    name: String,
    contact: String,
    email: String
  }
}, { _id: true });

// ==================== ENHANCED STATE SCHEMA ====================
const StateSchema = new mongoose.Schema({
  stateName: { type: String, required: true },
  stateCode: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        // Allow formats: "MH" (states), "NATIONAL", and "ALL"
        return /^[A-Z]{2}$/.test(v) || v === 'NATIONAL' || v === 'ALL';
      },
      message: 'State code must be in format "MH", "NATIONAL", or "ALL"'
    }
  },
  region: {
    type: String,
    enum: ["north", "south", "east", "west", "central", "northeast", "national"],
    required: true
  },
  districts: [DistrictSchema],
  roles: [RoleSchema],
  stateConfig: {
    maxMiningArea: { type: Number, default: 100 },
    reportingFrequency: { 
      type: String, 
      enum: ["weekly", "biweekly", "monthly", "quarterly"],
      default: "monthly"
    },
    complianceThreshold: { type: Number, default: 0.95 },
    environmentalRules: {
      maxDepth: Number,
      bufferZone: Number,
      waterBodyProtection: { type: Boolean, default: true },
      forestAreaRestricted: { type: Boolean, default: true }
    },
    alerts: {
      violation: { type: Boolean, default: true },
      newMining: { type: Boolean, default: true },
      environmental: { type: Boolean, default: true },
      compliance: { type: Boolean, default: true }
    }
  },
  performance: {
    totalDetections: { type: Number, default: 0 },
    violationRate: Number,
    avgProcessingTime: Number,
    lastAuditDate: Date
  },
  isActive: { type: Boolean, default: true },
  activatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { _id: true, timestamps: true });

// ==================== ENHANCED VERIFIER REGISTRY SCHEMA ====================
const VerifierRegistrySchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true,
    unique: true
  },
  name: { type: String, required: true, trim: true, index: true },
  email: { type: String, required: true, trim: true, lowercase: true, index: true },
  phone: { type: String, required: true, trim: true },
  designation: { type: String, required: true },
  department: {
    type: String,
    required: true,
    enum: ["NTRO", "State_Mining", "District_Mining", "Environment", "Forest", "Revenue", "Police", "External_Auditor"]
  },
  employeeId: { type: String, sparse: true },
  states: [StateSchema],
  globalVerificationLevel: { type: Number, default: 1, min: 1, max: 5 },
  accessTier: {
    type: String,
    enum: ["basic", "standard", "premium", "enterprise", "government", "ntro_privileged"],
    default: "basic"
  },
  security: {
    mfaEnabled: { type: Boolean, default: false },
    lastPasswordChange: Date,
    passwordExpiresAt: Date,
    failedLoginAttempts: { type: Number, default: 0 },
    accountLockedUntil: Date,
    ipWhitelist: [String]
  },
  lastAccess: {
    timestamp: Date,
    ipAddress: String,
    userAgent: String
  },
  totalLogins: { type: Number, default: 0 },
  sessionHistory: [{
    loginTime: Date,
    logoutTime: Date,
    ipAddress: String,
    duration: Number
  }],
  workload: {
    activeCases: { type: Number, default: 0 },
    completedCases: { type: Number, default: 0 },
    avgProcessingTime: Number,
    performanceScore: Number
  },
  createdAt: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now },
  expiresAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  approvedAt: Date,
  status: {
    type: String,
    enum: ["active", "inactive", "suspended", "pending_approval", "expired", "under_review"],
    default: "pending_approval"
  }
}, { timestamps: true });

// ==================== ENHANCED STATIC METHODS ====================

PermissionAssignmentSchema.pre('save', function(next) {
  if (this.isModified('permissionRef') && this.populated('permissionRef')) {
    this.permissionKey = this.permissionRef.permissionKey;
    this.resource = this.permissionRef.resource;
    this.action = this.permissionRef.action;
    this.module = this.permissionRef.module;
  }
  next();
});

VerifierRegistrySchema.statics.checkPermission = async function(
  userId, resource, action, stateCode = null, districtCode = null, options = {}
) {
  const { checkExpiry = true, checkActiveStatus = true, module = null } = options;
  
  const verifier = await this.findOne({ userId })
    .populate("userId", "isActive emailVerified")
    .populate({
      path: 'states.roles.permissions.permissionRef',
      model: 'AvailablePermission'
    });
  
  if (!verifier) {
    return { hasPermission: false, reason: "User not found in registry", code: "USER_NOT_FOUND" };
  }

  if (checkActiveStatus && (!verifier.userId.isActive || verifier.status !== "active")) {
    return { hasPermission: false, reason: "User account is not active", code: "ACCOUNT_INACTIVE" };
  }

  // Check for super admin override
  const isSuperAdmin = verifier.states.some(state =>
    state.roles.some(role => role.role === "system_super_admin" && role.isActive)
  );

  if (isSuperAdmin) {
    const AvailablePermission = mongoose.model('AvailablePermission');
    const permissionExists = await AvailablePermission.findOne({
      resource, action, isActive: true, deprecated: false
    });

    if (permissionExists) {
      return { 
        hasPermission: true, 
        role: "system_super_admin",
        roleLevel: 7,
        isSuperAdmin: true,
        permission: permissionExists
      };
    }
  }

  // Check across all states and roles
  for (const state of verifier.states) {
    if (stateCode && state.stateCode !== stateCode) continue;
    if (checkActiveStatus && !state.isActive) continue;
    
    for (const role of state.roles) {
      if (checkActiveStatus && (role.roleStatus !== "active" || !role.isActive)) continue;
      
      for (const permissionAssignment of role.permissions) {
        if (checkActiveStatus && permissionAssignment.status !== "active") continue;
        
        if (checkExpiry && permissionAssignment.expiresAt && permissionAssignment.expiresAt < new Date()) {
          continue;
        }

        const permission = permissionAssignment.permissionRef;
        
        if (permission && permission.resource === resource && permission.action === action &&
            (!module || permission.module === module) && permission.isActive && !permission.deprecated) {
          
          if (districtCode) {
            const hasDistrictAccess = state.districts.some(
              district => district.districtCode === districtCode && district.isActive
            );
            if (!hasDistrictAccess) {
              return { hasPermission: false, reason: "District access denied", code: "DISTRICT_ACCESS_DENIED" };
            }
          }
          
          return { 
            hasPermission: true, 
            role: role.role,
            roleLevel: role.level,
            state: state.stateName,
            stateCode: state.stateCode,
            permission,
            assignment: permissionAssignment,
            userLevel: verifier.globalVerificationLevel
          };
        }
      }
    }
  }
  
  return { hasPermission: false, reason: "No matching permission found", code: "PERMISSION_DENIED" };
};

VerifierRegistrySchema.methods.getAllPermissions = function() {
  const permissions = [];
  for (const state of this.states) {
    if (!state.isActive) continue;
    for (const role of state.roles) {
      if (!role.isActive || role.roleStatus !== "active") continue;
      for (const assignment of role.permissions) {
        if (assignment.status !== "active") continue;
        if (assignment.permissionRef) {
          permissions.push({
            permission: assignment.permissionRef,
            assignment: assignment,
            role: role.role,
            state: state.stateCode,
            scope: assignment.overrides?.scope || assignment.permissionRef.scope
          });
        }
      }
    }
  }
  return permissions;
};

VerifierRegistrySchema.methods.hasModuleAccess = function(module) {
  return this.states.some(state =>
    state.isActive && state.roles.some(role =>
      role.isActive && role.roleStatus === "active" && role.permissions.some(assignment =>
        assignment.status === "active" && assignment.permissionRef && assignment.permissionRef.module === module
      )
    )
  );
};

VerifierRegistrySchema.methods.getJurisdictions = function() {
  const jurisdictions = { states: [], districts: [], national: false };
  
  for (const state of this.states) {
    if (!state.isActive) continue;
    jurisdictions.states.push({ stateName: state.stateName, stateCode: state.stateCode, region: state.region });
    
    for (const district of state.districts) {
      if (district.isActive) {
        jurisdictions.districts.push({
          districtName: district.districtName,
          districtCode: district.districtCode,
          stateCode: state.stateCode,
          category: district.category
        });
      }
    }
  }
  
  jurisdictions.national = this.states.some(state => 
    state.roles.some(role => 
      ["ntro_nodal_officer", "system_super_admin", "intelligence_analyst"].includes(role.role)
    )
  );
  
  return jurisdictions;
};

VerifierRegistrySchema.methods.canAccessLocation = function(stateCode, districtCode = null) {
  const jurisdictions = this.getJurisdictions();
  if (jurisdictions.national) return true;
  const hasStateAccess = jurisdictions.states.some(state => state.stateCode === stateCode);
  if (!hasStateAccess) return false;
  if (districtCode) {
    return jurisdictions.districts.some(district => 
      district.districtCode === districtCode && district.stateCode === stateCode
    );
  }
  return true;
};

VerifierRegistrySchema.methods.logAccess = function(ipAddress, userAgent, success = true) {
  this.lastAccess = { timestamp: new Date(), ipAddress, userAgent };
  if (success) {
    this.totalLogins += 1;
    this.security.failedLoginAttempts = 0;
    this.security.accountLockedUntil = null;
  } else {
    this.security.failedLoginAttempts += 1;
    if (this.security.failedLoginAttempts >= 5) {
      this.security.accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000);
    }
  }
  return this.save();
};

// ==================== MODELS EXPORT ====================
export const AvailablePermission = mongoose.model("AvailablePermission", AvailablePermissionSchema);
export default mongoose.model("VerifierRegistry", VerifierRegistrySchema);